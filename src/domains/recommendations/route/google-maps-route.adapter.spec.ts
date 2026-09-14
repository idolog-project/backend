import { mapsFailureReason, GoogleMapsRouteAdapter } from './google-maps-route.adapter';
import { ConfigService } from '@nestjs/config';
import { TransportMode } from '../dto/create-recommendation.dto';
import type { RecommendationCandidate } from '../types/planning.type';
describe('Maps permission diagnostics', () => {
  afterEach(() => jest.restoreAllMocks());
  it.each([
    [TransportMode.TAXI, 'DRIVE'],
    [TransportMode.CAR, 'DRIVE'],
    [TransportMode.WALK, 'WALK'],
    [TransportMode.BUS, 'TRANSIT'],
  ])('maps %s to Google %s', async (mode, travelMode) => {
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ routes: [{ distanceMeters: 1200, duration: '600s' }] })),
      );
    const adapter = new GoogleMapsRouteAdapter({
      getOrThrow: () => 'test-key',
    } as unknown as ConfigService);
    const from = { latitude: 37.5, longitude: 127 } as RecommendationCandidate;
    const to = { latitude: 37.51, longitude: 127.01 } as RecommendationCandidate;
    await expect(adapter.compute(from, to, mode, '2026-09-14T00:00:00Z')).resolves.toEqual({
      distanceMeters: 1200,
      durationSeconds: 600,
    });
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://routes.googleapis.com/directions/v2:computeRoutes',
    );
    const body = JSON.parse(fetchMock.mock.calls[0][1]?.body as string) as Record<string, unknown>;
    expect(body).toMatchObject({
      travelMode,
      origin: { location: { latLng: from } },
      destination: { location: { latLng: to } },
    });
    if (mode === TransportMode.BUS) {
      expect(body).toMatchObject({
        departureTime: '2026-09-14T00:00:00Z',
        transitPreferences: { allowedTravelModes: ['BUS'] },
      });
    } else {
      expect(body).not.toHaveProperty('departureTime');
      expect(body).not.toHaveProperty('transitPreferences');
    }
  });
  it.each([
    'SERVICE_DISABLED',
    'BILLING_DISABLED',
    'API_KEY_SERVICE_BLOCKED',
    'API_KEY_IP_ADDRESS_BLOCKED',
    'API_KEY_HTTP_REFERRER_BLOCKED',
  ])('preserves safe reason %s', async (reason) => {
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(
          JSON.stringify({ error: { message: 'secret metadata', details: [{ reason }] } }),
          { status: 403 },
        ),
      );
    const adapter = new GoogleMapsRouteAdapter({
      getOrThrow: () => 'test-key',
    } as unknown as ConfigService);
    const place = { latitude: 37.5, longitude: 127 } as RecommendationCandidate;
    await expect(
      adapter.compute(place, place, TransportMode.CAR, '2026-09-08T00:00:00Z'),
    ).rejects.toMatchObject({ code: `MAP_HTTP_403_${reason}` });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it.each([
    null,
    {},
    { error: { details: 'secret' } },
    { error: { details: [{ reason: 'SECRET_VALUE' }] } },
  ])('does not expose arbitrary error data', (body) => {
    expect(mapsFailureReason(body)).toBeUndefined();
  });
});
