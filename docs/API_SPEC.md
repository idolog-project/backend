# Idolog API 명세

최종 수정일: 2026-08-10  
API 버전: `v1`

## 기본 정보

- 개발 서버: `http://localhost:3000`
- API Base URL: `http://localhost:3000/api/v1`
- Swagger UI: `http://localhost:3000/api-docs`
- OpenAPI 원본: [swagger.yaml](./swagger.yaml)
- 콘텐츠 타입: `application/json; charset=utf-8`

모든 API는 `/api/v1` prefix를 사용합니다. 현재 실제 구현 및 공개된 API는 아래 상태 확인 API입니다. `auth`, `users`, `idols` 등 도메인 컨트롤러는 아직 HTTP 메서드가 구현되지 않아 호출할 수 없습니다.

## 공통 응답 형식

### 성공

```json
{
  "isSuccess": true,
  "code": "COMMON200",
  "message": "요청에 성공했습니다.",
  "result": {}
}
```

`result`에는 API별 응답 데이터가 들어가며, 데이터가 없으면 `null`입니다.

### 오류

```json
{
  "isSuccess": false,
  "code": "COMMON400",
  "message": "오류 설명",
  "result": null
}
```

| HTTP 상태 | 코드 | 의미 |
| --- | --- | --- |
| 400 | `COMMON400` | 잘못된 요청 또는 요청 검증 실패 |
| 401 | `COMMON401` | 인증 필요 또는 인증 실패 |
| 403 | `COMMON403` | 권한 없음 |
| 404 | `COMMON404` | 리소스를 찾을 수 없음 |
| 405 | `COMMON405` | 허용되지 않은 HTTP 메서드 |
| 409 | `COMMON409` | 리소스 충돌 |
| 422 | `COMMON422` | 요청을 처리할 수 없음 |
| 500 | `COMMON500` | 서버 내부 오류 |
| 503 | `COMMON503` | 서비스 이용 불가 |

Nest의 요청 검증 오류는 `message`에 여러 문구가 쉼표로 연결되어 반환될 수 있습니다.

## 인증

향후 인증이 필요한 API는 다음 헤더를 사용합니다. JWT 인증 로직은 아직 구현 전이므로 현재 공개 API에는 토큰이 필요하지 않습니다.

```http
Authorization: Bearer <access-token>
```

## API 목록

| 메서드 | 경로 | 인증 | 설명 | 구현 상태 |
| --- | --- | --- | --- | --- |
| GET | `/health` | 불필요 | 서버 상태 확인 | 구현됨 |

### GET `/health`

서버가 정상적으로 요청을 처리하는지 확인합니다.

#### 요청

요청 본문과 쿼리 파라미터가 없습니다.

#### 성공 응답 — 200

```json
{
  "isSuccess": true,
  "code": "COMMON200",
  "message": "서버가 정상적으로 동작 중입니다.",
  "result": {
    "status": "ok"
  }
}
```

#### 호출 예시

```bash
curl http://localhost:3000/api/v1/health
```

## Swagger 관리

Nest 애플리케이션이 실행 중이면 Swagger UI는 `/api-docs`에서 제공됩니다. 저장소에서 확인하거나 외부 도구로 import할 수 있도록 동일한 OpenAPI 3.0 명세를 [docs/swagger.yaml](./swagger.yaml)에 저장합니다.

새 API를 추가할 때는 다음을 함께 갱신합니다.

1. 컨트롤러의 `@ApiTags`, `@ApiOperation`, 응답/요청 DTO Swagger 데코레이터
2. `docs/swagger.yaml`
3. 이 문서의 API 목록 및 요청·응답 예시
