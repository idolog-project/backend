import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

import { getCommonErrorCode } from '../constants/error-code';
import { createErrorResponse } from '../types/api-response.type';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<Request>();
    const response = context.getResponse<Response>();
    const statusCode =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const message = this.getMessage(exception, statusCode);

    this.logException(exception, request, statusCode);
    if (response.headersSent) return;

    response
      .status(statusCode)
      .json(createErrorResponse(null, getCommonErrorCode(statusCode), message));
  }

  private getMessage(exception: unknown, statusCode: number): string {
    if (statusCode >= 500) {
      return '서버 오류가 발생했습니다.';
    }

    if (!(exception instanceof HttpException)) return '요청을 처리할 수 없습니다.';
    const response = exception.getResponse();
    if (typeof response === 'string') return response;
    if (typeof response === 'object' && response !== null && 'message' in response) {
      const message = response.message;
      return Array.isArray(message) ? message.join(', ') : String(message);
    }
    return '요청을 처리할 수 없습니다.';
  }

  private logException(exception: unknown, request: Request, statusCode: number): void {
    const path = request.originalUrl?.split('?')[0] ?? request.url;
    const logMessage = `${request.method} ${path} - ${statusCode}`;

    if (statusCode >= 500) {
      this.logger.error(
        logMessage,
        exception instanceof Error ? exception.stack : String(exception),
      );
      return;
    }
    this.logger.warn(logMessage);
  }
}
