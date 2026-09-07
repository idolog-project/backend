import { ServiceUnavailableException } from '@nestjs/common';

export class RecommendationFailedException extends ServiceUnavailableException {
  constructor(
    readonly failureReason = 'RECOMMENDATION_INTERNAL_ERROR',
    readonly requestId?: string,
  ) {
    super({
      code: 'RECOMMENDATION_FAILED',
      message: '추천 코스를 생성할 수 없습니다.',
    });
  }
}
