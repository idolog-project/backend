import { Injectable } from '@nestjs/common';
import { KakaoMobilityRouteAdapter } from './kakao-mobility-route.adapter';
import { TransportMode } from '../dto/create-recommendation.dto';
import { GoogleMapsRouteAdapter } from './google-maps-route.adapter';
import {
  AIRecommendationDraft,
  PlanningInput,
  RecommendationCandidate,
  RoutedCourse,
  RULES,
} from '../types/planning.type';
// DTO has no travel date: use the next occurrence of startTime in Asia/Seoul for transit.
export function departureDate(startTime: string, now = new Date()): Date {
  const korea = new Date(now.getTime() + 9 * 3600000).toISOString().slice(0, 10);
  const date = new Date(`${korea}T${startTime}:00+09:00`);
  if (date.getTime() <= now.getTime()) date.setUTCDate(date.getUTCDate() + 1);
  return date;
}
@Injectable()
export class MapRouteService {
  constructor(
    private readonly adapter: GoogleMapsRouteAdapter,
    private readonly kakao: KakaoMobilityRouteAdapter,
  ) {}
  assertConfigured(mode: TransportMode): void {
    if (mode === TransportMode.TAXI || mode === TransportMode.CAR) this.kakao.assertConfigured();
  }
  async route(
    draft: AIRecommendationDraft,
    input: PlanningInput,
    map: Map<string, RecommendationCandidate>,
  ): Promise<RoutedCourse[]> {
    const start = departureDate(input.userConditions.startTime ?? '09:00');
    return Promise.all(
      draft.courses.map(async (course): Promise<RoutedCourse> => {
        const locations = [
          input.fixedStartLocation,
          ...course.stops.map((s) => map.get(s.candidateId)!),
        ];
        const stays = [RULES.startStay, ...course.stops.map((s) => s.recommendedStaySeconds)];
        const routed: RoutedCourse = { draft: course, locations, stays, legs: [] };
        let elapsed = stays[0];
        for (let i = 1; i < locations.length; i++) {
          const mode = input.userConditions.transportMode;
          const leg =
            mode === TransportMode.TAXI || mode === TransportMode.CAR
              ? await this.kakao.compute(locations[i - 1], locations[i])
              : await this.adapter.compute(
                  locations[i - 1],
                  locations[i],
                  input.userConditions.transportMode,
                  new Date(start.getTime() + elapsed * 1000).toISOString(),
                );
          routed.legs.push(leg);
          elapsed += leg.durationSeconds + stays[i];
        }
        return routed;
      }),
    );
  }
}
