# 인증 세션 프론트 연동

## 토큰 역할

- **access token**: 로그인, refresh API 응답의 result.accessToken에 들어옵니다. 프론트 메모리에만 보관하고 API 요청의 Authorization Bearer 헤더에 넣습니다.
- **refresh token**: JavaScript가 읽을 수 없는 HttpOnly Cookie입니다. DB에는 원문이 아니라 bcrypt 해시만 저장합니다.

## 프론트 흐름

1. 로컬 로그인은 POST /api/v1/auth/login으로 access token을 받습니다. Google 로그인은 브라우저를 GET /api/v1/auth/login/google로 이동시킵니다.
2. 로그인 필수 API는 Authorization: Bearer accessToken 헤더를 사용합니다.
3. 새로고침 또는 access token 만료 시 POST /api/v1/auth/refresh를 credentials: include 옵션으로 호출합니다.
4. refresh가 401이면 메모리의 access token을 비우고 로그인 화면으로 보냅니다.
5. 로그아웃 시 POST /api/v1/auth/logout을 credentials: include 옵션으로 호출합니다.

## fetch 예시

```ts
const response = await fetch('/api/v1/auth/refresh', {
  method: 'POST',
  credentials: 'include',
});
const body = await response.json();
const accessToken = body.result.accessToken;
```

## Railway 환경변수

운영 백엔드에서는 아래 값이 필요합니다.

```env
FRONTEND_URL=https://프론트-배포-도메인
COOKIE_SECURE=true
JWT_ACCESS_SECRET=<32자-이상>
JWT_REFRESH_SECRET=<32자-이상>
JWT_ACCESS_EXPIRES_IN=1h
JWT_REFRESH_EXPIRES_IN=14d
```

refresh token은 SameSite=Strict를 사용합니다. OAuth state를 보관하는 짧은 수명의 별도 session cookie만 Google 콜백을 위해 SameSite=Lax를 사용합니다. 배포 도메인을 정한 뒤 실제 브라우저에서 로그인·새로고침·로그아웃을 확인합니다.
