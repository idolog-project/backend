import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as Joi from 'joi';
import { TransportMode } from '../dto/create-recommendation.dto';
import { PlanningError, RecommendationCandidate, RouteLeg } from '../types/planning.type';
import { networkRetry } from '../ai/network-retry';
// Only allow known provider reason codes; never log messages, keys or project metadata.
const allowedReasons = new Set([
  'SERVICE_DISABLED',
  'BILLING_DISABLED',
  'API_KEY_INVALID',
  'API_KEY_SERVICE_BLOCKED',
  'API_KEY_IP_ADDRESS_BLOCKED',
  'API_KEY_HTTP_REFERRER_BLOCKED',
  'API_KEY_ANDROID_APP_BLOCKED',
  'API_KEY_IOS_APP_BLOCKED',
  'CONSUMER_INVALID',
  'CONSUMER_SUSPENDED',
]);
export function mapsFailureReason(body: unknown): string | undefined {
  if (!body || typeof body !== 'object' || !('error' in body)) return;
  const error = body.error;
  if (!error || typeof error !== 'object' || !('details' in error) || !Array.isArray(error.details))
    return;
  for (const detail of error.details) {
    if (
      detail &&
      typeof detail === 'object' &&
      'reason' in detail &&
      typeof detail.reason === 'string' &&
      allowedReasons.has(detail.reason)
    )
      return detail.reason;
  }
}
const routeSchema = Joi.object({
  routes: Joi.array()
    .min(1)
    .items(
      Joi.object({
        distanceMeters: Joi.number().integer().min(0).required(),
        duration: Joi.string()
          .pattern(/^\d+(?:\.\d+)?s$/)
          .required(),
      }).unknown(true),
    )
    .required(),
}).unknown(true);
@Injectable()
export class GoogleMapsRouteAdapter {
  constructor(private readonly config: ConfigService) {}
  async compute(
    from: RecommendationCandidate,
    to: RecommendationCandidate,
    mode: TransportMode,
    departureTime: string,
  ): Promise<RouteLeg> {
    const waypoint = (p: RecommendationCandidate) => ({
      location: { latLng: { latitude: p.latitude, longitude: p.longitude } },
    });
    try {
      return await networkRetry(async () => {
        const response = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
          method: 'POST',
          signal: AbortSignal.timeout(10000),
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': this.config.getOrThrow<string>('GOOGLE_MAPS_API_KEY'),
            'X-Goog-FieldMask': 'routes.distanceMeters,routes.duration',
          },
          body: JSON.stringify({
            origin: waypoint(from),
            destination: waypoint(to),
            travelMode:
              mode === TransportMode.WALK
                ? 'WALK'
                : mode === TransportMode.BUS
                  ? 'TRANSIT'
                  : 'DRIVE',
            ...(mode === TransportMode.BUS
              ? { departureTime, transitPreferences: { allowedTravelModes: ['BUS'] } }
              : {}),
            languageCode: 'ko-KR',
            units: 'METRIC',
          }),
        });
        if (!response.ok) {
          const body: unknown = await response.json().catch(() => null);
          throw Object.assign(new Error('MAP_HTTP_ERROR'), {
            status: response.status,
            providerReason: mapsFailureReason(body),
          });
        }
        const raw: unknown = await response.json();
        if (
          raw &&
          typeof raw === 'object' &&
          !Array.isArray(raw) &&
          (!('routes' in raw) || (Array.isArray(raw.routes) && raw.routes.length === 0))
        ) {
          throw new PlanningError('MAP_ROUTE_NOT_FOUND');
        }
        const parsed = routeSchema.validate(raw, { convert: false });
        if (parsed.error) throw new PlanningError('MAP_API_INVALID_RESPONSE');
        const data = parsed.value as { routes: { distanceMeters: number; duration: string }[] };
        const route = data.routes[0];
        const durationSeconds = Math.ceil(Number(route.duration.slice(0, -1)));
        if (!Number.isSafeInteger(durationSeconds))
          throw new PlanningError('MAP_API_INVALID_RESPONSE');
        return { distanceMeters: route.distanceMeters, durationSeconds };
      });
    } catch (error) {
      if (error instanceof PlanningError) throw error;
      if (error instanceof SyntaxError) throw new PlanningError('MAP_API_INVALID_JSON');
      if (error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name))
        throw new PlanningError('MAP_API_TIMEOUT');
      const status = error instanceof Error ? Number(Reflect.get(error, 'status')) : 0;
      if (Number.isInteger(status) && status >= 400 && status <= 599)
        throw new PlanningError(
          `MAP_HTTP_${status}${error instanceof Error && typeof Reflect.get(error, 'providerReason') === 'string' && allowedReasons.has(Reflect.get(error, 'providerReason')) ? `_${String(Reflect.get(error, 'providerReason'))}` : ''}`,
        );
      throw new PlanningError('MAP_API_FAILED');
    }
  }
}
