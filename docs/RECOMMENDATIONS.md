# Recommendation 구현 보고서

## 1. 현재 역할 경계

MVP 역할 분담에 맞춰 추천 파이프라인의 후보 생성 책임을 분리했다.

- Recommendation 전처리 영역: TourAPI 조회 및 관광지 후보 필터링
- AI Recommendation 영역: 필터링 완료 후보를 AI에 전달하고 A/B/C 3개 코스를 생성·검증·반환
- 지도 영역: 실제 이동거리/이동시간 계산

RecommendationCandidateProvider는 더 이상 DB에서 주변 촬영지를 findMany로 조회하거나 자체 거리/스타일 랭킹을 만들지 않는다.
DB는 사용자가 선택한 시작 촬영지의 canonical 데이터를 확인하는 용도로만 사용한다.
후속 후보는 TourismService가 반환한 필터링 완료 TourAPI 관광지만 사용한다.

## 2. 현재 Architecture

```text
POST /recommendations
 → AccessTokenGuard
 → RecommendationsController
 → RecommendationsService
 → RecommendationOrchestrator
   ├─ RecommendationCandidateProvider
   │   ├─ PrismaService: 선택한 시작 촬영지 1건 조회
   │   └─ TourismService: TourAPI 조회 + 후보 전처리
   │        └─ filtered TourAPI candidates
   ├─ GeminiRecommendationClient
   │   ├─ PromptBuilder
   │   └─ Dynamic JSON Schema
   ├─ AIOutputValidator
   ├─ CandidatePoolGuard
   ├─ MapRouteService
   │   ├─ TAXI/CAR → Kakao Mobility
   │   └─ WALK/BUS → Google Routes API
   ├─ RouteFeasibilityValidator
   └─ CourseAssembler
        └─ { courses: [A, B, C] }
```

## 3. 실제 Data Flow

```text
인증/DTO 검증
 → Prisma로 시작 촬영지 조회
 → 없으면 404
 → fixedStartLocation 생성
 → TourismService에 시작 좌표 + 이동수단 + 여행스타일 전달
 → TourAPI locationBasedList2 호출
 → 백엔드 후보 전처리
 → RecommendationCandidateProvider가 TOUR_<contentId> 형태로 AI 후보 변환
 → 후보 부족 시 { courses: [] }
 → AI에 fixedStartLocation + candidatePool + 사용자 조건 전달
 → A/B/C 3개 코스 초안
 → JSON/Joi/화이트리스트/중복/차별성 검증
 → Backend가 시작 촬영지를 각 코스 맨 앞에 삽입
 → 실제 지도 API 계산
 → 일정 타당성 검증
 → CourseAssembler 최종 결과 반환
```

## 4. RecommendationCandidateProvider 책임

현재 책임은 두 가지뿐이다.

1. `locationId`에 해당하는 시작 촬영지를 Prisma에서 조회하고 canonical 데이터로 변환
2. `TourismService.getFilteredCandidates()`가 반환한 관광지를 AI 후보 형식으로 변환

주변 후보를 `filmingLocation.findMany()`로 조회하지 않는다.
Haversine 기반 자체 후보 랭킹도 제거했다.

시작점 ID 예시:

```text
PLACE_10
```

TourAPI 후보 ID 예시:

```text
TOUR_126508
TOUR_264337
```

AI는 `TOUR_*` candidateId만 선택하며, 실제 `contentId`, 장소명, 좌표, 이미지 등은 Backend가 보유한다.

## 5. TourismService 전처리

현재 구현은 한국관광공사 TourAPI 국문 관광정보 서비스의 `locationBasedList2`를 사용한다.

```text
GET https://apis.data.go.kr/B551011/KorService2/locationBasedList2
```

전달 기준:

- WALK: 시작 촬영지 반경 3km
- TAXI/BUS/CAR: 시작 촬영지 반경 30km
- 유효한 좌표가 있는 장소만 허용
- 대표 이미지가 있는 장소만 허용
- 시작 촬영지와 동일한 장소 제외
- 여행 스타일을 TourAPI `cat1` 대분류와 매핑
- 최대 40개를 Recommendation 도메인에 전달

스타일 매핑:

