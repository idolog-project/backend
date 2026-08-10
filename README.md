# Idolog Backend

Idolog는 아이돌 뮤직비디오 촬영지를 바탕으로 사용자의 취향에 맞는 여행 코스를 추천하는 서비스의 백엔드 API입니다. 이 저장소는 팀 개발을 위한 NestJS 기반 공통 인프라와 도메인 골격을 제공합니다.

## 기술 스택

- Node.js, TypeScript (strict)
- NestJS
- PostgreSQL, Prisma ORM
- Swagger
- npm

## 실행 방법

Node.js 22 이상과 PostgreSQL을 준비합니다.

```bash
npm install
cp .env.example .env
# .env의 필수 값을 채웁니다.
npm run prisma:generate
npm run start:dev
```

서버 기본 주소는 `http://localhost:3000`이며, API prefix는 `/api/v1`입니다.

## 환경변수 설정

`.env.example`을 `.env`로 복사한 후 모든 값을 채웁니다. 시작 시 환경변수 형식과 필수값을 검증합니다. `.env`는 Git에서 제외됩니다.

`DATABASE_URL` 예시:

```env
DATABASE_URL="postgresql://postgres:password@localhost:5432/idolog?schema=public"
```

JWT secret은 32자 이상을 사용하세요. Google OAuth를 사용하려면 Google Client ID, Client Secret, Callback URL을 설정합니다. OpenAI, TourAPI, Google Maps 키는 해당 연동 기능 구현 전에 발급하여 설정합니다.

## Prisma 사용 방법

스키마는 [prisma/schema.prisma](prisma/schema.prisma)에 있고, 변경 이력은 [prisma/migrations](prisma/migrations)에 저장합니다.

```bash
npm run prisma:generate
npx prisma migrate dev --name init
npm run prisma:studio
```

데이터 모델을 변경하면 `npm run prisma:format` 및 `npm run prisma:generate`를 실행합니다. Railway 같은 운영 환경에서는 개발용 `migrate dev` 대신 `npx prisma migrate deploy`를 사용합니다.

## Swagger

개발 서버 실행 후 [http://localhost:3000/api-docs](http://localhost:3000/api-docs)에서 현재 구현된 API 문서를 확인할 수 있습니다. Bearer 인증 스키마가 미리 등록되어 있습니다. 현재 구현 명세는 [docs/API_SPEC.md](docs/API_SPEC.md)에, 프론트엔드 요구사항을 기준으로 한 구현 대상 명세와 OpenAPI 파일은 [docs/FRONTEND_API_SPEC.md](docs/FRONTEND_API_SPEC.md), [docs/swagger.yaml](docs/swagger.yaml)에 있습니다. Railway와 로컬에서 프론트 연동 테스트 계정을 준비하는 방법은 [docs/DATABASE_SEED.md](docs/DATABASE_SEED.md), 로그인 세션 연동 방법은 [docs/AUTH_SESSION.md](docs/AUTH_SESSION.md)에서 확인합니다.

## 폴더 구조

```text
src/
├── common/                 # 응답, 예외 필터, 공통 확장 지점
├── config/                 # 환경변수 검증
├── domains/                # 비즈니스 도메인별 module/controller/service/dto
│   ├── auth/
│   ├── users/
│   ├── idols/
│   ├── music-videos/
│   ├── filming-locations/
│   ├── tourism/
│   ├── recommendations/
│   ├── routes/
│   └── bookmarks/
├── health/                 # 상태 확인 엔드포인트
├── prisma/                 # PrismaModule, PrismaService
├── app.module.ts
└── main.ts
prisma/schema.prisma
```

## 개발 규칙

- 모든 API는 `/api/v1` prefix 아래에 둡니다.
- 성공 응답은 `isSuccess`, `code`, `message`, `result` 공통 형식을 사용합니다.
- Nest 기본 HTTP 예외도 전역 필터를 통해 동일한 오류 응답 형식으로 반환합니다.
- DTO에는 `class-validator` 데코레이터를 사용하고 전역 `ValidationPipe` 규칙을 따릅니다.
- 비밀번호 원문은 저장하거나 로그에 남기지 않습니다.
- 커밋 전 `npm run build`, `npm run lint`, `npm test`를 실행합니다.
- 공통화가 필요해질 때까지 BaseService/BaseRepository 같은 추상 계층을 추가하지 않습니다.

## 브랜치 및 PR 규칙

Homefit과 같은 `main → dev → 작업 브랜치` 흐름과 `feature/*`, `fix/*`, `chore/*` 이름 규칙을 사용합니다. 자세한 브랜치, 커밋, PR 규칙은 [GIT_CONVENTION.md](GIT_CONVENTION.md)를 참고하세요.

## 현재 범위

로컬·Google 인증, access/refresh token 세션, 테스트 계정 시드는 구현되었습니다. 외부 API(OpenAI, TourAPI, Google Maps) 호출과 추천·여행 코스 비즈니스 로직은 아직 구현하지 않았습니다.
