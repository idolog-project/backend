import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';

import { createErrorResponse } from '../../../common/types/api-response.type';
import { RecommendationFailedException } from '../exceptions/recommendation-failed.exception';

@Catch(RecommendationFailedException)
export class RecommendationExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(RecommendationExceptionFilter.name);

  catch(exception: RecommendationFailedException, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<Request>();
    const response = context.getResponse<Response>();
    const exceptionResponse = exception.getResponse();
    const message =
      typeof exceptionResponse === 'object' &&
      exceptionResponse !== null &&
      'message' in exceptionResponse
        ? String(exceptionResponse.message)
        : '추천 코스를 생성할 수 없습니다.';

    this.logger.error(
      `${request.method} ${request.originalUrl?.split('?')[0] ?? request.url} - ${HttpStatus.SERVICE_UNAVAILABLE} reason=${exception.failureReason} requestId=${exception.requestId ?? 'unknown'}`,
      exception.stack,
    );

    response
      .status(HttpStatus.SERVICE_UNAVAILABLE)
      .json(createErrorResponse(null, 'RECOMMENDATION_FAILED', message));
  }
}
