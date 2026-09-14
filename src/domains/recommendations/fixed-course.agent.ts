import { Injectable } from '@nestjs/common';

import {
  type AgentCandidate,
  type AgentContext,
  type Course,
  type CourseAgent,
  type CoursePlace,
  type TransportMode,
} from './recommendation.types';

/** 이동수단별 평균 속도(km/h)입니다. 직선거리에 곱해 대략의 이동 시간을 냅니다. */
const SPEED_KMH: Record<TransportMode, number> = {
  WALK: 4.5,
  BUS: 20,
  TAXI: 40,
  CAR: 40,
};

/** 분류별 체류 시간(초)입니다. */
const STAY_SECONDS: Record<string, number> = {
  음식점: 60 * 60,
  쇼핑: 40 * 60,
  문화시설: 60 * 60,
  레포츠: 90 * 60,
};
const DEFAULT_STAY_SECONDS = 45 * 60;
/** 촬영지는 사진을 찍으러 온 곳이라 조금 넉넉히 둡니다. */
const ORIGIN_STAY_SECONDS = 50 * 60;
/** 코스 하나에 담을 최대 장소 수(촬영지 포함)입니다. */
const MAX_PLACES = 5;

/**
 * 실제 AI 없이 고정 규칙으로 코스를 만드는 구현입니다.
 *
 * 목적은 둘입니다. 하나는 AI 에이전트를 붙일 사람이 요청·응답 형태를 눈으로
 * 확인할 수 있게 하는 것, 다른 하나는 그때까지 화면이 비지 않게 하는 것입니다.
 *
 * 장소 자체는 진짜입니다 — TourAPI 가 돌려준 반경 안의 실제 후보를 씁니다.
 * 고정된 것은 어떤 곳을 어떤 순서로 고르는가 하는 판단뿐이고, 그 사실을
 * `reason` 에 적어 화면에 그대로 드러냅니다. AI 결과로 오해하면 안 됩니다.
 *
 * 거리는 직선거리(하버사인)입니다. 도로 거리가 아니므로 길 안내로 쓸 수 없고,
 * 코스의 대략적인 규모를 가늠하는 용도입니다.
 */
