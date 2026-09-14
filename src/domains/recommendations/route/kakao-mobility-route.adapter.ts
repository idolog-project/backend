import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as Joi from 'joi';
import { networkRetry } from '../ai/network-retry';
import {
  PlanningError,
  RecommendationCandidate,
  RouteLeg,
  validCoordinates,
} from '../types/planning.type';
const responseSchema = Joi.object({
  routes: Joi.array()
    .items(
      Joi.object({
        result_code: Joi.number().integer().required(),
        summary: Joi.object({
          distance: Joi.number().integer().min(0).required(),
          duration: Joi.number().integer().min(0).required(),
        })
          .unknown(true)
          .when('result_code', { is: 0, then: Joi.required() }),
      }).unknown(true),
    )
    .required(),
}).unknown(true);
@Injectable()
export class KakaoMobilityRouteAdapter {
  constructor(private readonly config: ConfigService) {}
  assertConfigured(): void {
    if (!this.config.get<string>('KAKAO_MOBILITY_API_KEY')?.trim())
      throw new PlanningError('KAKAO_API_KEY_MISSING');
  }
  async compute(from: RecommendationCandidate, to: RecommendationCandidate): Promise<RouteLeg> {
    this.assertConfigured();
    if (!validCoordinates(from) || !validCoordinates(to))
      throw new PlanningError('KAKAO_INVALID_COORDINATES');
    const url = new URL('https://apis-navi.kakaomobility.com/v1/directions');
    url.search = new URLSearchParams({
      origin: `${from.longitude},${from.latitude}`,
      destination: `${to.longitude},${to.latitude}`,
      priority: 'RECOMMEND',
      summary: 'true',
      alternatives: 'false',
    }).toString();
    try {
      return await networkRetry(async () => {
        const response = await fetch(url, {
          headers: {
            Authorization: `KakaoAK ${this.config.get<string>('KAKAO_MOBILITY_API_KEY')!.trim()}`,
            'Content-Type': 'application/json',
          },
          signal: AbortSignal.timeout(10000),
        });
        if (!response.ok)
          throw Object.assign(new Error('KAKAO_HTTP_ERROR'), { status: response.status });
        const raw: unknown = await response.json();
        const parsed = responseSchema.validate(raw, { convert: false });
        if (parsed.error) throw new PlanningError('KAKAO_INVALID_RESPONSE');
        const data = parsed.value as {
          routes: Array<{ result_code: number; summary?: { distance: number; duration: number } }>;
        };
        const route = data.routes.find((r) => r.result_code === 0);
        if (!route?.summary) throw new PlanningError('KAKAO_ROUTE_NOT_FOUND');
        return { distanceMeters: route.summary.distance, durationSeconds: route.summary.duration };
      });
    } catch (error) {
      if (error instanceof PlanningError) throw error;
      if (error instanceof SyntaxError) throw new PlanningError('KAKAO_INVALID_JSON');
      if (error instanceof Error && ['AbortError', 'TimeoutError'].includes(error.name))
        throw new PlanningError('KAKAO_TIMEOUT');
      const status = error instanceof Error ? Number(Reflect.get(error, 'status')) : 0;
      throw new PlanningError(
        Number.isInteger(status) && status >= 400 && status <= 599
          ? `KAKAO_HTTP_${status}`
          : 'KAKAO_API_FAILED',
      );
    }
  }
}
