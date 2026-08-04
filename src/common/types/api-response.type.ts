export type ApiResponse<T> = {
  isSuccess: boolean;
  code: string;
  message: string;
  result: T;
};

export const DEFAULT_SUCCESS_CODE = 'COMMON200';
export const DEFAULT_SUCCESS_MESSAGE = '요청에 성공했습니다.';

export const createSuccessResponse = <T>(
  result: T,
  code = DEFAULT_SUCCESS_CODE,
  message = DEFAULT_SUCCESS_MESSAGE,
): ApiResponse<T> => ({
  isSuccess: true,
  code,
  message,
  result,
});

export const createErrorResponse = <T>(
  result: T,
  code: string,
  message: string,
): ApiResponse<T> => ({
  isSuccess: false,
  code,
  message,
  result,
});
