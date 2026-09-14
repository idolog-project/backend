import { ConfigService } from '@nestjs/config';
import { KakaoMobilityRouteAdapter } from './kakao-mobility-route.adapter';
import { GoogleMapsRouteAdapter } from './google-maps-route.adapter';
import { MapRouteService } from './map-route.service';
import { TransportMode } from '../dto/create-recommendation.dto';
import type {
  AIRecommendationDraft,
  PlanningInput,
  RecommendationCandidate,
} from '../types/planning.type';
const from = { candidateId: 'PLACE_1', latitude: 37.5, longitude: 127 } as RecommendationCandidate;
const to = {
  candidateId: 'PLACE_2',
  latitude: 37.51,
  longitude: 127.01,
} as RecommendationCandidate;
const config = { get: () => 'test-key' } as unknown as ConfigService;
describe('Kakao automotive routing', () => {
  afterEach(() => jest.restoreAllMocks());
  it('sends longitude first, authenticates via header and preserves meters/seconds', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          routes: [{ result_code: 0, summary: { distance: 19032, duration: 3494 } }],
        }),
      ),
    );
    await expect(new KakaoMobilityRouteAdapter(config).compute(from, to)).resolves.toEqual({
      distanceMeters: 19032,
      durationSeconds: 3494,
    });
    const url = new URL(fetchMock.mock.calls[0][0] as URL);
    expect(url.searchParams.get('origin')).toBe('127,37.5');
    expect(url.searchParams.get('destination')).toBe('127.01,37.51');
    expect(url.searchParams.get('summary')).toBe('true');
    expect(fetchMock.mock.calls[0][1]?.headers).toMatchObject({
      Authorization: 'KakaoAK test-key',
    });
  });
  it.each([
    [{ routes: [] }, 'KAKAO_ROUTE_NOT_FOUND'],
    [{ routes: [{ result_code: 104 }] }, 'KAKAO_ROUTE_NOT_FOUND'],
    [{ routes: [{ result_code: 0 }] }, 'KAKAO_INVALID_RESPONSE'],
    [
      { routes: [{ result_code: 0, summary: { distance: -1, duration: 100 } }] },
      'KAKAO_INVALID_RESPONSE',
    ],
  ])('rejects unsuccessful or malformed responses', async (body, code) => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(body)));
    await expect(new KakaoMobilityRouteAdapter(config).compute(from, to)).rejects.toMatchObject({
      code,
    });
  });
  it('rejects missing credentials before network access', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch');
    const adapter = new KakaoMobilityRouteAdapter({ get: () => '' } as unknown as ConfigService);
    await expect(adapter.compute(from, to)).rejects.toMatchObject({
      code: 'KAKAO_API_KEY_MISSING',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('reports 403 without leaking provider response text', async () => {
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('sensitive text', { status: 403 }));
    await expect(new KakaoMobilityRouteAdapter(config).compute(from, to)).rejects.toMatchObject({
      code: 'KAKAO_HTTP_403',
      message: 'KAKAO_HTTP_403',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it.each([TransportMode.TAXI, TransportMode.CAR, TransportMode.WALK, TransportMode.BUS])(
    'selects provider for %s',
    async (transportMode) => {
      const google = {
        compute: jest.fn().mockResolvedValue({ distanceMeters: 1, durationSeconds: 2 }),
      };
      const kakao = {
        compute: jest.fn().mockResolvedValue({ distanceMeters: 3, durationSeconds: 4 }),
        assertConfigured: jest.fn(),
      };
      const service = new MapRouteService(
        google as unknown as GoogleMapsRouteAdapter,
        kakao as unknown as KakaoMobilityRouteAdapter,
      );
      const input = {
        fixedStartLocation: from,
        candidatePool: [to],
        userConditions: { transportMode },
      } as PlanningInput;
      const draft = {
        courses: [
          {
            courseType: 'A',
            stops: [{ candidateId: to.candidateId, recommendedStaySeconds: 900 }],
          },
        ],
      } as AIRecommendationDraft;
      service.assertConfigured(transportMode);
      const result = await service.route(draft, input, new Map([[to.candidateId, to]]));
      const automotive =
        transportMode === TransportMode.CAR || transportMode === TransportMode.TAXI;
      expect(kakao.compute).toHaveBeenCalledTimes(automotive ? 1 : 0);
      expect(google.compute).toHaveBeenCalledTimes(automotive ? 0 : 1);
      expect(result[0].legs[0].distanceMeters).toBe(automotive ? 3 : 1);
    },
  );
});