@Injectable()
export class FixedCourseAgent implements CourseAgent {
  // 이 구현은 기다릴 것이 없어 await 이 없습니다. 그래도 async 로 두는 것은
  // `CourseAgent` 가 모델 호출을 전제한 계약이기 때문입니다. 여기서 동기로
  // 좁히면 에이전트를 갈아끼울 때 시그니처부터 바꿔야 합니다.
  // eslint-disable-next-line @typescript-eslint/require-await
  async generate(context: AgentContext): Promise<Course[]> {
    // 조건에 맞는 곳이 없으면 오류가 아니라 빈 배열입니다(계약).
    if (context.candidates.length === 0) return [];

    const courses = [
      this.build(
        context,
        'nearest',
        '가까운 곳부터 천천히',
        context.candidates.slice(0, MAX_PLACES - 1),
      ),
      this.build(
        context,
        'varied',
        '고른 취향으로 하루 채우기',
        this.pickAcrossStyles(context.candidates, MAX_PLACES - 1),
      ),
    ];

    // 장소 구성이 같으면 탭이 둘 다 똑같아 보여 하나만 남깁니다.
    const seen = new Set<string>();
    return courses.filter((course) => {
      const key = course.places.map((p) => p.name).join('|');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  /** 스타일마다 돌아가며 하나씩 집어 한쪽 분류로 쏠리지 않게 합니다. */
  private pickAcrossStyles(candidates: AgentCandidate[], count: number): AgentCandidate[] {
    const byStyle = new Map<string, AgentCandidate[]>();
    for (const candidate of candidates) {
      const key = candidate.matchedStyles[0] ?? 'ETC';
      byStyle.set(key, [...(byStyle.get(key) ?? []), candidate]);
    }
    const picked: AgentCandidate[] = [];
    const queues = [...byStyle.values()];
    while (picked.length < count && queues.some((q) => q.length > 0)) {
      for (const queue of queues) {
        if (picked.length >= count) break;
        const next = queue.shift();
        if (next) picked.push(next);
      }
    }
    return picked;
  }

  private build(
    context: AgentContext,
    suffix: string,
    title: string,
    picks: AgentCandidate[],
  ): Course {
    const { origin, preferences } = context;

    // 첫 장소는 언제나 촬영지입니다. 이 앱은 거기서 출발하는 것이 전부입니다.
    const stops = [
      {
        name: origin.name,
        address: origin.address,
        latitude: origin.latitude,
        longitude: origin.longitude,
        imageUrl: origin.imageUrl,
        overview: origin.description,
        category: '촬영지',
        stay: ORIGIN_STAY_SECONDS,
      },
      ...picks.map((candidate) => ({
        name: candidate.title,
        address: candidate.address ?? '',
        latitude: candidate.latitude,
        longitude: candidate.longitude,
        imageUrl: candidate.imageUrl,
        overview: null as string | null,
        category: candidate.contentTypeLabel,
        stay: STAY_SECONDS[candidate.contentTypeLabel] ?? DEFAULT_STAY_SECONDS,
      })),
    ];

    const speed = SPEED_KMH[preferences.transportMode];
    let clock = this.toMinutes(preferences.startTime);
    let totalDistance = 0;
    let totalTravel = 0;

    const places: CoursePlace[] = stops.map((stop, index) => {
      const previous = index === 0 ? null : stops[index - 1];
      const distance = previous ? Math.round(this.haversineMeters(previous, stop)) : null;
      const travel = distance === null ? null : Math.round((distance / 1000 / speed) * 3600);

      if (distance !== null) totalDistance += distance;
      if (travel !== null) {
        totalTravel += travel;
        if (clock !== null) clock += travel / 60;
      }
      const arrivalTime = clock === null ? null : this.toClock(clock);
      if (clock !== null) clock += stop.stay / 60;

      return {
        order: index + 1,
        name: stop.name,
        address: stop.address,
        latitude: stop.latitude,
        longitude: stop.longitude,
        imageUrl: stop.imageUrl,
        overview: stop.overview,
        homepageUrl: null,
        arrivalTime,
        category: stop.category,
        distanceFromPrevMeters: distance,
        durationFromPrevSeconds: travel,
      };
    });

    const totalStay = stops.reduce((sum, stop) => sum + stop.stay, 0);

    return {
      id: `fixed-${origin.id}-${suffix}`,
      title,
      summary: `${origin.name}에서 출발해 ${places.length}곳을 도는 코스입니다.`,
      // 화면에 그대로 노출되는 문장입니다. 고정 규칙이라는 것을 여기서 밝힙니다.
      reason:
        `아직 AI 추천이 연결되지 않아 고정 규칙으로 만든 예시입니다. ` +
        `${preferences.travelStyles.join(', ')} 취향과 ${preferences.transportMode} 이동을 기준으로 ` +
        `반경 ${preferences.radiusMeters / 1000}km 안의 실제 장소를 거리순으로 골랐습니다.`,
      places,
      totalDistanceMeters: totalDistance,
      totalDurationSeconds: totalTravel + totalStay,
      travelDurationSeconds: totalTravel,
      startTime: preferences.startTime,
      endTime: clock === null ? null : this.toClock(clock),
    };
  }

  /** 두 좌표 사이의 직선거리(m)입니다. 도로 거리가 아닙니다. */
  private haversineMeters(
    a: { latitude: number; longitude: number },
    b: { latitude: number; longitude: number },
  ): number {
    const R = 6_371_000;
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const dLat = toRad(b.latitude - a.latitude);
    const dLon = toRad(b.longitude - a.longitude);
    const h =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  private toMinutes(time: string | null): number | null {
    if (!time) return null;
    const [hour, minute] = time.split(':').map(Number);
    return Number.isFinite(hour) && Number.isFinite(minute) ? hour * 60 + minute : null;
  }

  /** 자정을 넘기면 24시간으로 감습니다. */
  private toClock(minutes: number): string {
    const wrapped = ((Math.round(minutes) % 1440) + 1440) % 1440;
    return `${String(Math.floor(wrapped / 60)).padStart(2, '0')}:${String(wrapped % 60).padStart(2, '0')}`;
  }
}
