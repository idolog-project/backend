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

2. 로컬 .env에 Railway 외부 접속용 DATABASE_URL을 넣습니다. 기본 Excel은 저장소의 prisma/data/music-video-filming-location-links.xlsx에 포함되어 있어 별도 경로 설정이 필요 없습니다.

```env
DATABASE_URL=Railway-외부-접속용-URL
```

3. 로컬 컴퓨터에서 import를 실행합니다.

```bash
npm run prisma:seed:content
```

Railway Shell은 저장소의 Excel 파일에 접근할 수 있지만, DB에 데이터를 넣기 전에는 로컬에서 결과를 확인한 뒤 실행하는 것을 권장합니다.

## 다른 Excel 파일로 교체하기

기본 파일 대신 다른 파일을 쓰려면 CONTENT_EXCEL_PATH에 그 파일의 절대 경로를 설정합니다.

## 주의 사항

- 운영 DB에서는 prisma migrate reset을 실행하지 않습니다.
- Excel에 없는 MV 발매일과 이미지 URL은 빈 값으로 남습니다.
