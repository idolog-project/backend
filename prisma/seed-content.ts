import { PrismaClient, type LocationCategory } from '@prisma/client';
import { resolve } from 'node:path';
import * as XLSX from 'xlsx';

/**
 * 뮤직비디오 제목·링크가 보완된 Excel 파일을 DB에 가져옵니다.
 *
 * npm run prisma:seed:content
 *
 * 원본 연번(sourceId)을 unique 키로 사용해 같은 파일을 다시 실행해도 중복 생성하지 않습니다.
 */
const prisma = new PrismaClient();
const DEFAULT_EXCEL_PATH = resolve(__dirname, 'data', 'music-video-filming-location-links.xlsx');

type SourceRow = {
  연번: string | number;
  미디어타입: string;
  제목: string;
  장소명: string;
  장소타입: string;
  장소설명: string;
  영업시간: string;
  휴무일: string;
  주소: string;
  위도: string | number;
  경도: string | number;
  전화번호: string;
  최종작성일: string;
  '뮤직비디오 제목': string;
  '뮤직비디오 링크': string;
  '링크 구분': string;
};

function getExcelPath(): string {
  // 기본 파일은 저장소에 포함되어 있어, 팀원 누구나 clone 뒤 바로 import할 수 있습니다.
  return process.env.CONTENT_EXCEL_PATH?.trim() || DEFAULT_EXCEL_PATH;
}

function optionalText(value: unknown): string | null {
  const text = String(value ?? '').trim();
  return text || null;
}

function parseSourceDate(value: unknown): Date | null {
  const match = /^(\d{4})\.(\d{2})\.(\d{2})$/.exec(String(value ?? '').trim());
  if (!match) return null;
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
}

function getCategory(sourcePlaceType: unknown): LocationCategory {
  return String(sourcePlaceType).trim().toLowerCase() === 'cafe' ? 'CAFE' : 'MV_SPOT';
}

async function main(): Promise<void> {
  const workbook = XLSX.readFile(getExcelPath(), { cellDates: false });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) throw new Error('Excel 파일에 시트가 없습니다.');

  const sheet = workbook.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json<SourceRow>(sheet, { defval: '', raw: false });
  if (rows.length === 0) throw new Error('Excel 파일에 import할 데이터 행이 없습니다.');

  let linkedMusicVideoCount = 0;

  for (const row of rows) {
    const sourceId = Number(row.연번);
    const latitude = Number(row.위도);
    const longitude = Number(row.경도);
    const artistName = String(row.제목 ?? '').trim();
    const locationName = String(row.장소명 ?? '').trim();
    const address = String(row.주소 ?? '').trim();
    const musicVideoTitle = optionalText(row['뮤직비디오 제목']);

    if (
      !Number.isInteger(sourceId) ||
      !artistName ||
      !locationName ||
      !address ||
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude)
    ) {
      throw new Error('필수 값이 올바르지 않은 Excel 행입니다. 원본 연번: ' + String(row.연번));
    }

    const idol = await prisma.idol.upsert({
      where: { name: artistName },
      update: {},
      create: { name: artistName },
    });

    const location = await prisma.filmingLocation.upsert({
      where: { sourceId },
      update: {
        name: locationName,
        category: getCategory(row.장소타입),
        sourcePlaceType: String(row.장소타입 ?? '').trim(),
        description: optionalText(row.장소설명),
        businessHours: optionalText(row.영업시간),
        closedDays: optionalText(row.휴무일),
        address,
        latitude,
        longitude,
        phoneNumber: optionalText(row.전화번호),
        sourceUpdatedAt: parseSourceDate(row.최종작성일),
      },
      create: {
        sourceId,
        name: locationName,
        category: getCategory(row.장소타입),
        sourcePlaceType: String(row.장소타입 ?? '').trim(),
        description: optionalText(row.장소설명),
        businessHours: optionalText(row.영업시간),
        closedDays: optionalText(row.휴무일),
        address,
        latitude,
        longitude,
        phoneNumber: optionalText(row.전화번호),
        sourceUpdatedAt: parseSourceDate(row.최종작성일),
      },
    });

    // 이 Excel은 MV 제목과 링크를 사람이 보완한 원본이므로 그대로 신뢰해 연결합니다.
    if (!musicVideoTitle) continue;

    const musicVideo = await prisma.musicVideo.upsert({
      where: { idolId_title: { idolId: idol.id, title: musicVideoTitle } },
      update: {
        youtubeUrl: optionalText(row['뮤직비디오 링크']),
        sourceLinkType: optionalText(row['링크 구분']),
      },
      create: {
        idolId: idol.id,
        title: musicVideoTitle,
        youtubeUrl: optionalText(row['뮤직비디오 링크']),
        sourceLinkType: optionalText(row['링크 구분']),
      },
    });

    await prisma.musicVideoFilmingLocation.upsert({
      where: {
        musicVideoId_filmingLocationId: {
          musicVideoId: musicVideo.id,
          filmingLocationId: location.id,
        },
      },
      update: {},
      create: { musicVideoId: musicVideo.id, filmingLocationId: location.id },
    });
    linkedMusicVideoCount += 1;
  }

  console.info('촬영지 콘텐츠 import 완료');
  console.info('원본 행: ' + rows.length);
  console.info('MV 연결 행: ' + linkedMusicVideoCount);
}

main()
  .catch((error: unknown) => {
    console.error('촬영지 콘텐츠 import에 실패했습니다.', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
