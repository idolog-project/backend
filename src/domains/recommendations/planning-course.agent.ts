import { Injectable } from '@nestjs/common';
import { RecommendationOrchestrator } from './application/recommendation-orchestrator.service';
import { AgentContext, CourseAgent } from './recommendation.types';
import {
  CreateRecommendationDto,
  TransportMode,
  TravelStyle,
} from './dto/create-recommendation.dto';
import { RecommendationCandidate, RULES, validCoordinates } from './types/planning.type';

@Injectable()
export class PlanningCourseAgent implements CourseAgent {
  constructor(private readonly orchestrator: RecommendationOrchestrator) {}

  async generate(context: AgentContext) {
    const origin = context.origin;
    const fixedStartLocation: RecommendationCandidate = {
      source: 'FILMING_LOCATION',
      candidateId: `PLACE_${origin.id}`,
      locationId: String(origin.id),
      name: origin.name,
      category: origin.category,
      description: origin.description,
      businessHours: origin.businessHours,
      closedDays: origin.closedDays,
      address: origin.address,
      latitude: origin.latitude,
      longitude: origin.longitude,
      imageUrl: origin.imageUrl,
      homepageUrl: null,
      musicVideos: [],
    };
    const candidatePool: RecommendationCandidate[] = context.candidates
      .filter((p) => validCoordinates(p) && Boolean(p.contentId && p.title && p.imageUrl))
      .filter(
        (p) =>
          !(
            p.title.trim() === origin.name.trim() &&
            Math.abs(p.latitude - origin.latitude) < 0.003 &&
            Math.abs(p.longitude - origin.longitude) < 0.003
          ),
      )
      .slice(0, RULES.poolLimit)
      .map((p) => ({
        source: 'TOUR_API',
        candidateId: `TOUR_${p.language}_${p.contentId}`,
        tourContentId: p.contentId,
        name: p.title,
        category: p.contentTypeLabel,
        description: null,
        businessHours: null,
        closedDays: null,
        address: p.address ?? '',
        latitude: p.latitude,
        longitude: p.longitude,
        imageUrl: p.imageUrl,
        homepageUrl: null,
        musicVideos: [],
      }));
    const preferences = context.preferences;
    const dto: CreateRecommendationDto = {
      locationId: origin.id,
      transportMode: preferences.transportMode as TransportMode,
      travelStyles: preferences.travelStyles as TravelStyle[],
      startTime: preferences.startTime ?? undefined,
      availableHours: preferences.availableHours ?? undefined,
      withPet: preferences.withPet,
      partySize: preferences.partySize ?? undefined,
    };
    return (
      await this.orchestrator.recommend(
        dto,
        { fixedStartLocation, candidatePool },
        context.language,
      )
    ).courses;
  }
}
