import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** 앱이 지원하는 언어입니다. */
export type TourLanguage = 'ko' | 'en' | 'zh';

/**
 * TourAPI 4.0의 언어별 서비스명입니다. 실호출로 버전 2가 살아 있음을 확인했습니다.
 *
 * 중요: 언어마다 **contentId 공간이 다릅니다.** 국문에서 얻은 contentId를 영문
 * 서비스에 넣으면 오류가 아니라 resultCode 0000에 totalCount 0으로 조용히 빈
 * 결과가 옵니다. 그래서 이 클라이언트는 contentId를 항상 언어와 한 쌍으로 다룹니다.
 */
const TOUR_SERVICE: Record<TourLanguage, string> = {
  ko: 'KorService2',
  en: 'EngService2',
  zh: 'ChsService2',
};

export type TourPlace = {
  /** 해당 언어 서비스 안에서만 유효한 식별자입니다. */
  contentId: string;
  contentTypeId: string;
  language: TourLanguage;
  title: string;
  address: string | null;
  latitude: number;
  longitude: number;
  imageUrl: string | null;
  /** 조회 중심점으로부터의 거리(m)입니다. */
  distanceMeters: number | null;
};

type TourApiItem = Record<string, string | undefined>;

/**
 * 한국관광공사 TourAPI 클라이언트입니다.
 *
 * `TourismService` 와 별도 파일로 둔 것은 의도한 것입니다. 그쪽은 도메인 규칙이
 * 붙는 자리고 여기는 외부 API 호출만 담당하므로, 추천 로직이 바뀌어도 이 파일은
 * 그대로 쓸 수 있습니다.
 *
 * 외부 의존성을 더하지 않으려고 Node 22 내장 fetch를 씁니다.
 */
@Injectable()
export class TourApiClient {
  private readonly logger = new Logger(TourApiClient.name);
  private readonly baseUrl = 'https://apis.data.go.kr/B551011';
  private readonly serviceKey: string;

  constructor(configService: ConfigService) {
    this.serviceKey = configService.getOrThrow<string>('TOUR_API_SERVICE_KEY');
  }

  /**
   * 좌표 반경 안의 관광지를 가까운 순으로 돌려줍니다.
   *
   * radius 에 상한을 두지 않습니다. 실측에서 20km 와 30km 모두 정상이었고
   * 30km 쪽이 더 많이 나왔습니다.
   */
  async findNearby(params: {
    latitude: number;
    longitude: number;
    radiusMeters: number;
    language: TourLanguage;
    limit: number;
    /** TourAPI 관광타입(12 관광지, 39 음식점 …). 주면 그 분류만 걸러 옵니다. */
    contentTypeId?: string;
  }): Promise<TourPlace[]> {
    const items = await this.request(params.language, 'locationBasedList2', {
      // TourAPI 는 경도가 mapX, 위도가 mapY 입니다. 뒤집어도 오류가 나지 않고
      // 엉뚱한 곳이 나오므로 여기서 한 번만 정확히 맞춰 둡니다.
      mapX: String(params.longitude),
      mapY: String(params.latitude),
      radius: String(Math.round(params.radiusMeters)),
      numOfRows: String(params.limit),
      pageNo: '1',
      arrange: 'E', // 거리순
      ...(params.contentTypeId ? { contentTypeId: params.contentTypeId } : {}),
    });

    return items.map((item) => this.toPlace(item, params.language));
  }

  private async request(
    language: TourLanguage,
    operation: string,
    params: Record<string, string>,
  ): Promise<TourApiItem[]> {
    const query = new URLSearchParams({
      serviceKey: this.serviceKey,
      MobileOS: 'ETC',
      MobileApp: 'Idolog',
      _type: 'json',
      ...params,
    });

    let body: string;
    try {
      const response = await fetch(
        `${this.baseUrl}/${TOUR_SERVICE[language]}/${operation}?${query}`,
        { signal: AbortSignal.timeout(10_000) },
      );
      body = await response.text();
    } catch (error) {
      // URL 에 서비스 키가 들어 있어 로그에 남기지 않습니다.
      this.logger.error(`TourAPI ${operation}(${language}) 호출 실패`, error);
      throw new HttpException('RECOMMENDATION_FAILED', HttpStatus.SERVICE_UNAVAILABLE);
    }

    // 인증 실패·한도 초과는 JSON 이 아니라 XML 봉투로 옵니다. 그대로 JSON.parse
    // 하면 문법 오류가 나면서 진짜 원인이 가려집니다.
    if (!body.trimStart().startsWith('{')) {
      const reason = /<returnAuthMsg>(.*?)<\/returnAuthMsg>/.exec(body)?.[1] ?? 'unknown';
      this.logger.error(`TourAPI ${operation}(${language}) 오류 응답: ${reason}`);
      throw new HttpException('RECOMMENDATION_FAILED', HttpStatus.SERVICE_UNAVAILABLE);
    }

    const parsed = JSON.parse(body) as {
      response?: {
        header?: { resultCode?: string; resultMsg?: string };
        body?: { items?: '' | { item?: TourApiItem | TourApiItem[] } };
      };
    };

    const header = parsed.response?.header;
    if (header?.resultCode !== '0000') {
      this.logger.error(
        `TourAPI ${operation}(${language}) resultCode=${header?.resultCode} ${header?.resultMsg}`,
      );
      throw new HttpException('RECOMMENDATION_FAILED', HttpStatus.SERVICE_UNAVAILABLE);
    }

    // 결과가 없으면 items 가 빈 배열이 아니라 빈 문자열로 옵니다.
    const items = parsed.response?.body?.items;
    if (!items || typeof items === 'string') return [];
    const item = items.item;
    if (!item) return [];
    return Array.isArray(item) ? item : [item];
  }

  private toPlace(item: TourApiItem, language: TourLanguage): TourPlace {
    const distance = Number(item.dist);
    return {
      contentId: item.contentid ?? '',
      contentTypeId: item.contenttypeid ?? '',
      language,
      title: item.title ?? '',
      address: item.addr1?.trim() || null,
      latitude: Number(item.mapy),
      longitude: Number(item.mapx),
      // firstimage 는 값이 없을 때 빈 문자열로 옵니다.
      imageUrl: item.firstimage?.trim() || null,
      distanceMeters: Number.isFinite(distance) ? Math.round(distance) : null,
    };
  }
}
