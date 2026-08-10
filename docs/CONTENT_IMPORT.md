# 뮤직비디오 촬영지 Excel import

## 데이터 범위

뮤직비디오 제목·YouTube 링크가 보완된 Excel 파일을 가져옵니다.

- Idol: 제목 컬럼의 아티스트명
- MusicVideo: 뮤직비디오 제목, 링크, 링크 구분
- FilmingLocation: 원본 연번, 장소·주소·좌표·운영시간·휴무일·전화번호
- MusicVideoFilmingLocation: MV와 촬영지 연결

원본 연번(sourceId)을 unique 키로 사용하므로 같은 파일을 다시 실행해도 촬영지가 중복 생성되지 않습니다.

## 실행 순서

1. Railway DB에 migration을 적용합니다.

```bash
npx prisma migrate deploy
```

2. 로컬 .env에 Railway 외부 접속용 DATABASE_URL과 Excel의 절대 경로를 넣습니다.

```env
CONTENT_EXCEL_PATH=/Users/name/Desktop/idolog/뮤직비디오_촬영지_링크_정리.xlsx
```

3. 로컬 컴퓨터에서 import를 실행합니다.

```bash
npm run prisma:seed:content
```

Railway Shell은 개인 컴퓨터의 Excel 파일에 접근할 수 없으므로, 이 명령은 로컬에서 실행합니다.

## 주의 사항

- 운영 DB에서는 prisma migrate reset을 실행하지 않습니다.
- Excel에 없는 MV 발매일과 이미지 URL은 빈 값으로 남습니다.
