export type CoursePlace = {
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
