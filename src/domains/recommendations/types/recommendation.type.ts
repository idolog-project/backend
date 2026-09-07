import type { RecommendationCandidate } from './planning.type';
export type CoursePlace = {
  locationId?: string;
  tourContentId?: string;
  candidateId?: string;
  musicVideos?: RecommendationCandidate['musicVideos'];
  businessHours?: string | null;
  closedDays?: string | null;
  availability?: 'unknown';
  departureTime?: string;
  recommendedStaySeconds?: number;
  selectionReason?: string;
  order: number;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  imageUrl: string | null;
  overview: string | null;
  homepageUrl: string | null;
  arrivalTime: string | null;
  category: string | null;
  distanceFromPrevMeters: number | null;
  durationFromPrevSeconds: number | null;
};

export type Course = {
  id: string;
  courseType?: 'A' | 'B' | 'C';
  title: string;
  summary: string;
  reason: string;
  places: CoursePlace[];
  totalDistanceMeters: number;
  totalDurationSeconds: number;
  travelDurationSeconds: number | null;
  startTime: string | null;
  endTime: string | null;
};

export type RecommendationResult = {
  courses: Course[];
};
