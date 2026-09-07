# Recommendation 구현 보고서

## 1. 기존 구조 분석

RecommendationsService가 부산 관광지 20개를 하드코딩하고 GoogleGenAI를 직접 생성했다. locationId를 DB에서 조회하지 않았으며, AI가 생성한 최종 응답을 JSON.parse 후 단순 타입 단언으로 반환했다. 이동거리·시간·일정과 시작 장소를 검증하지 않았다. Gemini 키는 OPENAI_API_KEY, 모델은 gemini-3.6-flash였다.

filming-locations, music-videos, idols, routes 서비스는 빈 클래스였다. PrismaService와 PrismaModule은 이미 존재했다. 설치된 @google/genai는 2.19.0(package.json 범위 ^2.19.0)이며 로컬 타입 정의에서 responseJsonSchema, httpOptions.timeout, retryOptions.attempts 지원을 확인했다.

## 2. 변경 Architecture

```text
POST /recommendations → AccessTokenGuard → RecommendationsController
 → RecommendationsService → RecommendationOrchestrator
   ├─ RecommendationCandidateProvider → PrismaService → DATABASE_URL PostgreSQL
   ├─ GeminiRecommendationClient → PromptBuilder + Dynamic Schema → Gemini 3.6 Flash
   ├─ AIOutputValidator → CandidatePoolGuard
   ├─ MapRouteService → GoogleMapsRouteAdapter → Google Routes API
   ├─ RouteFeasibilityValidator
   └─ CourseAssembler → { courses: [...] }
```

## 3. 생성/수정 파일

아래 경로는 src/domains/recommendations 기준이다.

| 파일 | 책임 |
| --- | --- |
| application/recommendation-orchestrator.service.ts | 전체 실행, Repair/Replan 예산, 비밀 없는 구조 로그 |
| candidate/recommendation-candidate.provider.ts | 시작 장소·관계 조회, 후보 필터링·정렬, BigInt 변환 |
| candidate/candidate-pool.guard.ts | 화이트리스트·시작 장소 재삽입·중복 검증 |
| ai/recommendation-ai-client.interface.ts | SDK와 무관한 injectable 추상 계약; 검증 전 원시 문자열 반환 |
| ai/gemini-recommendation.client.ts | Gemini SDK, 모델, API 키, HTTP timeout |
| ai/prompt-builder.service.ts | 구조화된 요청 JSON 직렬화 |
| ai/recommendation-system-instruction.ts | 고정 시작점·AI 역할·주입 방어·한국어 지침 |
| ai/recommendation-schema.factory.ts | 요청별 candidateId enum과 JSON Schema |
| ai/ai-output.validator.ts | Joi 런타임 검증, 코스 종류·순서·차별성 검증 |
| ai/network-retry.ts | 최대 두 번 네트워크 재시도, backoff+jitter |
| route/google-maps-route.adapter.ts | Google computeRoutes 호출·응답 검증 |
| route/map-route.service.ts | 코스별 구간 조회, 대중교통 구간별 출발 시각 |
| route/route-feasibility.validator.ts | 이동/총시간·중복·좌표·시작점·당일 범위 검증 |
| assembler/course-assembler.service.ts | DB 원본과 지도 값으로 최종 응답·시간 조립 |
| types/planning.type.ts | 내부 후보·초안·경로 타입, 명시적 사업 규칙 |
| types/recommendation.type.ts | 기존 필드 유지, 장소 ID·MV·체류/출발 등 선택적 확장 |
| recommendations.service.ts | Facade |
| recommendations.module.ts | DI 구성 및 PrismaModule 연결 |
| recommendation.schema.ts | 기존 경로에서 새 동적 schema factory 재노출 |
| dto/create-recommendation.dto.ts | 숫자 locationId의 안전한 정수 상한 |
| recommendations.service.spec.ts | DB/API mock 기반 회귀·실패·경계 테스트 |

