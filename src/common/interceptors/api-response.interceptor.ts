import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, map } from 'rxjs';

import { ApiResponse, createSuccessResponse } from '../types/api-response.type';

@Injectable()
export class ApiResponseInterceptor<T> implements NestInterceptor<T, ApiResponse<T | null>> {
  intercept(_context: ExecutionContext, next: CallHandler<T>): Observable<ApiResponse<T | null>> {
    return next.handle().pipe(
      map((result: T) => {
        if (this.isApiResponse(result)) {
          return result;
        }

        return createSuccessResponse(result ?? null);
      }),
    );
  }

  private isApiResponse(value: unknown): value is ApiResponse<T> {
    return (
      typeof value === 'object' &&
      value !== null &&
      'isSuccess' in value &&
      'code' in value &&
      'message' in value &&
      'result' in value
    );
  }
}
