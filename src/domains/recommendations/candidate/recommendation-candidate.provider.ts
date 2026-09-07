import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { TourismService } from '../../tourism/tourism.service';
import { CreateRecommendationDto } from '../dto/create-recommendation.dto';
import {
  PlanningError,
  RecommendationCandidate,
  RULES,
  validCoordinates,
} from '../types/planning.type';

const include = {
  musicVideos: { include: { musicVideo: { include: { idol: true } } } },
} satisfies Prisma.FilmingLocationInclude;

type Location = Prisma.FilmingLocationGetPayload<{ include: typeof include }>;

@Injectable()
export class RecommendationCandidateProvider {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tourism: TourismService,
  ) {}

  async getPool(dto: CreateRecommendationDto) {
    const row = await this.prisma.filmingLocation.findUnique({
      where: { id: BigInt(dto.locationId) },
      include,
    });

    if (!row) throw new NotFoundException('선택한 촬영지를 찾을 수 없습니다.');

    const fixedStartLocation = this.convertStartLocation(row);
    if (!validCoordinates(fixedStartLocation)) {
      throw new PlanningError('INVALID_START_COORDINATES');
    }

    // 중요: Recommendation 도메인에서는 주변 관광지를 직접 DB 조회/필터링하지 않는다.
    // TourismService가 TourAPI 조회 + 백엔드 전처리를 마친 후보만 전달한다.
    const filtered = await this.tourism.getFilteredCandidates({
      centerLatitude: fixedStartLocation.latitude,
      centerLongitude: fixedStartLocation.longitude,
      startName: fixedStartLocation.name,
      transportMode: dto.transportMode,
      travelStyles: dto.travelStyles,
      withPet: dto.withPet ?? false,
      limit: RULES.poolLimit,
    });

    const candidatePool: RecommendationCandidate[] = filtered.map((candidate) => ({
      source: 'TOUR_API',
      candidateId: `TOUR_${candidate.contentId}`,
      tourContentId: candidate.contentId,
      name: candidate.name,
      category: candidate.category,
      description: candidate.description,
      businessHours: candidate.businessHours,
      closedDays: candidate.closedDays,
      address: candidate.address,
      latitude: candidate.latitude,
      longitude: candidate.longitude,
      imageUrl: candidate.imageUrl,
      homepageUrl: candidate.homepageUrl,
      musicVideos: [],
    }));

    return { fixedStartLocation, candidatePool };
  }

  private convertStartLocation(row: Location): RecommendationCandidate {
    return {
      source: 'FILMING_LOCATION',
      candidateId: `PLACE_${row.id}`,
      locationId: String(row.id),
      name: row.name,
      category: row.category,
      description: row.description,
      businessHours: row.businessHours,
      closedDays: row.closedDays,
      address: row.address,
      latitude: row.latitude,
      longitude: row.longitude,
      imageUrl: row.imageUrl,
      homepageUrl: null,
      musicVideos: row.musicVideos.map(({ musicVideo: m }) => ({
        id: String(m.id),
        title: m.title,
        youtubeUrl: m.youtubeUrl,
        idol: { id: String(m.idol.id), name: m.idol.name },
      })),
    };
  }
}
