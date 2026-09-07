import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  FilteredTourismCandidate,
  TourismCandidateQuery,
  TourismTravelStyle,
} from './types/tourism-recommendation.type';

const TOUR_API_BASE = 'https://apis.data.go.kr/B551011/KorService2';
const TOUR_API_TIMEOUT_MS = 10_000;
const TOUR_API_FETCH_LIMIT = 100;

interface TourApiLocationItem {
  contentid?: unknown;
  contenttypeid?: unknown;
  title?: unknown;
  addr1?: unknown;
  addr2?: unknown;
  mapx?: unknown;
  mapy?: unknown;
  firstimage?: unknown;
  firstimage2?: unknown;
  cat1?: unknown;
  dist?: unknown;
}

@Injectable()
export class TourismService {
  constructor(private readonly config: ConfigService) {}

  /**
   * Recommendation 도메인이 소비하는 "백엔드 전처리 완료 관광지" 경계입니다.
   * RecommendationCandidateProvider는 더 이상 DB에서 주변 후보를 만들지 않습니다.
   *
   * 현재 구현은 TourAPI 위치기반 목록에서
   * - 이동수단 반경
   * - 좌표 유효성
   * - 대표 이미지 존재 여부
   * - 여행 스타일의 TourAPI 대분류(cat1)
   * 를 적용합니다.
   *
   * 운영시간/휴무일/주차/반려동물 상세 필터는 detailIntro2/detailPetTour2 등
   * 전처리 영역에서 확장할 수 있도록 반환 필드를 유지합니다.
   */
  async getFilteredCandidates(query: TourismCandidateQuery): Promise<FilteredTourismCandidate[]> {
    const radiusMeters = query.transportMode === 'WALK' ? 3_000 : 30_000;
    const items = await this.fetchLocationBasedList(query, radiusMeters);

    const acceptedCategories = this.acceptedCat1(query.travelStyles);
    const onlyPhotoStyle =
      query.travelStyles.length > 0 && query.travelStyles.every((style) => style === 'PHOTO');

    return items
      .map((item) => this.toCandidate(item))
      .filter((candidate): candidate is FilteredTourismCandidate => candidate !== null)
      .filter((candidate) => this.hasImage(candidate))
      .filter((candidate) => !this.isStartLocation(candidate, query))
      .filter((candidate) => {
        if (onlyPhotoStyle || acceptedCategories.size === 0) return true;
        return candidate.categoryCode !== null && acceptedCategories.has(candidate.categoryCode);
      })
      .sort(
        (a, b) =>
          (a.distanceMeters ?? Number.MAX_SAFE_INTEGER) -
          (b.distanceMeters ?? Number.MAX_SAFE_INTEGER),
      )
      .slice(0, query.limit);
  }

  private async fetchLocationBasedList(
    query: TourismCandidateQuery,
    radiusMeters: number,
  ): Promise<TourApiLocationItem[]> {
    const url = new URL(`${TOUR_API_BASE}/locationBasedList2`);
    const key = this.decodeServiceKey(this.config.getOrThrow<string>('TOUR_API_SERVICE_KEY'));

    url.searchParams.set('serviceKey', key);
    url.searchParams.set('numOfRows', String(TOUR_API_FETCH_LIMIT));
    url.searchParams.set('pageNo', '1');
    url.searchParams.set('MobileOS', 'ETC');
    url.searchParams.set('MobileApp', 'Idolog');
    url.searchParams.set('_type', 'json');
    url.searchParams.set('arrange', 'E');
    url.searchParams.set('mapX', String(query.centerLongitude));
    url.searchParams.set('mapY', String(query.centerLatitude));
    url.searchParams.set('radius', String(radiusMeters));

    let response: Response;
    try {
      response = await fetch(url, { signal: AbortSignal.timeout(TOUR_API_TIMEOUT_MS) });
    } catch (error) {
      if (error instanceof Error && ['AbortError', 'TimeoutError'].includes(error.name)) {
        throw new Error('TOUR_API_TIMEOUT');
      }
      throw new Error('TOUR_API_NETWORK_ERROR');
    }

    if (!response.ok) throw new Error(`TOUR_API_HTTP_${response.status}`);

    let raw: unknown;
    try {
      raw = await response.json();
    } catch {
      throw new Error('TOUR_API_INVALID_JSON');
    }

    return this.extractItems(raw);
  }

