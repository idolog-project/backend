import type { CreateRecommendationDto } from '../dto/create-recommendation.dto';

export interface RecommendationCandidate {
  source: 'FILMING_LOCATION' | 'TOUR_API';
  candidateId: string;
  locationId?: string;
  tourContentId?: string;
  name: string;
  category: string | null;
  description: string | null;
  businessHours: string | null;
  closedDays: string | null;
  address: string;
  latitude: number;
  longitude: number;
  imageUrl: string | null;
  homepageUrl: string | null;
  musicVideos: Array<{
    id: string;
    title: string;
    youtubeUrl: string | null;
    idol: { id: string; name: string };
  }>;
}

export interface AIStop {
  candidateId: string;
  order: number;
  recommendedStaySeconds: number;
  selectionReason: string;
}

export interface AICourse {
  courseType: 'A' | 'B' | 'C';
  title: string;
  summary: string;
  reason: string;
  stops: AIStop[];
}

export interface AIRecommendationDraft {
  courses: AICourse[];
}

export interface PlanningInput {
  userConditions: CreateRecommendationDto;
  fixedStartLocation: RecommendationCandidate;
  candidatePool: RecommendationCandidate[];
  feedback?: {
    kind: 'REPAIR' | 'REPLAN';
    violations: unknown;
    previousDraft?: AIRecommendationDraft;
  };
}

export interface RouteLeg {
  distanceMeters: number;
  durationSeconds: number;
}

export interface RoutedCourse {
  draft: AICourse;
  locations: RecommendationCandidate[];
  stays: number[];
  legs: RouteLeg[];
}

export class PlanningError extends Error {
  constructor(public readonly code: string) {
    super(code);
  }
}

export const RULES = {
  minStops: 2,
  maxStops: 5,
  minStay: 900,
  maxStay: 7200,
  startStay: 3600,
  maxLegSeconds: 5400,
  poolLimit: 40,
} as const;

export function validCoordinates(p: { latitude: number; longitude: number }): boolean {
  return (
    Number.isFinite(p.latitude) &&
    Number.isFinite(p.longitude) &&
    Math.abs(p.latitude) <= 90 &&
    Math.abs(p.longitude) <= 180
  );
}
