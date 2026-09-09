import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { TourApiClient, type TourLanguage } from '../tourism/tour-api.client';
import { CreateRecommendationDto } from './dto/create-recommendation.dto';
import {
  CONTENT_TYPE_LABEL,
  COURSE_AGENT,
  STYLE_CONTENT_TYPE,
  TRANSPORT_RADIUS_METERS,
  type AgentCandidate,
  type AgentContext,
  type AgentOrigin,
  type Course,
  type CourseAgent,
  type TravelStyle,
} from './recommendation.types';

/** 스타일 하나당 TourAPI 에서 받아올 후보 수입니다. */
const CANDIDATES_PER_STYLE = 20;
/** 모델에 넘기는 후보의 총 상한입니다. 프롬프트가 무한정 길어지지 않게 자릅니다. */
const MAX_CANDIDATES = 60;

@Injectable()
export class RecommendationsService {
  private readonly logger = new Logger(RecommendationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tourApi: TourApiClient,
    @Inject(COURSE_AGENT) private readonly courseAgent: CourseAgent,
  ) {}

  /** 입력을 모아 에이전트에 넘기고 결과를 그대로 돌려줍니다. */
  async recommend(dto: CreateRecommendationDto, language: TourLanguage): Promise<Course[]> {
    const context = await this.buildAgentContext(dto, language);
    const courses = await this.courseAgent.generate(context);
    this.logger.log(`코스 ${courses.length}개 생성 (촬영지 ${context.origin.name})`);
    return courses;
  }

  /**
   * 코스를 짤 에이전트에게 넘길 입력을 모읍니다.
   *
   * 셋을 합칩니다. 출발점이 되는 촬영지(DB), 사용자가 답한 여행 조건, 그리고
   * 반경 안의 실제 장소 후보(TourAPI).
   */
  async buildAgentContext(
    dto: CreateRecommendationDto,
    language: TourLanguage,
  ): Promise<AgentContext> {
    const origin = await this.loadOrigin(dto.locationId);
    const radiusMeters = TRANSPORT_RADIUS_METERS[dto.transportMode];

    return {
      language,
      origin,
      preferences: {
        transportMode: dto.transportMode,
        radiusMeters,
        travelStyles: dto.travelStyles,
        startTime: dto.startTime ?? null,
        endTime: this.endTime(dto.startTime, dto.availableHours),
        availableHours: dto.availableHours ?? null,
        withPet: dto.withPet ?? false,
        partySize: dto.partySize ?? null,
      },
      candidates: await this.collectCandidates({
        latitude: origin.latitude,
        longitude: origin.longitude,
        radiusMeters,
        travelStyles: dto.travelStyles,
        language,
      }),
    };
  }

  private async loadOrigin(locationId: number): Promise<AgentOrigin> {
    const location = await this.prisma.filmingLocation.findUnique({
      where: { id: BigInt(locationId) },
      include: { musicVideos: { include: { musicVideo: { include: { idol: true } } } } },
    });
    if (!location) throw new NotFoundException('NOT_FOUND');

    return {
      // BigInt 는 JSON 으로 나가지 못합니다. 계약이 number ID 라 여기서 좁힙니다.
      id: Number(location.id),
      name: location.name,
      category: location.category,
      address: location.address,
      latitude: location.latitude,
      longitude: location.longitude,
      description: location.description,
      businessHours: location.businessHours,
      closedDays: location.closedDays,
      musicVideos: location.musicVideos.map((link) => ({
        title: link.musicVideo.title,
        idolName: link.musicVideo.idol.name,
        releaseDate: link.musicVideo.releaseDate?.toISOString().slice(0, 10) ?? null,
      })),
    };
  }

  /**
   * 스타일마다 따로 조회해서 합칩니다. 한 번에 긁어오면 음식점처럼 데이터가
   * 많은 분류가 목록을 다 차지해, 고른 스타일이 결과에 드러나지 않습니다.
   */
  private async collectCandidates(params: {
    latitude: number;
    longitude: number;
    radiusMeters: number;
    travelStyles: TravelStyle[];
    language: TourLanguage;
  }): Promise<AgentCandidate[]> {
    // NATURE 와 PHOTO 처럼 같은 관광타입으로 가는 스타일이 있어, 타입 기준으로
    // 묶어 한 번만 부르고 어떤 스타일들이 그 타입을 원했는지 기억해 둡니다.
    const stylesByType = new Map<string, TravelStyle[]>();
    for (const style of params.travelStyles) {
      const type = STYLE_CONTENT_TYPE[style];
      stylesByType.set(type, [...(stylesByType.get(type) ?? []), style]);
    }

    const results = await Promise.all(
      [...stylesByType.entries()].map(async ([contentTypeId, styles]) => {
        const places = await this.tourApi.findNearby({
          latitude: params.latitude,
          longitude: params.longitude,
          radiusMeters: params.radiusMeters,
          language: params.language,
          limit: CANDIDATES_PER_STYLE,
          contentTypeId,
        });
        return places.map((place) => ({ place, styles }));
      }),
    );

    const merged = new Map<string, AgentCandidate>();
    for (const { place, styles } of results.flat()) {
      const existing = merged.get(place.contentId);
      if (existing) {
        existing.matchedStyles = [...new Set([...existing.matchedStyles, ...styles])];
        continue;
      }
      merged.set(place.contentId, {
        ...place,
        contentTypeLabel: CONTENT_TYPE_LABEL[place.contentTypeId] ?? place.contentTypeId,
        matchedStyles: styles,
      });
    }

    return [...merged.values()]
      .sort((a, b) => (a.distanceMeters ?? Infinity) - (b.distanceMeters ?? Infinity))
      .slice(0, MAX_CANDIDATES);
  }

  /** "09:00" + 8시간 → "17:00". 둘 중 하나라도 없으면 계산하지 않습니다. */
  private endTime(startTime?: string, availableHours?: number): string | null {
    if (!startTime || !availableHours) return null;
    const [hour, minute] = startTime.split(':').map(Number);
    if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
    const total = (hour + availableHours) * 60 + minute;
    const wrapped = ((total % 1440) + 1440) % 1440;
    return `${String(Math.floor(wrapped / 60)).padStart(2, '0')}:${String(wrapped % 60).padStart(2, '0')}`;
  }
}