```text
NATURE   → A01
CULTURE  → A02
ACTIVITY → A03
SHOPPING → A04
FOOD     → A05
PHOTO    → 대표 이미지가 있는 후보 전체에서 AI가 선택
```

`PHOTO` 단독 선택은 이미지가 있는 장소를 폭넓게 후보로 허용한다.

### 전처리 확장 지점

기획서에 있는 운영시간/휴무일/주차/반려동물 상세 조건은 TourAPI 상세 API를 이용해 TourismService에서 추가 필터링할 영역이다.
Recommendation/AI 도메인은 이 상세 필터를 다시 수행하지 않는다.

현재 타입에는 다음 필드를 유지해 두었다.

```text
businessHours
closedDays
homepageUrl
```

따라서 전처리 파트에서 `detailIntro2`, `detailPetTour2`, `detailCommon2` 등을 붙여도 AI Recommendation 코드 구조는 바꿀 필요가 없다.

## 6. AI Recommendation 입력

AI에 전달되는 candidatePool은 더 이상 DB 촬영지 목록이 아니다.
TourismService가 전처리한 TourAPI 관광지 목록이다.

예시:

```json
{
  "userConditions": {
    "locationId": 10,
    "transportMode": "TAXI",
    "travelStyles": ["PHOTO", "FOOD"],
    "startTime": "09:00",
    "availableHours": 8
  },
  "fixedStartLocation": {
    "source": "FILMING_LOCATION",
    "candidateId": "PLACE_10",
    "locationId": "10",
    "name": "사용자가 선택한 촬영지"
  },
  "candidatePool": [
    {
      "source": "TOUR_API",
      "candidateId": "TOUR_126508",
      "tourContentId": "126508",
      "name": "관광지 A",
      "category": "CULTURE",
      "address": "서울 ...",
      "latitude": 37.5,
      "longitude": 127.0,
      "imageUrl": "https://...",
      "musicVideos": []
    }
  ]
}
```

## 7. AI 역할

AI는 장소 데이터베이스가 아니다.
다음만 수행한다.

- 후보 중 방문할 관광지 선택
- 방문 순서 결정
- A/B/C 세 코스의 컨셉 구성
- 추천 이유 작성
- 권장 체류시간 제안

AI가 생성하면 안 되는 값:

- 존재하지 않는 장소
- 장소명/주소/좌표/이미지의 임의 생성 또는 수정
- 실제 이동거리/이동시간
- 최종 도착/출발 시각
- 총 거리/총 소요시간

## 8. 코스 A/B/C

TourAPI 후보 구조에 맞게 시스템 지침을 수정했다.

- A: 촬영지 연계 코스 — 시작 촬영지 경험과 사용자 여행 스타일에 잘 이어지는 장소
- B: 이동 효율 코스 — 이동 효율을 우선하면서 여행 스타일 반영
- C: 색다른 발견 코스 — 후보 중 다양성과 발견성 우선

기존의 "같은 MV/같은 아이돌 후보 우선" 규칙은 제거했다.
후속 후보가 TourAPI 일반 관광지이기 때문에 같은 MV/아이돌 관계가 존재하지 않기 때문이다.

## 9. Structured Output / Hallucination 방지

`recommendationSchema(input.candidatePool.map(p => p.candidateId))`를 요청마다 만든다.

예시:

```json
{
  "candidateId": {
    "type": "string",
    "enum": ["TOUR_126508", "TOUR_264337", "TOUR_987654"]
  }
}
```

AI가 enum 밖의 ID를 내면 구조화 출력 단계 또는 CandidatePoolGuard에서 거절된다.

추가 검증:

- 코스 정확히 3개
- A/B/C 각각 하나
- 시작 촬영지 반복 금지
- 후보에 없는 ID 금지
- 한 코스 내 중복 장소 금지
- order는 2부터 연속
- 세 코스의 방문 순서가 완전히 동일하면 실패
- 체류시간 범위 검증

## 10. fixedStartLocation

사용자가 선택한 촬영지는 모든 코스의 첫 장소로 Backend가 강제한다.
AI에게 시작 촬영지를 선택하거나 제거할 권한이 없다.

```ts
const locations = [input.fixedStartLocation, ...selectedCandidates];
```

AI stops는 `order: 2`부터 시작한다.

## 11. Map / Schedule

- TAXI/CAR: Kakao Mobility 자동차 길찾기
- WALK/BUS: Google Routes API

