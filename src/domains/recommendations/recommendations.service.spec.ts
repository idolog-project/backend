import { KakaoMobilityRouteAdapter } from './route/kakao-mobility-route.adapter';
import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { RecommendationOrchestrator } from './application/recommendation-orchestrator.service';
import { RecommendationCandidateProvider } from './candidate/recommendation-candidate.provider';
import { CandidatePoolGuard } from './candidate/candidate-pool.guard';
import { AIOutputValidator } from './ai/ai-output.validator';
import { networkRetry } from './ai/network-retry';
import { recommendationSchema } from './ai/recommendation-schema.factory';
import { CourseAssembler } from './assembler/course-assembler.service';
import { GoogleMapsRouteAdapter } from './route/google-maps-route.adapter';
import { MapRouteService, departureDate } from './route/map-route.service';
import { RouteFeasibilityValidator } from './route/route-feasibility.validator';
import { RecommendationFailedException } from './exceptions/recommendation-failed.exception';
import { RecommendationsService } from './recommendations.service';
import {
  AIRecommendationDraft,
  PlanningInput,
  RecommendationCandidate,
} from './types/planning.type';
import {
  CreateRecommendationDto,
  TransportMode,
  TravelStyle,
} from './dto/create-recommendation.dto';
const dto: CreateRecommendationDto = {
  locationId: 10,
  transportMode: TransportMode.TAXI,
  travelStyles: [TravelStyle.PHOTO],
  startTime: '09:00',
  availableHours: 8,
};
const candidate = (id: number): RecommendationCandidate => ({
  candidateId: `PLACE_${id}`,
  locationId: String(id),
  name: `DB 장소 ${id}`,
  category: 'PHOTO_SPOT',
  address: 'DB 주소',
  description: 'DB 설명',
  latitude: 37.5 + id / 10000,
  longitude: 127,
  imageUrl: 'https://example.com/db.jpg',
  businessHours: null,
  closedDays: null,
  musicVideos: [
    {
      id: '9007199254740993',
      title: 'DB MV',
      youtubeUrl: null,
      idol: { id: '2', name: 'DB 아이돌' },
    },
  ],
});
const pool = { fixedStartLocation: candidate(10), candidatePool: [11, 12, 13].map(candidate) };
const input: PlanningInput = { ...pool, userConditions: dto };
const draft = (): AIRecommendationDraft => ({
  courses: (['A', 'B', 'C'] as const).map((courseType, i) => ({
    courseType,
    title: '한국어 제목',
    summary: '요약',
    reason: '이유',
    stops: [11 + i, 11 + ((i + 1) % 3)].map((id, j) => ({
      candidateId: `PLACE_${id}`,
      order: j + 2,
      recommendedStaySeconds: 900,
      selectionReason: '선택 이유',
    })),
  })),
});
function setup() {
  const provider = { getPool: jest.fn().mockResolvedValue(pool) };
  const ai = { generateCourseDraft: jest.fn().mockResolvedValue(JSON.stringify(draft())) };
  const adapter = {
    compute: jest.fn().mockResolvedValue({ distanceMeters: 1234, durationSeconds: 600 }),
  };
  const orchestrator = new RecommendationOrchestrator(
    provider as unknown as RecommendationCandidateProvider,
    ai,
    new AIOutputValidator(),
    new CandidatePoolGuard(),
    new MapRouteService(
      adapter as unknown as GoogleMapsRouteAdapter,
      { ...adapter, assertConfigured: jest.fn() } as unknown as KakaoMobilityRouteAdapter,
    ),
    new RouteFeasibilityValidator(),
    new CourseAssembler(),
  );
  return { provider, ai, adapter, service: new RecommendationsService(orchestrator) };
}
describe('Recommendation pipeline', () => {
  it('assembles three fixed-start courses from canonical DB and map data', async () => {
    const { service, adapter } = setup();
    const result = await service.createRecommendation(dto);
    expect(result.courses).toHaveLength(3);
    for (const course of result.courses) {
      expect(course.places[0]).toMatchObject({
        locationId: '10',
        order: 1,
        arrivalTime: '09:00',
        departureTime: '10:00',
        distanceFromPrevMeters: null,
      });
      expect(course.places[1]).toMatchObject({
        name: expect.stringContaining('DB 장소'),
        address: 'DB 주소',
        latitude: expect.any(Number),
        longitude: 127,
        imageUrl: 'https://example.com/db.jpg',
        musicVideos: pool.fixedStartLocation.musicVideos,
        distanceFromPrevMeters: 1234,
        durationFromPrevSeconds: 600,
        arrivalTime: '10:10',
      });
      expect(course.totalDistanceMeters).toBe(2468);
      expect(course.totalDurationSeconds).toBe(6600);
      expect(course.endTime).toBe('10:50');
    }
    expect(adapter.compute).toHaveBeenCalledTimes(6);
    expect(() => JSON.stringify(result)).not.toThrow();
  });
  it('never asks AI to include the start, so omission cannot remove it', async () => {
    const { service } = setup();
    expect(draft().courses.every((c) => c.stops.every((s) => s.candidateId !== 'PLACE_10'))).toBe(
      true,
    );
    const result = await service.createRecommendation(dto);
    expect(result.courses.every((c) => c.places[0].locationId === '10')).toBe(true);
  });
  it.each([
    'fixed',
    'unknown',
    'duplicate',
    'identical',
    'count',
    'order',
    'extra',
    'types',
    'stay',
    'empty',
  ] as const)('rejects %s violations with one repair', async (kind) => {
    const d = draft();
    if (kind === 'fixed') d.courses[0].stops[0].candidateId = 'PLACE_10';
    if (kind === 'unknown') d.courses[0].stops[0].candidateId = 'PLACE_999';
    if (kind === 'duplicate') d.courses[0].stops[1].candidateId = d.courses[0].stops[0].candidateId;
    if (kind === 'identical') d.courses[1].stops = d.courses[0].stops;
    if (kind === 'count') d.courses.pop();
    if (kind === 'order') d.courses[0].stops[0].order = 1;
    if (kind === 'extra') Object.assign(d.courses[0].stops[0], { name: 'AI fabricated name' });
    if (kind === 'types') d.courses[1].courseType = 'A';
    if (kind === 'stay') d.courses[0].stops[0].recommendedStaySeconds = -1;
    if (kind === 'empty') d.courses[0].stops = [];
    const { service, ai, adapter } = setup();
    ai.generateCourseDraft.mockResolvedValue(JSON.stringify(d));
    await expect(service.createRecommendation(dto)).rejects.toBeInstanceOf(
      RecommendationFailedException,
    );
    expect(ai.generateCourseDraft).toHaveBeenCalledTimes(2);
    expect(adapter.compute).not.toHaveBeenCalled();
  });
  it('repairs invalid JSON once with the same whitelist', async () => {
    const { service, ai } = setup();
    ai.generateCourseDraft.mockResolvedValueOnce('{broken');
    await expect(service.createRecommendation(dto)).resolves.toHaveProperty('courses');
    expect(ai.generateCourseDraft).toHaveBeenCalledTimes(2);
    const second = ai.generateCourseDraft.mock.calls[1][0] as PlanningInput;
    expect(second.candidatePool).toEqual(pool.candidatePool);
    expect(second.fixedStartLocation).toEqual(pool.fixedStartLocation);
  });
  it('stops after two invalid JSON responses', async () => {
    const { service, ai } = setup();
    ai.generateCourseDraft.mockResolvedValue('{');
    await expect(service.createRecommendation(dto)).rejects.toBeInstanceOf(
      RecommendationFailedException,
    );
    expect(ai.generateCourseDraft).toHaveBeenCalledTimes(2);
  });
  it('skips AI when candidates are insufficient', async () => {
    const { service, ai, provider } = setup();
    provider.getPool.mockResolvedValue({ ...pool, candidatePool: pool.candidatePool.slice(0, 2) });
    await expect(service.createRecommendation(dto)).resolves.toEqual({ courses: [] });
    expect(ai.generateCourseDraft).not.toHaveBeenCalled();
  });
  it('preserves 404 and skips AI for missing starts', async () => {
    const { service, ai, provider } = setup();
    provider.getPool.mockRejectedValue(new NotFoundException());
    await expect(service.createRecommendation(dto)).rejects.toBeInstanceOf(NotFoundException);
    expect(ai.generateCourseDraft).not.toHaveBeenCalled();
  });
  it('maps provider failure to existing external exception without AI repair', async () => {
    const { service, ai, adapter } = setup();
    adapter.compute.mockRejectedValue(new Error('unavailable'));
    await expect(service.createRecommendation(dto)).rejects.toMatchObject({
      response: { code: 'RECOMMENDATION_FAILED' },
    });
    expect(ai.generateCourseDraft).toHaveBeenCalledTimes(1);
  });
  it('replans an excessive route once and reroutes successfully', async () => {
    const { service, ai, adapter } = setup();
    adapter.compute.mockResolvedValueOnce({ distanceMeters: 100000, durationSeconds: 8400 });
    await expect(service.createRecommendation(dto)).resolves.toHaveProperty('courses');
    expect(ai.generateCourseDraft).toHaveBeenCalledTimes(2);
    expect(adapter.compute).toHaveBeenCalledTimes(12);
    const second = ai.generateCourseDraft.mock.calls[1][0] as PlanningInput;
    expect(second.feedback?.kind).toBe('REPLAN');
  });
  it('limits replan to one when routes remain infeasible', async () => {
    const { service, ai, adapter } = setup();
    adapter.compute.mockResolvedValue({ distanceMeters: 100000, durationSeconds: 8400 });
    await expect(service.createRecommendation(dto)).rejects.toBeInstanceOf(
      RecommendationFailedException,
    );
    expect(ai.generateCourseDraft).toHaveBeenCalledTimes(2);
  });
  it('enforces total available hours and the same-day boundary', async () => {
    const { service, ai } = setup();
    await expect(
      service.createRecommendation({ ...dto, startTime: '23:00' }),
    ).rejects.toBeInstanceOf(RecommendationFailedException);
    expect(ai.generateCourseDraft).toHaveBeenCalledTimes(2);
    const s = setup();
    const d = draft();
    d.courses.forEach((c) => c.stops.forEach((stop) => (stop.recommendedStaySeconds = 3600)));
    s.ai.generateCourseDraft.mockResolvedValue(JSON.stringify(d));
    await expect(
      s.service.createRecommendation({ ...dto, availableHours: 2 }),
    ).rejects.toBeInstanceOf(RecommendationFailedException);
  });
});
describe('network retry', () => {
  it.each([429, 499, 500, 503])('retries HTTP %s at most twice', async (status) => {
    const operation = jest.fn().mockRejectedValue(Object.assign(new Error('API'), { status }));
    const sleep = jest.fn().mockResolvedValue(undefined);
    await expect(networkRetry(operation, sleep)).rejects.toThrow();
    expect(operation).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls[0][0]).toBeGreaterThanOrEqual(250);
    expect(sleep.mock.calls[1][0]).toBeGreaterThanOrEqual(500);
  });
  it.each(['TimeoutError', 'AbortError'])('retries %s and recovers', async (name) => {
    const op = jest
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error('timeout'), { name }))
      .mockResolvedValue('ok');
    await expect(networkRetry(op, async () => {})).resolves.toBe('ok');
    expect(op).toHaveBeenCalledTimes(2);
  });
  it('does not retry bad requests or schema errors', async () => {
    const op = jest
      .fn()
      .mockRejectedValue(Object.assign(new Error('bad request'), { status: 400 }));
    await expect(networkRetry(op)).rejects.toThrow();
    expect(op).toHaveBeenCalledTimes(1);
  });
});
describe('candidate provider and schema', () => {
  const row = (id: bigint, latitude = 37.5) => ({
    id,
    name: 'DB',
    category: 'PHOTO_SPOT',
    description: null,
    businessHours: null,
    closedDays: null,
    address: '주소',
    latitude,
    longitude: 127,
    imageUrl: null,
    musicVideos: [
      {
        musicVideo: {
          id: 9007199254740993n,
          title: 'MV',
          youtubeUrl: null,
          idol: { id: 1n, name: '아이돌' },
        },
      },
    ],
  });
  it('loads actual relations without N+1 and serializes BigInt safely', async () => {
    const prisma = {
      filmingLocation: {
        findUnique: jest.fn().mockResolvedValue(row(10n)),
        findMany: jest
          .fn()
          .mockResolvedValue([row(9007199254740993n), row(12n, 80), row(13n, NaN)]),
      },
    };
    const result = await new RecommendationCandidateProvider(
      prisma as unknown as PrismaService,
    ).getPool(dto);
    expect(prisma.filmingLocation.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 10n },
        include: { musicVideos: { include: { musicVideo: { include: { idol: true } } } } },
      }),
    );
    expect(prisma.filmingLocation.findMany).toHaveBeenCalledTimes(1);
    expect(result.candidatePool).toHaveLength(1);
    expect(result.candidatePool[0].locationId).toBe('9007199254740993');
    expect(() => JSON.stringify(result)).not.toThrow();
  });
  it('does not query pool if selected location is missing', async () => {
    const prisma = {
      filmingLocation: { findUnique: jest.fn().mockResolvedValue(null), findMany: jest.fn() },
    };
    await expect(
      new RecommendationCandidateProvider(prisma as unknown as PrismaService).getPool(dto),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.filmingLocation.findMany).not.toHaveBeenCalled();
  });
  it('builds dynamic enum from only this request pool', () => {
    const ids = input.candidatePool.map((p) => p.candidateId);
    expect(
      recommendationSchema(ids).properties.courses.items.properties.stops.items.properties
        .candidateId.enum,
    ).toEqual(ids);
  });
});
describe('Google Maps adapter', () => {
  const config = { getOrThrow: jest.fn().mockReturnValue('test-key') } as unknown as ConfigService;
  afterEach(() => jest.restoreAllMocks());
  it('parses Maps values and sends transit departure per leg', async () => {
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ routes: [{ distanceMeters: 1500, duration: '600.2s' }] })),
      );
    const result = await new GoogleMapsRouteAdapter(config).compute(
      candidate(10),
      candidate(11),
      TransportMode.BUS,
      '2026-09-09T01:00:00Z',
    );
    expect(result).toEqual({ distanceMeters: 1500, durationSeconds: 601 });
    const body = JSON.parse(fetchMock.mock.calls[0][1]?.body as string) as Record<string, unknown>;
    expect(body).toMatchObject({ travelMode: 'TRANSIT', departureTime: '2026-09-09T01:00:00Z' });
  });
  it.each([
    [{}, 'MAP_ROUTE_NOT_FOUND'],
    [{ routes: [] }, 'MAP_ROUTE_NOT_FOUND'],
    [{ routes: [{ distanceMeters: -1, duration: 'bad' }] }, 'MAP_API_INVALID_RESPONSE'],
  ])('rejects missing or invalid route data', async (data, code) => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(data)));
    await expect(
      new GoogleMapsRouteAdapter(config).compute(
        candidate(10),
        candidate(11),
        TransportMode.WALK,
        '2026-09-09T01:00:00Z',
      ),
    ).rejects.toMatchObject({ code });
  });
  it('uses the next Korea-local start time for undated transit requests', () => {
    expect(departureDate('09:00', new Date('2026-09-08T01:00:00Z')).toISOString()).toBe(
      '2026-09-09T00:00:00.000Z',
    );
  });
});
