# DB 시드와 프론트 연동 테스트 계정

## 목적

**npm run prisma:seed**는 프론트엔드가 로그인 연동을 확인할 수 있도록 로컬 회원 계정 하나를 생성하거나 갱신합니다.

- 같은 이메일의 **LOCAL** 계정이 있으면 비밀번호와 닉네임을 갱신합니다.
- 계정이 없으면 새로 만듭니다.
- 같은 이메일의 Google 계정은 덮어쓰지 않고 실패합니다.
- 기존 테이블·다른 사용자·운영 데이터를 삭제하지 않습니다.

## 주의 사항

운영 Railway DB에서 prisma migrate reset 또는 npx prisma migrate reset을 실행하면 데이터가 삭제됩니다. 운영 환경에서는 실행하지 않습니다.

스키마 변경은 migration으로 적용합니다.

~~~bash
npx prisma migrate deploy
~~~

테스트 계정 생성·갱신은 별도로 아래 명령을 실행합니다.

~~~bash
npm run prisma:seed
~~~

## 필요한 환경변수

값은 Git에 커밋하지 말고, 로컬 .env 또는 Railway backend 서비스의 **Variables**에만 넣습니다.

~~~env
SEED_TEST_EMAIL=frontend-test@idolog.kr
SEED_TEST_PASSWORD=<충분히-긴-임의의-비밀번호>
SEED_TEST_NICKNAME=Idolog 테스트
~~~

## Railway에서 실행 순서

1. backend 서비스의 Variables에 위 SEED_TEST 값을 저장합니다.
2. backend 서비스 Shell 또는 Railway CLI에서 npm run prisma:seed를 한 번 실행합니다.
3. 프론트 담당자에게 이메일·비밀번호를 **개인 메시지나 팀 비밀 관리 도구**로 전달합니다. GitHub 이슈, PR 본문, 공개 문서에는 비밀번호를 쓰지 않습니다.
4. 프론트에서 다음 API로 확인합니다.

~~~http
POST /api/v1/auth/login
Content-Type: application/json

{
  "email": "<SEED_TEST_EMAIL>",
  "password": "<SEED_TEST_PASSWORD>"
}
~~~

성공하면 result.accessToken을 반환합니다.
