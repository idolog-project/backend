import { mapsFailureReason, GoogleMapsRouteAdapter } from './google-maps-route.adapter';
import { ConfigService } from '@nestjs/config';
import { TransportMode } from '../dto/create-recommendation.dto';
import type { RecommendationCandidate } from '../types/planning.type';
describe('Maps permission diagnostics', () => {
  afterEach(() => jest.restoreAllMocks());
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
