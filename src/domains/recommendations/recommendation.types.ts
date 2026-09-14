import type { TourLanguage, TourPlace } from '../tourism/tour-api.client';

export const TRANSPORT_MODES = ['WALK', 'TAXI', 'BUS', 'CAR'] as const;
export type TransportMode = (typeof TRANSPORT_MODES)[number];

export const TRAVEL_STYLES = [
  'NATURE',
  'CULTURE',
  'ACTIVITY',
  'FOOD',
  'SHOPPING',
  'PHOTO',
] as const;
export type TravelStyle = (typeof TRAVEL_STYLES)[number];

/**
 * 이동수단별 탐색 반경(m)입니다. 프론트가 화면에 표시하는 값과 같아야 해서
 * frontend `src/api/constants.ts` 의 TRANSPORT 를 그대로 따릅니다.
 */
export const TRANSPORT_RADIUS_METERS: Record<TransportMode, number> = {
  WALK: 3_000,
  TAXI: 30_000,
  BUS: 30_000,
  CAR: 30_000,
};

/**
 * 여행 스타일을 TourAPI 관광타입으로 옮깁니다. 8종 모두 필터가 먹는 것을
 * 실호출로 확인했고 앱이 쓰는 것만 남겼습니다.
 *
 * NATURE 와 PHOTO 가 같은 12(관광지)인 것은 의도한 것입니다. TourAPI 에
 * "사진 찍기 좋은 곳" 분류가 없어서, 후보를 좁히는 일만 여기서 하고 둘을
 * 가르는 판단은 모델에 맡깁니다.
 */
export const STYLE_CONTENT_TYPE: Record<TravelStyle, string> = {
  NATURE: '12',
  CULTURE: '14',
  ACTIVITY: '28',
  FOOD: '39',
  SHOPPING: '38',
  PHOTO: '12',
};

export const CONTENT_TYPE_LABEL: Record<string, string> = {
  '12': '관광지',
  '14': '문화시설',
  '15': '축제공연행사',
  '25': '여행코스',
  '28': '레포츠',
  '32': '숙박',
  '38': '쇼핑',
  '39': '음식점',
};

/** 코스의 출발점이 되는 촬영지입니다. DB 에서 옵니다. */
export type AgentOrigin = {
  id: number;
  name: string;
  category: string;
  address: string;
  latitude: number;
  longitude: number;
  description: string | null;
  businessHours: string | null;
  closedDays: string | null;
  /** 코스의 첫 장소로 나가는 사진입니다. 아직 채워지지 않은 촬영지가 많습니다. */
  imageUrl: string | null;
  musicVideos: { title: string; idolName: string; releaseDate: string | null }[];
};

/** 사용자가 여행 계획 화면에서 답한 내용입니다. */
export type AgentPreferences = {
  transportMode: TransportMode;
  radiusMeters: number;
  travelStyles: TravelStyle[];
  startTime: string | null;
  /** startTime + availableHours 로 계산합니다. 둘 다 있을 때만 채웁니다. */
  endTime: string | null;
  availableHours: number | null;
  withPet: boolean;
  partySize: number | null;
};

/** TourAPI 후보에 어떤 스타일 때문에 뽑혔는지를 붙인 것입니다. */
export type AgentCandidate = TourPlace & {
  contentTypeLabel: string;
  matchedStyles: TravelStyle[];
};

/**
 * 코스를 짤 AI 에이전트에게 넘기는 입력 전체입니다.
 *
 * 에이전트를 붙이는 사람은 이 타입만 보면 됩니다. 이것을 받아 `Course[]` 를
 * 돌려주면 나머지는 그대로 동작합니다.
 */
export type AgentContext = {
  language: TourLanguage;
  origin: AgentOrigin;
  preferences: AgentPreferences;
  candidates: AgentCandidate[];
};

/** 프론트가 받는 코스 형태입니다. frontend `courseSchema` 와 같아야 합니다. */
export type CoursePlace = {
  order: number;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  imageUrl: string | null;
  overview: string | null;
  homepageUrl: string | null;
  /** "HH:mm" — 이 장소에 도착할 시각입니다. */
  arrivalTime: string | null;
  /** 사진 위에 붙는 짧은 꼬리표: 촬영지, 음식점, 관광지 … */
  category: string | null;
  /** 첫 장소는 이전 구간이 없어 둘 다 null 입니다. */
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
  /** 이동 + 체류를 합친 하루 전체 길이(초)입니다. */
  totalDurationSeconds: number;
  /** 이동 시간만 합한 값(초). 체류는 뺍니다. */
  travelDurationSeconds: number | null;
  startTime: string | null;
  endTime: string | null;
};

/**
 * 코스를 짜는 주체입니다.
 *
 * 지금은 고정 규칙 구현 하나뿐이고, 실제 AI 에이전트가 준비되면 이 인터페이스를
 * 구현해 갈아끼우면 됩니다.
 */
export interface CourseAgent {
  generate(context: AgentContext): Promise<Course[]>;
}

export const COURSE_AGENT = Symbol('COURSE_AGENT');
