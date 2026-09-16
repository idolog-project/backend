import { PrismaClient } from '@prisma/client';

/**
 * Daum 이미지 검색으로 촬영지 대표 이미지 URL을 보완합니다.
 *
 *   npm run collect:tourist-images
 *   npm run collect:tourist-images -- --dry-run
 *   npm run collect:tourist-images -- --force
 *
 * 이미지 파일을 내려받거나 저장하지 않고, 검색 결과가 가리키는 원본 URL과 출처만 DB에 기록합니다.
 */
const prisma = new PrismaClient();

const KAKAO_IMAGE_SEARCH_URL = 'https://dapi.kakao.com/v2/search/image';
/** Daum 검색 쿼터를 보수적으로 사용합니다. */
const REQUEST_DELAY_MS = 350;
const MIN_WIDTH = 500;
const MIN_HEIGHT = 300;

type KakaoImageDocument = {
  image_url?: unknown;
  width?: unknown;
  height?: unknown;
  display_sitename?: unknown;
  doc_url?: unknown;
};

type SelectedImage = {
  imageUrl: string;
  imageSource: string | null;
  imageSourceUrl: string | null;
  width: number | null;
  height: number | null;
};

type Summary = {
  total: number;
  success: number;
  skipped: number;
  noImage: number;
  failed: number;
};

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function nonNegativeInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null;
}

function isUsableImageUrl(value: string | null): value is string {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

/**
 * 충분한 해상도의 사진을 우선 선택하되, 검색 결과가 적을 때는 유효한 원본 이미지로 완화합니다.
 */
function selectImage(documents: KakaoImageDocument[]): SelectedImage | null {
  const candidates = documents
    .map((document) => {
      const imageUrl = text(document.image_url);
      if (!isUsableImageUrl(imageUrl)) return null;
      return {
        imageUrl,
        imageSource: text(document.display_sitename),
        imageSourceUrl: text(document.doc_url),
        width: nonNegativeInteger(document.width),
        height: nonNegativeInteger(document.height),
      } satisfies SelectedImage;
    })
    .filter((candidate): candidate is SelectedImage => candidate !== null);

  return (
    candidates.find(
      (candidate) =>
        candidate.width !== null &&
        candidate.height !== null &&
        candidate.width >= MIN_WIDTH &&
        candidate.height >= MIN_HEIGHT,
    ) ??
    candidates[0] ??
    null
  );
}

async function searchKakaoImages(query: string, apiKey: string): Promise<KakaoImageDocument[]> {
  const url = new URL(KAKAO_IMAGE_SEARCH_URL);
  url.searchParams.set('query', query);
  url.searchParams.set('sort', 'accuracy');
  url.searchParams.set('size', '10');

  const response = await fetch(url, {
    headers: { Authorization: `KakaoAK ${apiKey}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Kakao 이미지 검색 HTTP ${response.status}: ${body.slice(0, 200)}`);
  }

  const body: unknown = await response.json();
  if (!body || typeof body !== 'object' || !('documents' in body)) {
    throw new Error('Kakao 이미지 검색 응답 형식이 올바르지 않습니다.');
  }
  const documents = (body as { documents?: unknown }).documents;
  if (!Array.isArray(documents)) return [];
  return documents.filter(
    (document): document is KakaoImageDocument => !!document && typeof document === 'object',
  );
}

async function main(): Promise<void> {
  const force = hasFlag('--force');
  const dryRun = hasFlag('--dry-run');
  const apiKey = process.env.KAKAO_REST_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      'KAKAO_REST_API_KEY 가 비어 있습니다. .env 또는 Railway Variables를 확인하세요.',
    );
  }

  const locations = await prisma.filmingLocation.findMany({
    select: { id: true, name: true, address: true, imageUrl: true },
    orderBy: { id: 'asc' },
  });
  const summary: Summary = {
    total: locations.length,
    success: 0,
    skipped: 0,
    noImage: 0,
    failed: 0,
  };

  console.log(
    `${dryRun ? '[DRY RUN] ' : ''}${force ? '전체 재수집' : '이미지 없는 촬영지만 수집'} — ${locations.length}건\n`,
  );

  for (const [index, location] of locations.entries()) {
    if (!force && location.imageUrl) {
      summary.skipped += 1;
      console.log(`[${index + 1}/${locations.length}] ${location.name} - SKIPPED`);
      continue;
    }

    const query = `${location.name} ${location.address}`.replace(/\s+/g, ' ').trim();
    try {
      const selected = selectImage(await searchKakaoImages(query, apiKey));
      if (!selected) {
        summary.noImage += 1;
        console.log(`[${index + 1}/${locations.length}] ${location.name} - NO IMAGE`);
      } else {
        summary.success += 1;
        console.log(`[${index + 1}/${locations.length}] ${location.name} - SUCCESS`);
        if (dryRun) {
          console.log(`  query: ${query}`);
          console.log(`  selected: ${selected.imageUrl}`);
          console.log(`  source: ${selected.imageSource ?? '(알 수 없음)'}`);
          console.log(`  sourceUrl: ${selected.imageSourceUrl ?? '(알 수 없음)'}`);
          console.log(`  size: ${selected.width ?? '?'}x${selected.height ?? '?'}`);
        } else {
          await prisma.filmingLocation.update({
            where: { id: location.id },
            data: {
              imageUrl: selected.imageUrl,
              imageSource: selected.imageSource,
              imageSourceUrl: selected.imageSourceUrl,
            },
          });
        }
      }
    } catch (error) {
      summary.failed += 1;
      console.log(
        `[${index + 1}/${locations.length}] ${location.name} - API ERROR: ${String(error)}`,
      );
    }

    if (index < locations.length - 1) await sleep(REQUEST_DELAY_MS);
  }

  console.log('\n===== Image Collection Complete =====');
  console.log(`Total: ${summary.total}`);
  console.log(`Success: ${summary.success}`);
  console.log(`Skipped: ${summary.skipped}`);
  console.log(`No Image: ${summary.noImage}`);
  console.log(`Failed: ${summary.failed}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