  private extractItems(raw: unknown): TourApiLocationItem[] {
    if (!this.isRecord(raw)) throw new Error('TOUR_API_INVALID_RESPONSE');
    const response = raw.response;
    if (!this.isRecord(response)) throw new Error('TOUR_API_INVALID_RESPONSE');

    const header = response.header;
    if (!this.isRecord(header)) throw new Error('TOUR_API_INVALID_RESPONSE');
    const resultCode = this.toText(header.resultCode);
    if (resultCode !== '0000') throw new Error(`TOUR_API_RESULT_${resultCode || 'UNKNOWN'}`);

    const body = response.body;
    if (!this.isRecord(body)) throw new Error('TOUR_API_INVALID_RESPONSE');
    const items = body.items;
    if (items === '' || items === null || items === undefined) return [];
    if (!this.isRecord(items)) throw new Error('TOUR_API_INVALID_RESPONSE');

    const item = items.item;
    if (item === undefined || item === null || item === '') return [];
    if (Array.isArray(item)) return item.filter((value) => this.isRecord(value));
    if (this.isRecord(item)) return [item];
    throw new Error('TOUR_API_INVALID_RESPONSE');
  }

  private toCandidate(item: TourApiLocationItem): FilteredTourismCandidate | null {
    const contentId = this.toText(item.contentid);
    const name = this.toText(item.title);
    const latitude = this.toNumber(item.mapy);
    const longitude = this.toNumber(item.mapx);

    if (!contentId || !name || latitude === null || longitude === null) return null;
    if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;

    const addr1 = this.toText(item.addr1);
    const addr2 = this.toText(item.addr2);
    const address = [addr1, addr2].filter(Boolean).join(' ').trim();
    const image = this.toText(item.firstimage) || this.toText(item.firstimage2) || null;

    const categoryCode = this.toText(item.cat1) || null;

    return {
      contentId,
      name,
      category: this.categoryLabel(categoryCode),
      categoryCode,
      description: null,
      businessHours: null,
      closedDays: null,
      address,
      latitude,
      longitude,
      imageUrl: image,
      homepageUrl: null,
      distanceMeters: this.toNumber(item.dist),
    };
  }

  private categoryLabel(categoryCode: string | null): string | null {
    const labels: Record<string, string> = {
      A01: 'NATURE',
      A02: 'CULTURE',
      A03: 'ACTIVITY',
      A04: 'SHOPPING',
      A05: 'FOOD',
      B02: 'STAY',
    };
    return categoryCode ? (labels[categoryCode] ?? categoryCode) : null;
  }

  private acceptedCat1(styles: TourismTravelStyle[]): Set<string> {
    const map: Partial<Record<TourismTravelStyle, string>> = {
      NATURE: 'A01',
      CULTURE: 'A02',
      ACTIVITY: 'A03',
      SHOPPING: 'A04',
      FOOD: 'A05',
    };
    return new Set(
      styles.map((style) => map[style]).filter((value): value is string => Boolean(value)),
    );
  }

  private hasImage(candidate: FilteredTourismCandidate): boolean {
    return Boolean(candidate.imageUrl?.trim());
  }

  private isStartLocation(
    candidate: FilteredTourismCandidate,
    query: TourismCandidateQuery,
  ): boolean {
    const sameName =
      candidate.name.trim().toLocaleLowerCase('ko-KR') ===
      query.startName.trim().toLocaleLowerCase('ko-KR');
    const latDiff = Math.abs(candidate.latitude - query.centerLatitude);
    const lonDiff = Math.abs(candidate.longitude - query.centerLongitude);
    return sameName && latDiff < 0.003 && lonDiff < 0.003;
  }

  private decodeServiceKey(value: string): string {
    const trimmed = value.trim();
    try {
      return decodeURIComponent(trimmed);
    } catch {
      return trimmed;
    }
  }

  private toText(value: unknown): string {
    if (typeof value === 'string') return value.trim();
    if (typeof value === 'number' || typeof value === 'bigint') return String(value);
    return '';
  }

  private toNumber(value: unknown): number | null {
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (typeof value !== 'string' || value.trim() === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