AI가 선택한 순서를 실제 지도 API로 계산한 뒤 다음을 검증한다.

- 사용 가능 시간 초과
- 자정 이후 종료
- 과도한 구간 이동시간
- 중복 장소
- 잘못된 좌표
- 시작 촬영지 변경 여부

지도 계산 후 문제가 있으면 최대 1회 Replan한다.
길찾기 결과가 없는 구간도 출발·도착 후보 ID를 AI에 전달해 최대 1회 Replan한다.
동시에 계산 중인 코스가 모두 끝난 후 재계획하며, 인증 오류나 지도 서비스 장애는 재계획하지 않는다.

AI 입력의 `planningConstraints`에는 시작 촬영지 체류시간(1시간), 후속 장소 수(2~5개),
체류시간 범위, 사용 가능 시간과 자정 제한을 반영한 전체 일정 예산을 명시한다.
운영시간이나 반려동물 허용 여부가 후보 데이터에 없으면 AI가 확인된 사실로 안내하지 않도록 한다.

## 12. Repair / Replan

Repair 최대 1회:

- invalid JSON
- Schema 위반
- 후보 밖 ID
- 중복 장소
- 동일 코스
- 순서 오류

Repair에는 오류 코드와 직전 응답(최대 32,000자)을 함께 전달한다.

Replan 최대 1회:

- 실제 경로가 사용 가능 시간을 초과
- 한 구간 이동이 너무 김
- 당일 완료 불가
- 지도에서 이동 가능한 경로를 찾지 못한 구간

시간 초과와 이동 불가 재계획은 합산해서 최대 1회이며, API 인증·권한 오류에는 적용하지 않는다.

## 13. 최종 응답

TourAPI 후보는 `locationId` 대신 `tourContentId`를 가질 수 있다.
시작 촬영지는 기존 DB `locationId`를 유지한다.

예시:

```json
{
  "order": 2,
  "candidateId": "TOUR_126508",
  "tourContentId": "126508",
  "name": "관광지 A",
  "address": "서울 ...",
  "latitude": 37.5,
  "longitude": 127.0,
  "imageUrl": "https://...",
  "distanceFromPrevMeters": 1200,
  "durationFromPrevSeconds": 420
}
```

## 14. 검증 상태

첨부 프론트의 `src/api/schemas.ts`, `endpoints.ts`, `client.ts` 계약과 대조했다.
외부 경로는 `POST /api/v1/recommendations` 하나이며 성공 상태는 HTTP 200이다.
응답은 공통 `{ isSuccess, code, message, result }` 봉투 안에 `result.courses`로 제공한다.
최종 결과는 서로 다른 A/B/C 코스 3개이고, 후보 부족 시 빈 배열이다.

```text
npm run build   → 통과
npm run lint    → 통과
npm test -- --runInBand --silent → 7 suites / 85 tests 통과
```

HTTP 통합 테스트는 실제 Nest 컨트롤러, JWT Guard, DTO 검증, 추천 파이프라인,
응답 인터셉터와 예외 필터를 실행한다. 외부 후보 조회·AI·지도 호출만 테스트 대역으로 교체한다.
성공 응답, 3개 경로 차별성, 인증 실패, 잘못된 입력, 후보 부족, 촬영지 없음,
외부 서비스 실패 시 비공개 오류 내용이 노출되지 않는 것을 확인한다.
제한된 실행 환경에서는 HTTP 테스트용 로컬 포트 열기 권한이 필요하다.

## 15. 실제 연동 조건과 전처리 범위

- 전처리 파트에서 운영시간/휴무/주차/반려동물 상세 필터 추가
- 필요 시 `detailCommon2`를 이용해 overview/homepage 보강
- 현재 AI 구현체는 Gemini이다. 기획서의 공급자 표기를 이유로 기존 구현체를 변경하지 않았다.
- TAXI/CAR에는 `KAKAO_MOBILITY_API_KEY`, WALK/BUS에는 `GOOGLE_MAPS_API_KEY`가 필요하다.
- 실제 DB + TourAPI + 지도 API + Gemini 전체 호출은 이번 자동 테스트에 포함되지 않는다.
- `.env`의 키 설정 여부만 확인했으며 키 값을 출력하거나 변경하지 않았다.