추가 수정: `.env.example`, `src/config/env.validation.ts`에서 GEMINI_API_KEY 사용 및 standalone 더미 환경 덮어쓰기 제거. `package.json`의 start에서 standalone 강제 설정 제거, lint에서 --fix 제거. `src/prisma/prisma.service.ts`는 lint가 지적한 기존 줄바꿈만 정리했다. Prisma schema/다른 도메인 기능은 변경하지 않았다.

## 4. 실제 Data Flow

인증 → DTO 검증 → 시작 장소 findUnique → 존재하지 않으면 404 → 후보 findMany → 후보 전처리 → 부족하면 courses: [] → Gemini → JSON/Joi 검증 → 화이트리스트 검증 → 실제 지도 구간 계산 → 타당성 검증 → DB 원본으로 응답 조립. Controller, AuthGuard, 외부 RECOMMENDATION_FAILED 503 형식은 유지한다.

## 5. fixedStartLocation

BigInt(dto.locationId)를 조회하고 PLACE_<DB ID> 및 문자열 locationId로 변환한다. 후보에서 시작 장소를 제외한다. AI stops는 order 2부터 시작하며 시작 ID를 포함하면 거절한다. Backend가 항상 `[fixedStartLocation, ...selectedCandidates]`로 구성하므로 AI에 시작 장소를 제거할 권한이 없다. 첫 장소 체류시간은 RULES.startStay = 3600초다.

## 6. Railway DB 연동

기존 DATABASE_URL → PrismaService 연결을 사용한다. 실서버 조회/마이그레이션/데이터 변경은 수행하지 않았다.

```ts
const include = {
  musicVideos: { include: { musicVideo: { include: { idol: true } } } },
};
prisma.filmingLocation.findUnique({ where: { id: BigInt(dto.locationId) }, include });
prisma.filmingLocation.findMany({ where: { /* 시작 ID 제외 + 좌표 bounding box */ }, include, orderBy: { id: 'asc' }, take: 1000 });
```

실제 관계는 FilmingLocation.musicVideos → MusicVideoFilmingLocation.musicVideo → MusicVideo.idol이다. 후보별 별도 조회를 하지 않는다. Prisma 내부 SQL 개수는 relation loading 전략에 따르며, 애플리케이션 N+1은 없다.

도보 반경 8km, 다른 교통수단 60km. bounding box 이후 Haversine으로 후보를 줄인다. 같은 MV, 같은 Idol, PHOTO/PHOTO_SPOT 및 FOOD/CAFE를 우선한다. 최대 1000행 중 상위 40곳만 전달하므로 매우 밀집한 지역에서는 전체 최적 후보를 보장하지 않는다. Haversine 값은 최종 응답 이동정보에 사용하지 않는다.

## 7. Candidate Pool 예시

설명용 가상 DB fixture: fixedStartLocation=PLACE_10, candidatePool=[PLACE_11, PLACE_12, PLACE_13]. 운영 DB에 해당 ID가 있다고 주장하는 예시가 아니다. 시작점을 제외한 장소가 최소 3개 있어야 2개 이상의 후속 방문지를 가진 서로 다른 세 순서를 만들 수 있다. 장소 공유는 허용하고 동일 방문 순서는 금지한다. 전체 코스는 3~6곳이다.

## 8. Gemini Input 예시

다음은 실제 PromptBuilder가 받는 형태의 예시이며 비밀이나 실운영 데이터가 아니다. 시스템 지침은 별도 systemInstruction이다.

