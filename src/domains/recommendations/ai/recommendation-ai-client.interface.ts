import type { PlanningInput } from '../types/planning.type';
// Raw text remains untrusted until AIOutputValidator and CandidatePoolGuard accept it.
export abstract class RecommendationAIClient {
  abstract generateCourseDraft(input: PlanningInput): Promise<string>;
}
