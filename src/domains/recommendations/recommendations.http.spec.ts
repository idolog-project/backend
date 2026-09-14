import { PrismaService } from '../../prisma/prisma.service';
import { TourApiClient } from '../tourism/tour-api.client';
import { COURSE_AGENT } from './recommendation.types';
import { PlanningCourseAgent } from './planning-course.agent';
import { KakaoMobilityRouteAdapter } from './route/kakao-mobility-route.adapter';
import { INestApplication, Logger, NotFoundException, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { HttpExceptionFilter } from '../../common/filters/http-exception.filter';
import { ApiResponseInterceptor } from '../../common/interceptors/api-response.interceptor';
import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import { RecommendationOrchestrator } from './application/recommendation-orchestrator.service';
import { CourseAssembler } from './assembler/course-assembler.service';
import { AIOutputValidator } from './ai/ai-output.validator';
import { RecommendationAIClient } from './ai/recommendation-ai-client.interface';
import { CandidatePoolGuard } from './candidate/candidate-pool.guard';
import { RecommendationCandidateProvider } from './candidate/recommendation-candidate.provider';
import { RecommendationsController } from './recommendations.controller';
import { RecommendationsService } from './recommendations.service';
import { MapRouteService } from './route/map-route.service';
import { RouteFeasibilityValidator } from './route/route-feasibility.validator';
import { GoogleMapsRouteAdapter } from './route/google-maps-route.adapter';
import { RecommendationCandidate } from './types/planning.type';

const place = (id: number): RecommendationCandidate => ({
  source: id === 1 ? 'FILMING_LOCATION' : 'TOUR_API',
  candidateId: String(id),
  name: `장소 ${id}`,
  address: '서울',
  latitude: 37.5,
  longitude: 127,
  category: 'CULTURE',
  description: null,
  businessHours: null,
  closedDays: null,
  imageUrl: 'https://example.com/image.jpg',
  homepageUrl: null,
  musicVideos: [],
});
const body = { locationId: 1, transportMode: 'TAXI', travelStyles: ['PHOTO'] };
const rawDraft = JSON.stringify({
  courses: ['A', 'B', 'C'].map((courseType, i) => ({
    courseType,
    title: '추천 코스',
    summary: '당일 여행',
    reason: '취향을 반영했습니다.',
    stops: [2 + i, 2 + ((i + 1) % 3)].map((id, j) => ({
      candidateId: `TOUR_ko_${id}`,
      order: j + 2,
      recommendedStaySeconds: 900,
      selectionReason: '근처 관광지입니다.',
    })),
  })),
});

describe('Recommendation HTTP contract', () => {
  let app: INestApplication;
  let token: string;
  const candidates = { getPool: jest.fn() };
  const ai = { generateCourseDraft: jest.fn() };
  const map = { compute: jest.fn(), assertConfigured: jest.fn() };

  beforeAll(async () => {
    const secret = 'test-only-recommendation-access-secret';
    const jwt = new JwtService({ secret });
    token = await jwt.signAsync({ sub: '1', email: 'test@example.com' });
    const module = await Test.createTestingModule({
      controllers: [RecommendationsController],
      providers: [
        RecommendationsService,
        { provide: COURSE_AGENT, useClass: PlanningCourseAgent },
        { provide: TourApiClient, useValue: { findNearby: candidates.getPool } },
        {
          provide: PrismaService,
          useValue: {
            filmingLocation: {
              findUnique: jest.fn().mockResolvedValue({ ...place(1), id: 1n, musicVideos: [] }),
            },
          },
        },
        RecommendationOrchestrator,
        CourseAssembler,
        AIOutputValidator,
        CandidatePoolGuard,
        MapRouteService,
        RouteFeasibilityValidator,
        AccessTokenGuard,
        { provide: ConfigService, useValue: { getOrThrow: () => secret } },
        { provide: JwtService, useValue: jwt },
        { provide: RecommendationCandidateProvider, useValue: candidates },
        { provide: RecommendationAIClient, useValue: ai },
        { provide: GoogleMapsRouteAdapter, useValue: map },
        { provide: KakaoMobilityRouteAdapter, useValue: map },
      ],
    }).compile();
    app = module.createNestApplication();
    app.useLogger(false);
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    app.useGlobalInterceptors(new ApiResponseInterceptor());
    await app.init();
  });
  beforeEach(() => {
    jest.clearAllMocks();
    candidates.getPool.mockResolvedValue(
      [2, 3, 4].map((id) => ({
        ...place(id),
        contentId: String(id),
        contentTypeId: '12',
        title: `장소 ${id}`,
        language: 'ko',
        distanceMeters: 100,
      })),
    );
    ai.generateCourseDraft.mockResolvedValue(rawDraft);
    map.compute.mockResolvedValue({ distanceMeters: 1200, durationSeconds: 600 });
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());
  afterAll(async () => {
    await app.close();
  });

  it('returns three distinct schedules in the frontend envelope with HTTP 200', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/recommendations')
      .auth(token, { type: 'bearer' })
      .send(body)
      .expect(200);
    const data = response.body as {
      isSuccess: boolean;
      result: {
        courses: Array<{
          places: Array<{
            candidateId: string;
            arrivalTime: string;
            distanceFromPrevMeters: number | null;
          }>;
          totalDurationSeconds: number;
          travelDurationSeconds: number;
          endTime: string;
        }>;
      };
    };
    expect(data.isSuccess).toBe(true);
    expect(data.result.courses).toHaveLength(3);
    expect(
      new Set(data.result.courses.map((c) => c.places.map((p) => p.candidateId).join(','))).size,
    ).toBe(3);
    for (const course of data.result.courses) {
      expect(course.places[0]).toMatchObject({
        candidateId: 'PLACE_1',
        arrivalTime: '09:00',
        distanceFromPrevMeters: null,
      });
      expect(course).toMatchObject({
        totalDurationSeconds: 6600,
        travelDurationSeconds: 1200,
        endTime: '10:50',
      });
    }
  });
  it('rejects unauthenticated requests before candidate or AI calls', async () => {
    await request(app.getHttpServer()).post('/api/v1/recommendations').send(body).expect(401);
    expect(candidates.getPool).not.toHaveBeenCalled();
    expect(ai.generateCourseDraft).not.toHaveBeenCalled();
  });
  it('preserves the context endpoint and language-specific preprocessing without AI calls', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/recommendations/context')
      .auth(token, { type: 'bearer' })
      .set('Accept-Language', 'en-US,en;q=0.9')
      .send(body)
      .expect(200);
    expect(response.body).toMatchObject({ result: { language: 'en', origin: { id: 1 } } });
    expect(candidates.getPool).toHaveBeenCalledWith(
      expect.objectContaining({ language: 'en', contentTypeId: '12' }),
    );
    expect(ai.generateCourseDraft).not.toHaveBeenCalled();
    expect(map.compute).not.toHaveBeenCalled();
  });
  it('passes the prepared language and candidates to AI without fetching another pool', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/recommendations')
      .auth(token, { type: 'bearer' })
      .set('Accept-Language', 'zh-Hans')
      .send(body)
      .expect(200);
    expect(candidates.getPool).toHaveBeenCalledTimes(1);
    expect(ai.generateCourseDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        language: 'zh',
        candidatePool: expect.arrayContaining([
          expect.objectContaining({ candidateId: 'TOUR_ko_2' }),
        ]),
      }),
    );
  });
  it.each([
    { travelStyles: [] },
    { startTime: '25:00' },
    { availableHours: 1 },
    { withPet: 'false' },
    { candidatePool: [] },
    { locationId: -1 },
  ])('rejects invalid input %j', async (invalid) => {
    await request(app.getHttpServer())
      .post('/api/v1/recommendations')
      .auth(token, { type: 'bearer' })
      .send({ ...body, ...invalid })
      .expect(400);
    expect(candidates.getPool).not.toHaveBeenCalled();
  });
  it('returns an empty course list when preprocessing finds too few candidates', async () => {
    candidates.getPool.mockResolvedValue([]);
    const response = await request(app.getHttpServer())
      .post('/api/v1/recommendations')
      .auth(token, { type: 'bearer' })
      .send(body)
      .expect(200);
    expect(response.body).toMatchObject({ isSuccess: true, result: { courses: [] } });
    expect(ai.generateCourseDraft).not.toHaveBeenCalled();
  });
  it('preserves a missing filming location as HTTP 404', async () => {
    candidates.getPool.mockRejectedValue(new NotFoundException());
    await request(app.getHttpServer())
      .post('/api/v1/recommendations')
      .auth(token, { type: 'bearer' })
      .send(body)
      .expect(404);
  });
  it('returns a frontend-compatible failure without exposing upstream errors', async () => {
    ai.generateCourseDraft.mockRejectedValue(new Error('private upstream details'));
    const response = await request(app.getHttpServer())
      .post('/api/v1/recommendations')
      .auth(token, { type: 'bearer' })
      .send(body)
      .expect(503);
    expect(response.body).toMatchObject({
      isSuccess: false,
      code: 'RECOMMENDATION_FAILED',
      result: null,
    });
    expect(JSON.stringify(response.body)).not.toContain('private upstream details');
  });
});