```json
{
  "userConditions": {
    "locationId": 10,
    "transportMode": "TAXI",
    "travelStyles": [
      "PHOTO",
      "FOOD"
    ],
    "startTime": "09:00",
    "availableHours": 8,
    "withPet": false,
    "partySize": 2
  },
  "fixedStartLocation": {
    "candidateId": "PLACE_10",
    "locationId": "10",
    "name": "DB 촬영지 10",
    "category": "PHOTO_SPOT",
    "description": "DB 설명",
    "businessHours": null,
    "closedDays": null,
    "address": "DB 주소",
    "latitude": 37.501,
    "longitude": 127,
    "imageUrl": null,
    "musicVideos": [
      {
        "id": "1",
        "title": "DB MV 제목",
        "youtubeUrl": null,
        "idol": {
          "id": "1",
          "name": "DB 아이돌"
        }
      }
    ]
  },
  "candidatePool": [
    {
      "candidateId": "PLACE_11",
      "locationId": "11",
      "name": "DB 촬영지 11",
      "category": "PHOTO_SPOT",
      "description": "DB 설명",
      "businessHours": null,
      "closedDays": null,
      "address": "DB 주소",
      "latitude": 37.5011,
      "longitude": 127,
      "imageUrl": null,
      "musicVideos": [
        {
          "id": "1",
          "title": "DB MV 제목",
          "youtubeUrl": null,
          "idol": {
            "id": "1",
            "name": "DB 아이돌"
          }
        }
      ]
    },
    {
      "candidateId": "PLACE_12",
      "locationId": "12",
      "name": "DB 촬영지 12",
      "category": "PHOTO_SPOT",
      "description": "DB 설명",
      "businessHours": null,
      "closedDays": null,
      "address": "DB 주소",
      "latitude": 37.5012,
      "longitude": 127,
      "imageUrl": null,
      "musicVideos": [
        {
          "id": "1",
          "title": "DB MV 제목",
          "youtubeUrl": null,
          "idol": {
            "id": "1",
            "name": "DB 아이돌"
          }
        }
      ]
    },
    {
      "candidateId": "PLACE_13",
      "locationId": "13",
      "name": "DB 촬영지 13",
      "category": "PHOTO_SPOT",
      "description": "DB 설명",
      "businessHours": null,
      "closedDays": null,
      "address": "DB 주소",
      "latitude": 37.5013,
      "longitude": 127,
      "imageUrl": null,
      "musicVideos": [
        {
          "id": "1",
          "title": "DB MV 제목",
          "youtubeUrl": null,
          "idol": {
            "id": "1",
            "name": "DB 아이돌"
          }
        }
      ]
    }
  ]
}
```

## 9. Gemini Structured Output Schema

`recommendationSchema(input.candidatePool.map(p => p.candidateId))`가 요청마다 생성된다. `responseMimeType: application/json`, `responseJsonSchema`를 사용한다. 모든 객체에서 additionalProperties=false이며 courses의 minItems/maxItems는 3, courseType enum은 A/B/C다. stops는 2~5개, order는 2부터 연속, 체류시간은 900~7200초다.

```json
{ "candidateId": { "type": "string", "enum": ["PLACE_11", "PLACE_12", "PLACE_13"] } }
```

## 10. Hallucination 방지

System Instruction에서 AI 역할을 ID 선택·순서·체류·컨셉·이유로 제한한다. 후보/사용자 텍스트는 신뢰할 수 없는 데이터임을 명시한다. 동적 enum으로 요청 후보만 허용하고, Joi로 추가 필드·잘못된 구조를 거절하며 CandidatePoolGuard가 Map.has로 다시 검사한다. 최종 장소 필드는 DB에서 재구성하므로 AI가 canonical 장소 필드를 응답에 삽입할 수 없다. AI의 자유 텍스트 추천 이유의 사실성까지 보장하는 것은 아니다. 검색/Maps grounding 도구는 연결하지 않는다.

## 11. Map / Schedule 계산

Google Routes computeRoutes의 distanceMeters와 duration만 사용한다. WALK→WALK, TAXI/CAR→DRIVE, BUS→TRANSIT(버스 선호)다. 지도 응답 없음/실패에 직선거리 대체는 없다. 세 코스는 최대 3개 동시 처리하고 각 코스의 구간은 출발 시각 의존성 때문에 순차 조회한다.

