export type TourismTransportMode = 'WALK' | 'TAXI' | 'BUS' | 'CAR';

export type TourismTravelStyle = 'NATURE' | 'CULTURE' | 'ACTIVITY' | 'FOOD' | 'SHOPPING' | 'PHOTO';

export interface TourismCandidateQuery {
  centerLatitude: number;
  centerLongitude: number;
  startName: string;
  transportMode: TourismTransportMode;
  travelStyles: TourismTravelStyle[];
  withPet: boolean;
  limit: number;
}

export interface FilteredTourismCandidate {
  contentId: string;
  name: string;
  category: string | null;
  categoryCode: string | null;
  description: string | null;
  businessHours: string | null;
  closedDays: string | null;
  address: string;
  latitude: number;
  longitude: number;
  imageUrl: string | null;
  homepageUrl: string | null;
  distanceMeters: number | null;
}
