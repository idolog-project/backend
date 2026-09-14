import { Injectable } from '@nestjs/common';
import { AIRecommendationDraft, PlanningError, PlanningInput } from '../types/planning.type';
@Injectable()
export class CandidatePoolGuard {
  validate(draft: AIRecommendationDraft, input: PlanningInput) {
    const map = new Map(input.candidatePool.map((p) => [p.candidateId, p]));
    for (const course of draft.courses) {
      const seen = new Set<string>();
      for (const stop of course.stops) {
        if (stop.candidateId === input.fixedStartLocation.candidateId)
          throw new PlanningError('AI_FIXED_START_REPEATED');
        if (!map.has(stop.candidateId)) throw new PlanningError('AI_UNKNOWN_CANDIDATE');
        if (seen.has(stop.candidateId)) throw new PlanningError('AI_DUPLICATE_CANDIDATE');
        seen.add(stop.candidateId);
      }
    }
    return map;
  }
}