첫 장소 3600초 + AI의 검증된 체류시간 + 지도 이동시간으로 arrivalTime, departureTime, endTime, totalDurationSeconds, travelDurationSeconds를 계산한다. totalDistanceMeters는 지도 구간 합이다. 첫 장소 이전 이동은 null, homepageUrl은 DB에 원본 필드가 없어 null이다. 소수 duration은 초 단위 올림, HH:mm 표시는 분 단위 내림이다.

최대 구간 이동 90분, availableHours 및 자정 전 완료를 강제한다. 비정형 businessHours/closedDays는 원문을 제공하고 availability=unknown으로 표시한다.

지도 API 계약 참고: https://developers.google.com/maps/documentation/routes/reference/rest/v2/TopLevel/computeRoutes
대중교통 선호 규칙: https://developers.google.com/maps/documentation/routes/transit-route

## 12. Retry / Repair / Replan

- Network Retry: timeout/network/429/499/5xx에 최초 호출 + 최대 2회. 250ms, 500ms 기반 exponential backoff에 0~199ms jitter. Gemini SDK 기본 retry는 attempts=1로 꺼서 중첩 재시도를 방지한다. Gemini 요청 timeout 기본 60초(GEMINI_TIMEOUT_MS, 1~120초 설정 가능), Maps 요청 10초.
- Repair: 잘못된 JSON/스키마/알 수 없는 ID/중복/동일 코스에 요청 전체에서 최대 1회. 동일 시작점·후보·enum과 구조화된 오류 코드로 재생성한다. 검증되지 않은 원시 응답은 재주입하지 않는다.
- Replan: 실제 지도 결과가 시간 등 hard constraint를 위반할 때 최대 1회. 검증된 이전 초안과 짧은 violation만 전달한다. 지도 조회와 검증을 다시 수행한다. 재계획도 실패하면 기존 503 응답.

Repair와 Replan은 별도 예산이다. 전체 AI 논리 생성은 최대 3회, 각 네트워크 호출은 최대 3번 시도한다. Maps 장애는 AI Repair/Replan으로 처리하지 않는다.

로그는 requestId/model/candidateCount/start ID/AI·지도·전체 지연/prompt·schema version/repair·replan 횟수/정형 실패코드만 담는다. 키·DB URL·JWT·전체 prompt·SDK 원시 오류는 기록하지 않는다.

## 13. 테스트 결과

`npm run build`: 통과. `npm test -- --runInBand --silent`: 3 suites, 40 tests 통과. `npm run lint`: 오류 0. `git diff --check`: 통과. Unit Test는 Prisma/AI/Maps를 mock하며 운영 Railway DB를 호출하지 않는다. 정상 추천, 시작점 고정, 시작점 재삽입, unknown ID, 코스 개수, 중복, 동일 순서, invalid JSON, timeout/429/5xx retry, 후보 부족, Maps 실패, Replan 한도, BigInt, canonical data, 일정 초과와 자정 경계를 포함한다.

## 14. TODO / 외부 검증 및 데이터 한계

- TODO(배포 환경): GEMINI_API_KEY, GOOGLE_MAPS_API_KEY, 실제 DATABASE_URL 설정. RECOMMENDATION_STANDALONE_ENABLED=false 사용. GOOGLE Maps Routes API 활성화·결제·키 제한·지역별 교통수단 지원 및 Gemini 권한/쿼터는 실제 계정으로 검증해야 한다. 실외부 API 통합 호출은 이번 작업에서 수행하지 않았다.
- TODO(지도 지원): 운영 촬영지 좌표에서 한국 WALK/DRIVE/TRANSIT 경로 반환 여부를 검증한다. 공급자가 경로를 제공하지 않으면 현재는 503이며 다른 지도 공급자 연동은 없다.
- TODO(API 날짜 확장): DTO에 여행 날짜가 없어서 대중교통은 Asia/Seoul의 다음 startTime을 기준으로 조회한다. 날짜 선택이 필요하면 API 확장 필요. DRIVE는 기본 교통 비반영 경로이며 교통예측 실시간 보장은 없다. Google의 BUS 설정은 선호이므로 버스만 이용하는 경로를 보장하지 않는다.
- TODO(장소 데이터): 구조화된 영업일/시간, 반려동물 허용 및 인원 제한 데이터가 없다. withPet/partySize는 AI context만 제공하며 입장 가능성을 보장하지 않는다. NATURE/CULTURE/ACTIVITY/SHOPPING은 현재 3개 category enum에 직접 매핑할 정보가 부족해 하드 필터를 만들지 않았다.
- TODO(대규모 데이터): 후보 조회는 지역별 최대 1000행, 최종 40개로 제한한다. 데이터 증가 시 지리 인덱스/페이지 전략을 평가한다.
- 기존 API와 같이 생성 코스는 저장하지 않는다. 저장 기능/routes domain의 별도 구현은 이번 범위에 포함하지 않는다.

