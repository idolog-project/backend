import { PrismaClient } from '@prisma/client';

/**
 * 촬영지 대표 이미지를 TourAPI 에서 찾아 채웁니다.
 *
 *   npm run prisma:backfill:images          (조회만, DB 를 건드리지 않음)
 *   npm run prisma:backfill:images -- --apply
 *
 * 왜 필요한가: 촬영지 120건의 imageUrl 이 전부 비어 있어 목록·상세 화면에
 * 사진이 한 장도 뜨지 않습니다.
 *
 * 무엇을 하지 않는가: **좌표로 가까운 관광지를 가져오지 않습니다.** 그렇게 하면
 * 적중률은 80% 까지 오르지만 가져오는 것이 촬영지가 아닙니다 — 용마랜드에
 * 290m 떨어진 "용마해장국" 사진이 붙습니다. 엉뚱한 가게 사진을 촬영지라고
 * 보여주는 것은 사진이 없는 것보다 나쁩니다.
 *
 * 그래서 두 조건을 모두 만족할 때만 채웁니다.
 *   1. TourAPI 가 돌려준 제목이 촬영지 이름과 정확히 같다(공백·괄호 무시)
 *   2. 그 관광지 좌표가 촬영지 좌표에서 MAX_DISTANCE_METERS 안에 있다
 *
 * 2번이 있는 이유: 이름만 보면 "월미도"처럼 전국에 같은 이름이 여럿인 경우를
 * 걸러낼 수 없습니다.
 *
 * 실측 결과는 120 건 중 34 건(서로 다른 장소 27 곳)입니다. 나머지는 카페·
 * 스튜디오·펜션·역사처럼 관광지 DB 에 애초에 없는 장소라, 기획서 §6 대로 직접
 * 조사해 채워야 합니다. 이 스크립트는 못 채운 목록을 마지막에 출력해 그 작업
 * 대상을 알려줍니다.
 */
const prisma = new PrismaClient();

const TOUR_BASE_URL = 'https://apis.data.go.kr/B551011/KorService2';
/** 이름이 같아도 이보다 멀면 동명이인으로 보고 버립니다. */
const MAX_DISTANCE_METERS = 2_000;
/** 공공 API 를 몰아치지 않으려고 호출 사이에 둡니다. */
const THROTTLE_MS = 120;

type TourItem = Record<string, string | undefined>;

function serviceKey(): string {
  const key = process.env.TOUR_API_SERVICE_KEY?.trim();
  if (!key) {
    throw new Error('TOUR_API_SERVICE_KEY 가 비어 있습니다. backend/.env 를 확인하세요.');
  }
  return key;
}

/** 공백·괄호·대소문자 차이는 같은 이름으로 봅니다. */
function normalise(value: string): string {
  return value.replace(/[\s\-_()[\]]/g, '').toLowerCase();
}

/**
 * TourAPI 는 같은 이미지를 http 로 주기도 합니다(실측 34건 중 11건).
 *
 * 배포 프론트는 HTTPS 라, http 이미지는 브라우저가 mixed content 로 **조용히
 * 차단**합니다. 콘솔에만 경고가 남고 화면에는 깨진 자리만 보여서, 데이터가
 * 없는 것과 구별이 안 됩니다. 같은 경로가 https 로도 200 을 주므로 올려서
 * 저장합니다.
 */
