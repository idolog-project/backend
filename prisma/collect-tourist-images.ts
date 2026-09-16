import { PrismaClient } from '@prisma/client';

/**
 * Daum 이미지 검색으로 촬영지 대표 이미지 URL을 보완합니다.
 *
 *   npm run collect:tourist-images
 *   npm run collect:tourist-images -- --dry-run
 *   npm run collect:tourist-images -- --force
 *   npm run collect:tourist-images -- --repair --dry-run
 *
 * 이미지 파일을 내려받거나 저장하지 않고, 검색 결과가 가리키는 원본 URL과 출처만 DB에 기록합니다.
 */
const prisma = new PrismaClient();

const KAKAO_IMAGE_SEARCH_URL = 'https://dapi.kakao.com/v2/search/image';
/** Daum 검색 쿼터를 보수적으로 사용합니다. */
const REQUEST_DELAY_MS = 350;
/** 장소 하나당 외부 원본 서버를 과도하게 두드리지 않도록 후보 검증 수를 제한합니다. */
const MAX_IMAGE_URL_PROBES = 3;
const KAKAO_MAX_ATTEMPTS = 3;
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

function getImageReferer(): string {
  const configured = process.env.FRONTEND_URL?.trim();
  if (!configured) {
    throw new Error('FRONTEND_URL 이 비어 있습니다. HTTPS 프론트 주소를 설정하세요.');
  }
  try {
    const url = new URL(configured);
    if (url.protocol !== 'https:') {
      throw new Error('FRONTEND_URL 은 HTTPS 주소여야 합니다.');
    }
    return url.origin + '/';
  } catch {
    throw new Error('FRONTEND_URL 은 유효한 HTTPS 프론트 주소여야 합니다.');
  }
}

function isUsableImageUrl(value: string | null, referer: string): value is string {
  if (!value) return false;
  try {
    const url = new URL(value);
    // HTTPS 프론트에서는 http 이미지를 mixed content로 차단하므로 수집하지 않습니다.
    if (url.protocol !== 'https:' || new URL(referer).protocol !== 'https:') return false;
    // 검색 결과에 지도 캡처가 섞일 수 있으나, 대표 장소 사진으로 쓰지 않습니다.
    return !url.hostname.startsWith('simg.pstatic.net') && !url.pathname.includes('static.map');
  } catch {
    return false;
  }
}

/**
 * TourAPI는 간혹 http URL을 주지만 VisitKorea CDN은 동일 리소스를 HTTPS로 제공합니다.
 * 임의의 외부 이미지 도메인에는 적용하지 않아 mixed content·오매칭을 만들지 않습니다.
 */
function upgradeTrustedImageUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol === 'http:' && url.hostname === 'tong.visitkorea.or.kr') {
      url.protocol = 'https:';
    }
    return url.toString();
  } catch {
    return null;
  }
}

/**
 * 충분한 해상도의 사진을 우선 선택하되, 검색 결과가 적을 때는 유효한 원본 이미지로 완화합니다.
 */
function rankImageCandidates(documents: KakaoImageDocument[], referer: string): SelectedImage[] {
  const candidates = documents
    .map((document) => {
      const imageUrl = upgradeTrustedImageUrl(text(document.image_url));
      if (!isUsableImageUrl(imageUrl, referer)) return null;
      return {
        imageUrl,
        imageSource: text(document.display_sitename),
        imageSourceUrl: text(document.doc_url),
        width: nonNegativeInteger(document.width),
        height: nonNegativeInteger(document.height),
      } satisfies SelectedImage;
    })
    .filter((candidate): candidate is SelectedImage => candidate !== null);

  return candidates.sort((left, right) => {
    const leftPreferred =
      left.width !== null &&
      left.height !== null &&
      left.width >= MIN_WIDTH &&
      left.height >= MIN_HEIGHT;
    const rightPreferred =
      right.width !== null &&
      right.height !== null &&
      right.width >= MIN_WIDTH &&
      right.height >= MIN_HEIGHT;
    return Number(rightPreferred) - Number(leftPreferred);
  });
}

/**
 * Daum 검색 결과는 외부 원본 URL이므로, 실제 프론트에서 직접 로드할 수 있는지 확인합니다.
 */
async function isBrowserLoadableImage(imageUrl: string, referer: string): Promise<boolean> {
  try {
    const response = await fetch(imageUrl, {
      headers: {
        Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        Referer: referer,
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(8_000),
    });
    const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
    await response.body?.cancel();
    return response.ok && contentType.startsWith('image/');
  } catch {
    return false;
  }
}

async function selectLoadableImage(
  documents: KakaoImageDocument[],
  referer: string,
): Promise<SelectedImage | null> {
  for (const candidate of rankImageCandidates(documents, referer).slice(0, MAX_IMAGE_URL_PROBES)) {
    if (await isBrowserLoadableImage(candidate.imageUrl, referer)) return candidate;
  }
  return null;
}

async function searchKakaoImages(query: string, apiKey: string): Promise<KakaoImageDocument[]> {
  const url = new URL(KAKAO_IMAGE_SEARCH_URL);
  url.searchParams.set('query', query);
  url.searchParams.set('sort', 'accuracy');
  url.searchParams.set('size', '10');

  let lastError: unknown;
  for (let attempt = 1; attempt <= KAKAO_MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { Authorization: `KakaoAK ${apiKey}` },
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) {
        const body = await response.text();
        const error = new Error(`Kakao 이미지 검색 HTTP ${response.status}: ${body.slice(0, 200)}`);
        // 429와 5xx는 잠시 기다린 뒤 재시도합니다.
        if ((response.status === 429 || response.status >= 500) && attempt < KAKAO_MAX_ATTEMPTS) {
          await sleep(1_000 * 2 ** (attempt - 1));
          continue;
        }
        throw error;
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
    } catch (error) {
      lastError = error;
      if (attempt < KAKAO_MAX_ATTEMPTS) {
        await sleep(1_000 * 2 ** (attempt - 1));
      }
    }
  }
  throw new Error(`Kakao 이미지 검색 재시도 실패: ${String(lastError)}`);
}

async function main(): Promise<void> {
  const force = hasFlag('--force');
  const dryRun = hasFlag('--dry-run');
  const repair = hasFlag('--repair');
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
  const referer = getImageReferer();

  console.log(
    `${dryRun ? '[DRY RUN] ' : ''}${force ? '전체 재수집' : repair ? '기존 이미지 검증·복구' : '이미지 없는 촬영지만 수집'} — ${locations.length}건\n`,
  );

  for (const [index, location] of locations.entries()) {
    if (!force && location.imageUrl) {
      if (!repair) {
        summary.skipped += 1;
        console.log(`[${index + 1}/${locations.length}] ${location.name} - SKIPPED`);
        continue;
      }
      if (await isBrowserLoadableImage(location.imageUrl, referer)) {
        summary.skipped += 1;
        console.log(`[${index + 1}/${locations.length}] ${location.name} - VALID`);
        continue;
      }
      console.log(
        `[${index + 1}/${locations.length}] ${location.name} - BROKEN, searching replacement`,
      );
    }

    const query = `${location.name} ${location.address}`.replace(/\s+/g, ' ').trim();
    try {
      const selected = await selectLoadableImage(await searchKakaoImages(query, apiKey), referer);
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
