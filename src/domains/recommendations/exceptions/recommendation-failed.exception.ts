import { ServiceUnavailableException } from '@nestjs/common';

export class RecommendationFailedException extends ServiceUnavailableException {
  constructor(
    readonly failureReason = 'RECOMMENDATION_INTERNAL_ERROR',
    readonly requestId?: string,
  ) {
    super({
      code:
        failureReason === 'GEMINI_DAILY_LIMIT'
          ? 'AI_DAILY_LIMIT_EXCEEDED'
          : failureReason === 'GEMINI_RATE_LIMIT'
            ? 'AI_RATE_LIMITED'
            : 'RECOMMENDATION_FAILED',
      message:
        failureReason === 'GEMINI_DAILY_LIMIT'
          ? 'AI 일일 사용 한도에 도달해 코스를 생성할 수 없습니다. 한도가 초기화된 후 다시 이용해주세요.'
          : failureReason === 'GEMINI_RATE_LIMIT'
            ? 'AI 서비스의 요청 한도에 도달했습니다. 잠시 후 다시 시도해주세요.'
            : '추천 코스를 생성할 수 없습니다.',
    });
  }
}