function toHttps(url: string): string {
  return url.replace(/^http:\/\//i, 'https://');
}

/** 두 좌표 사이의 직선거리(m)입니다. */
function distanceMeters(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6_371_000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

async function searchByKeyword(keyword: string): Promise<TourItem[]> {
  const query = new URLSearchParams({
    serviceKey: serviceKey(),
    MobileOS: 'ETC',
    MobileApp: 'Idolog',
    _type: 'json',
    keyword,
    numOfRows: '10',
    pageNo: '1',
  });

  const response = await fetch(`${TOUR_BASE_URL}/searchKeyword2?${query}`, {
    signal: AbortSignal.timeout(10_000),
  });
  const body = await response.text();

  // 인증 실패·한도 초과는 JSON 이 아니라 XML 봉투로 옵니다.
  if (!body.trimStart().startsWith('{')) {
    const reason = /<returnAuthMsg>(.*?)<\/returnAuthMsg>/.exec(body)?.[1] ?? 'unknown';
    throw new Error(`TourAPI 오류 응답: ${reason}`);
  }

  const parsed = JSON.parse(body) as {
    response?: { body?: { items?: '' | { item?: TourItem | TourItem[] } } };
  };
  const items = parsed.response?.body?.items;
  // 결과가 없으면 빈 배열이 아니라 빈 문자열로 옵니다.
  if (!items || typeof items === 'string') return [];
  const item = items.item;
  if (!item) return [];
  return Array.isArray(item) ? item : [item];
}

type Match = { imageUrl: string; title: string; distance: number };

/**
 * 이름으로 찾고 좌표로 확인합니다.
 *
 * "스매싱볼 청담점" 처럼 지점명이 붙은 이름은 TourAPI 에 그대로 없을 수 있어,
 * 꼬리를 뗀 형태도 한 번 시도합니다.
 */
async function findImage(location: {
  name: string;
  latitude: number;
  longitude: number;
}): Promise<Match | null> {
  const keywords = [location.name, location.name.replace(/\s*\S+점$/, '').trim()].filter(
    (value, index, all) => value && all.indexOf(value) === index,
  );

  for (const keyword of keywords) {
    const items = await searchByKeyword(keyword);
    for (const item of items) {
      const imageUrl = item.firstimage?.trim();
      if (!imageUrl) continue;
      if (normalise(item.title ?? '') !== normalise(keyword)) continue;

      const distance = distanceMeters(
        location.latitude,
        location.longitude,
        Number(item.mapy),
        Number(item.mapx),
      );
      if (!Number.isFinite(distance) || distance > MAX_DISTANCE_METERS) continue;

      return { imageUrl: toHttps(imageUrl), title: item.title ?? keyword, distance };
    }
    await new Promise((resolve) => setTimeout(resolve, THROTTLE_MS));
  }
  return null;
}

/**
 * 이미 저장된 http 이미지를 https 로 올립니다.
 *
 * 이 스크립트의 옛 판이 http 그대로 저장한 행이 남아 있어, 다시 실행하면
 * 스스로 낫도록 둡니다.
 */
async function repairInsecureUrls(apply: boolean): Promise<void> {
  const rows = await prisma.filmingLocation.findMany({
    where: { imageUrl: { startsWith: 'http://' } },
    select: { id: true, name: true, imageUrl: true },
  });
  if (!rows.length) return;

  console.log(`http 이미지 ${rows.length}건을 https 로 올립니다 (mixed content 차단 방지)`);
  for (const row of rows) {
    console.log(`  ↑ ${row.name}`);
    if (apply) {
      await prisma.filmingLocation.update({
        where: { id: row.id },
        data: { imageUrl: toHttps(row.imageUrl!) },
      });
    }
  }
  console.log();
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');

  await repairInsecureUrls(apply);

  const locations = await prisma.filmingLocation.findMany({
    where: { imageUrl: null },
    select: { id: true, name: true, latitude: true, longitude: true },
    orderBy: { id: 'asc' },
  });

  console.log(
    `${apply ? '적용' : '조회만 (DB 변경 없음)'} — 이미지 없는 촬영지 ${locations.length}건\n`,
  );

  const matched: string[] = [];
  const unmatched: string[] = [];

  for (const location of locations) {
    let match: Match | null = null;
    try {
      match = await findImage(location);
    } catch (error) {
      // 한 건의 실패로 전체를 멈추지 않습니다. 다시 실행하면 남은 것만 돕니다.
      console.log(`  ${location.name} — 조회 실패: ${String(error)}`);
      unmatched.push(location.name);
      continue;
    }

    if (!match) {
      unmatched.push(location.name);
      continue;
    }

    matched.push(location.name);
    console.log(`  ✓ ${location.name} → ${match.title} (${Math.round(match.distance)}m)`);

    if (apply) {
      await prisma.filmingLocation.update({
        where: { id: location.id },
        data: { imageUrl: match.imageUrl },
      });
    }
  }

  console.log(`\n채울 수 있음 : ${matched.length}건`);
  console.log(`못 채움      : ${unmatched.length}건`);
  if (apply) console.log(`DB 반영      : ${matched.length}건`);
  else console.log('\n실제로 쓰려면 --apply 를 붙여 다시 실행하세요.');

  if (unmatched.length) {
    console.log('\n직접 조사해 채워야 하는 촬영지:');
    for (const name of unmatched) console.log(`  - ${name}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