## 모델 이용 제한에 따른 변경

실제 API에서 gemini-2.5-flash 신규 사용자 이용 제한으로 404를 반환했다. 사용자 승인에 따라 gemini-3.6-flash로 변경했다. 모델 목록 등재만으로 생성 가능성을 보장하지 않으므로 실제 Structured Output 호출을 검증한다.

검증 결과: gemini-3.6-flash 실제 Adapter 호출에 가상 후보 5개를 전달해 약 28.7초 후 A/B/C 초안을 받았다. Joi 및 CandidatePoolGuard 검증 통과(후속 장소 수 3/2/2). build, lint, 4 suites·41 tests 통과. 이번 검증은 Gemini 단계이며 실제 DB→Maps 전체 요청 검증은 아니다.

HTTP 499는 취소 응답으로 GEMINI_CANCELLED로 분류하며 제한된 네트워크 재시도 대상이다. 현재 코드에는 사용자 요청 취소 전파가 없어 상위 취소 신호를 재시도하지 않는 정책은 향후 전파 구현 시 별도로 적용해야 한다. 기본 60초는 각 시도 제한이며 최대 3회 네트워크 시도로 AI 논리 호출 하나가 약 180초까지 걸릴 수 있다. 499만으로 클라이언트 timeout이 원인이라고 확정할 수는 없다.


### TAXI/CAR 국내 자동차 경로 연동

요청 transportMode와 외부 응답 필드는 유지한다. TAXI/CAR는 KakaoMobilityRouteAdapter의 카카오모빌리티 자동차 길찾기로 조회한다. WALK/BUS는 기존 Google 경로를 사용한다(WALK의 한국 지원 제한은 그대로).

`GET https://apis-navi.kakaomobility.com/v1/directions`에 경도,위도 순서로 origin/destination을 전달하고 summary=true로 조회한다. 성공 result_code=0의 summary.distance(미터), summary.duration(초)를 기존 RouteLeg에 매핑한다. 현재 교통 기준 예상시간이며 요청 startTime의 미래 교통 예측이나 택시 대기시간은 포함하지 않는다. 이동시간을 임의 생성하거나 Google DRIVE로 대체하지 않는다.

설정: `.env` 및 Railway에 `KAKAO_MOBILITY_API_KEY`를 추가한다. 카카오모빌리티 길찾기 사용 권한이 있는 카카오 REST API 키를 사용한다. 값이 없으면 TAXI/CAR 요청은 Gemini 호출 전에 KAKAO_API_KEY_MISSING으로 실패한다. 다른 모드의 기동을 막지 않도록 전역 필수 환경변수는 아니다. 키 값은 저장소나 로그에 기록하지 않는다.

카카오 HTTP 오류, 경로 없음, 응답 형식 오류는 각각 KAKAO_HTTP_<status>, KAKAO_ROUTE_NOT_FOUND, KAKAO_INVALID_RESPONSE로 구분한다. 외부 503 RECOMMENDATION_FAILED 계약은 유지한다. 네트워크 재시도는 기존 제한 정책을 재사용한다.

공식 API: https://developers.kakaomobility.com/guide/navi-api/directions.html
