import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  CreateRecommendationDto,
  TransportMode,
  TravelStyle,
} from '../dto/create-recommendation.dto';
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
  constructor(private readonly prisma: PrismaService) {}
  async getPool(dto: CreateRecommendationDto) {
    const row = await this.prisma.filmingLocation.findUnique({
      where: { id: BigInt(dto.locationId) },
      include,
    });
    if (!row) throw new NotFoundException('선택한 촬영지를 찾을 수 없습니다.');
    const fixedStartLocation = this.convert(row);
    if (!validCoordinates(fixedStartLocation)) throw new PlanningError('INVALID_START_COORDINATES');
    const radiusKm = dto.transportMode === TransportMode.WALK ? 8 : 60;
    const latDelta = radiusKm / 111;
    const lonDelta = Math.min(
      180,
      radiusKm / (111 * Math.max(0.01, Math.cos((row.latitude * Math.PI) / 180))),
    );
    const rows = await this.prisma.filmingLocation.findMany({
      where: {
        id: { not: row.id },
        latitude: {
          gte: Math.max(-90, row.latitude - latDelta),
          lte: Math.min(90, row.latitude + latDelta),
        },
        longitude: {
          gte: Math.max(-180, row.longitude - lonDelta),
          lte: Math.min(180, row.longitude + lonDelta),
        },
      },
      include,
      orderBy: { id: 'asc' },
      take: RULES.scanLimit,
    });
    const idols = new Set(fixedStartLocation.musicVideos.map((m) => m.idol.id));
    const videos = new Set(fixedStartLocation.musicVideos.map((m) => m.id));
    const ranked = rows
      .map((r) => this.convert(r))
      .filter(validCoordinates)
      .map((p) => {
        const distance = this.distance(fixedStartLocation, p);
        const relevance = p.musicVideos.some((m) => videos.has(m.id))
          ? 200
          : p.musicVideos.some((m) => idols.has(m.idol.id))
            ? 100
            : 0;
        const style =
          (dto.travelStyles.includes(TravelStyle.PHOTO) && p.category === 'PHOTO_SPOT') ||
          (dto.travelStyles.includes(TravelStyle.FOOD) && p.category === 'CAFE');
        return { p, distance, score: relevance + (style ? 50 : 0) - distance / radiusKm };
      })
      .filter((p) => p.distance <= radiusKm)
      .sort((a, b) => b.score - a.score);
    return { fixedStartLocation, candidatePool: ranked.slice(0, RULES.poolLimit).map((p) => p.p) };
  }
  private convert(row: Location): RecommendationCandidate {
    return {
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
      musicVideos: row.musicVideos.map(({ musicVideo: m }) => ({
        id: String(m.id),
        title: m.title,
        youtubeUrl: m.youtubeUrl,
        idol: { id: String(m.idol.id), name: m.idol.name },
      })),
    };
  }
  private distance(a: RecommendationCandidate, b: RecommendationCandidate) {
    const rad = Math.PI / 180;
    const h =
      Math.sin(((b.latitude - a.latitude) * rad) / 2) ** 2 +
      Math.cos(a.latitude * rad) *
        Math.cos(b.latitude * rad) *
        Math.sin(((b.longitude - a.longitude) * rad) / 2) ** 2;
    return 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
  }
}
