# Idolog 프론트엔드 연동 API 명세 (구현 대상)

상태: **구현 전 계약 초안**  
근거: [`idolog-project/frontend`](https://github.com/idolog-project/frontend)의 `src/api/schemas.ts`, `src/api/endpoints.ts`, `src/api/client.ts`  
OpenAPI: [swagger.yaml](./swagger.yaml)

이 문서는 프론트엔드가 실제로 필요로 하는 요청 경로와 Zod 스키마를 기준으로 작성했다. 구현 전 팀 합의가 필요한 항목은 아래의 `연동 결정 사항`에 표시한다.

## 연동 결정 사항

| 항목 | 프론트엔드 현 상태 | 백엔드 현 상태 | 구현 기준 |
| --- | --- | --- | --- |
| Base URL | `/api` | `/api/v1` | 백엔드는 `/api/v1`을 유지하고, 프론트 `BASE_URL`을 `/api/v1`로 변경한다. |
| 성공/오류 형식 | 응답 본문을 바로 파싱 | `{ isSuccess, code, message, result }` 래퍼 | 백엔드 공통 응답 형식을 유지하고 프론트에서 `result`를 언래핑한다. 오류는 현재 형식 그대로 `code`, `message`를 최상위에 둔다. |
| Google 로그인 | `POST /auth/oauth/google` 임시 호출과 `/api/oauth/google` 리다이렉트 상수가 공존 | 미구현 | 브라우저 리다이렉트 방식 `GET /auth/oauth/google`을 정식으로 사용한다. 콜백은 서버 내부 경로이며 프론트가 직접 호출하지 않는다. |
| Refresh token | HttpOnly Cookie 예상 | 환경변수 존재, 미구현 | `SameSite=Lax`, `HttpOnly`, `Secure(운영)` 쿠키로 발급한다. `POST /auth/refresh`는 body 없이 access token만 반환한다. |

아래의 `응답 데이터`는 공통 성공 응답의 `result` 값이다. 즉 실제 성공 응답은 항상 다음과 같다.

```json
{
  "isSuccess": true,
  "code": "COMMON200",
  "message": "요청에 성공했습니다.",
  "result": {}
}
```

## 공통 규칙

- Base URL: `/api/v1`
- 콘텐츠 타입: `application/json`
- 인증: 필요한 요청에 `Authorization: Bearer <accessToken>` 헤더를 보낸다.
- 언어: `Accept-Language: ko`, `en`, `zh-Hans`를 보낸다. 서버는 오류 메시지를 해당 언어로 반환한다.
- 식별자: DB `BigInt`는 JSON에서 안전하게 사용할 수 있도록 문자열이 아닌 **number 범위의 ID**로 변환해 응답한다. 범위를 넘길 가능성이 생기면 전체 계약을 string ID로 전환한다.
- 시간: 날짜는 `YYYY-MM-DD`, 시각은 `HH:mm`, 일시는 ISO 8601 UTC 문자열을 사용한다.
- 성공 없는 삭제는 `204 No Content`로 반환한다.

## API 목록

| 기능 | 메서드 | 경로 | 인증 |
| --- | --- | --- | --- |
| Google 로그인 시작 | GET | `/auth/oauth/google` | 아니오 |
| 토큰 갱신 | POST | `/auth/refresh` | Refresh cookie |
| 로그아웃 | POST | `/auth/logout` | Refresh cookie |
| 내 정보 | GET | `/auth/me` | 예 |
| 아이돌 목록 | GET | `/idols?query=` | 아니오 |
| 아이돌별 촬영지 | GET | `/idols/{idolId}/locations` | 아니오 |
| 전체 촬영지 | GET | `/locations?category=&idolId=` | 아니오 |
| 촬영지 상세 | GET | `/locations/{locationId}` | 아니오 |
| 코스 추천 | POST | `/recommendations` | 예 |
| 저장 코스 목록 | GET | `/courses` | 예 |
| 코스 저장 | POST | `/courses` | 예 |
| 저장 코스 삭제 | DELETE | `/courses/{courseId}` | 예 |

## 인증

### GET `/auth/oauth/google`

Google OAuth 동의를 시작한다. `302`로 Google 인증 페이지로 이동한다. 로그인 성공 후 서버는 refresh cookie를 설정하고, 프론트 콜백 URL로 `accessToken`을 전달하거나 일회성 code를 전달한다. **권장안은 URL 토큰 노출을 피하기 위해 code를 전달한 뒤 서버가 refresh cookie를 기반으로 `/auth/refresh`를 호출하는 방식**이다.

### POST `/auth/refresh`

Body 없이 refresh cookie로 access token을 재발급한다.

응답 데이터:

```json
{ "accessToken": "eyJ..." }
```

`401 UNAUTHENTICATED`이면 쿠키가 없거나 만료된 상태다.

### POST `/auth/logout`

Refresh cookie를 삭제한다. 성공 시 `204`를 반환한다.

### GET `/auth/me`

응답 데이터:

```json
{ "id": 1, "email": "fan@idolog.kr", "nickname": "봄날의팬" }
```

## 탐색

### GET `/idols?query=`

아이돌 목록을 반환한다. `query`는 이름 검색용 선택 문자열이다.

응답 데이터:

```json
{
  "idols": [
    {
      "id": 1,
      "name": "BTS",
      "agency": "빅히트 뮤직",
      "imageUrl": "https://...",
      "locationCount": 10
    }
  ]
}
```

### GET `/idols/{idolId}/locations`

해당 아이돌의 뮤직비디오와 연결된 촬영지 목록을 반환한다. 존재하지 않는 `idolId`는 `404 NOT_FOUND`다.

### GET `/locations?category=&idolId=`

지도에 표시할 전체 촬영지를 반환한다. `category`는 `MV_SPOT`, `CAFE`, `PHOTO_SPOT` 중 하나이며 선택값이다. `idolId`도 선택값이며, 지정하면 해당 아이돌 관련 촬영지만 반환한다.

### GET `/locations/{locationId}`

촬영지 상세를 반환한다. 목록과 상세 모두 `FilmingLocation` 형식을 사용한다.

```json
{
  "id": 1,
  "name": "주문진 방파제 버스정류장",
  "category": "MV_SPOT",
  "address": "강원 강릉시 주문진읍 향호리 8-8",
  "latitude": 37.8983,
  "longitude": 128.8322,
  "imageUrl": "https://...",
  "description": "촬영지 설명",
  "musicVideos": [
    {
      "id": 1,
      "title": "Spring Day",
      "idolId": 1,
      "releaseDate": "2017-02-13",
      "youtubeUrl": "https://www.youtube.com/..."
    }
  ]
}
```

## 코스 추천

### POST `/recommendations`

촬영지를 출발지로 하여 TourAPI 장소와 이동 시간을 반영한 추천 코스들을 생성한다. 외부 API와 AI 호출로 약 10~30초가 걸릴 수 있으므로, 프론트는 AbortSignal 취소를 지원한다.

요청 본문:

```json
{
  "locationId": 1,
  "transportMode": "TAXI",
  "travelStyles": ["PHOTO", "FOOD"],
  "startTime": "09:00",
  "availableHours": 8,
  "withPet": false,
  "partySize": 2
}
```

| 필드 | 필수 | 제약 |
| --- | --- | --- |
| `locationId` | 예 | 존재하는 촬영지 ID |
| `transportMode` | 예 | `WALK`, `TAXI`, `BUS`, `CAR` |
| `travelStyles` | 예 | `NATURE`, `CULTURE`, `ACTIVITY`, `FOOD`, `SHOPPING`, `PHOTO` 중 1개 이상 |
| `startTime` | 아니오 | `HH:mm` |
| `availableHours` | 아니오 | 2~12 정수 |
| `withPet` | 아니오 | boolean |
| `partySize` | 아니오 | 1~10 정수 |

응답 데이터:

```json
{ "courses": [/* Course 배열 */] }
```

조건에 맞는 코스가 없으면 오류가 아닌 `{ "courses": [] }`를 반환한다. 추천 엔진·외부 관광 API 장애는 `503 RECOMMENDATION_FAILED`를 반환한다.

## 저장 코스

### GET `/courses`

로그인 사용자가 저장한 코스를 최신 저장순으로 반환한다.

응답 데이터: `{ "courses": [/* Course 배열 */] }`

### POST `/courses`

추천 결과 중 하나를 저장한다. 같은 `course.id`를 다시 저장해도 성공으로 처리하는 멱등 API이며 중복 생성하지 않는다.

요청 본문:

```json
{
  "locationId": 1,
  "course": { /* 아래 Course 형식 */ }
}
```

응답 데이터: 저장된 `Course` 1개. 새로 저장하면 `201`, 기존 저장본이면 `200`을 반환한다.

### DELETE `/courses/{courseId}`

내 저장 코스를 삭제한다. 성공 시 `204`를 반환한다. 없는 코스 또는 다른 사용자의 코스는 `404 NOT_FOUND`로 처리한다.

## 데이터 모델

### Course

```json
{
  "id": "course-north-coast",
  "title": "파도만 따라가는 길",
  "summary": "코스 한 줄 설명",
  "reason": "추천 사유",
  "places": [/* CoursePlace 배열, order 오름차순 */],
  "totalDistanceMeters": 23000,
  "totalDurationSeconds": 37800,
  "travelDurationSeconds": 2400,
  "startTime": "08:00",
  "endTime": "18:30"
}
```

`CoursePlace`는 `order`, `name`, `address`, `latitude`, `longitude`, `imageUrl`, `overview`, `homepageUrl`, `arrivalTime`, `category`, `distanceFromPrevMeters`, `durationFromPrevSeconds`를 가진다. 첫 장소의 이전 이동 거리·시간은 `null`이다.

## 오류 코드

모든 오류는 아래 형식으로 반환한다. (기존 전역 예외 필터와 호환)

```json
{ "isSuccess": false, "code": "UNAUTHENTICATED", "message": "로그인이 필요합니다.", "result": null }
```

| 상태 | 코드 | 용도 |
| --- | --- | --- |
| 400 | `COMMON400` | 요청값 검증 실패 |
| 401 | `UNAUTHENTICATED` | access token 또는 refresh cookie 없음/만료 |
| 404 | `NOT_FOUND` | 촬영지·아이돌·저장 코스 없음 |
| 409 | `DUPLICATE_EMAIL` | 이메일 가입을 유지하는 경우의 중복 이메일 |
| 503 | `RECOMMENDATION_FAILED` | 추천/TourAPI/OpenAI 호출 실패 |
