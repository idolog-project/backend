# Idolog Backend Git 협업 규칙

## 브랜치 전략

```text
main
└── dev
    ├── feature/*
    ├── fix/*
    ├── chore/*
    ├── docs/*
    ├── refactor/*
    └── test/*
```

| 브랜치 | 용도 |
| --- | --- |
| `main` | 배포 가능한 안정 버전 |
| `dev` | 개발 통합 브랜치 |
| `feature/*` | 기능 개발 |
| `fix/*` | 버그 수정 |
| `chore/*` | 설정·환경 작업 |
| `docs/*` | 문서 작업 |
| `refactor/*` | 기능 변화 없는 구조 개선 |
| `test/*` | 테스트 추가·수정 |

## 브랜치와 커밋 이름

작업 브랜치는 `작업유형/도메인-작업내용` 형식으로 작성합니다.

```text
feature/auth-local-login
feature/filming-location-list
fix/user-nickname-validation
chore/prisma-setup
docs/api-spec
```

커밋 메시지는 `type: 작업 내용` 형식을 사용합니다.

```text
feat: 촬영지 목록 조회 API 추가
fix: 사용자 언어 검증 오류 수정
chore: Prisma 설정 추가
```

허용 type: `feat`, `fix`, `docs`, `refactor`, `chore`, `test`.

## 작업과 PR 흐름

1. Issue를 만들고 `dev`에서 작업 브랜치를 생성합니다.
2. 작업 완료 후 해당 브랜치를 push하고 `dev` 대상 PR을 생성합니다.
3. PR에는 작업 내용, 검증 결과, 관련 Issue(`Closes #번호`), API·DB 변경 사항을 기록합니다.
4. 최소 1명 리뷰 승인 후 **Squash and merge**합니다.
5. `dev`에서 검증된 배포 단위만 `main` 대상 PR로 병합합니다.

```bash
git switch dev
git pull origin dev
git switch -c feature/auth-local-login
```

## PR 체크 기준

- `main`, `dev`에는 직접 push하지 않습니다.
- 병합 전 `npm run build`, `npm run lint`, `npm test`를 통과합니다.
- Prisma schema 또는 migration 변경은 PR에 명시합니다.
- API 변경 시 Swagger와 관련 문서를 함께 갱신합니다.
- `.env`는 커밋하지 않고 `.env.example`만 관리합니다.
- 병합된 작업 브랜치는 삭제합니다.
