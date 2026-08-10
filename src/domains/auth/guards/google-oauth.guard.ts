import { ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthGuard } from '@nestjs/passport';
import type { Request, Response } from 'express';

type OAuthRequest = Request & {
  session: {
    oauthRedirectTo?: string;
  };
};

/**
 * Google OAuth의 state 검증과 프론트 리다이렉트를 담당합니다.
 * redirectTo에는 외부 URL이 아닌 우리 프론트의 상대 경로만 저장합니다.
 */
@Injectable()
export class GoogleOAuthGuard extends AuthGuard('google') {
  constructor(private readonly configService: ConfigService) {
    super();
  }

  getAuthenticateOptions(context: ExecutionContext): { session: false } {
    const request = context.switchToHttp().getRequest<OAuthRequest>();

    // 로그인 시작 요청에서만 redirectTo를 저장합니다. callback query에는 Google의 code/state가 들어옵니다.
    if (request.path.endsWith('/auth/login/google')) {
      const redirectTo =
        typeof request.query.redirectTo === 'string' ? request.query.redirectTo : undefined;
      request.session.oauthRedirectTo = this.getSafeRedirectPath(redirectTo);
    }

    // OAuth profile은 Passport session에 저장하지 않고 Controller에서 즉시 처리합니다.
    return { session: false };
  }

  handleRequest<TUser = unknown>(
    error: unknown,
    user: TUser,
    info: { message?: string; code?: string } | undefined,
    context: ExecutionContext,
  ): TUser {
    if (!error && user) {
      return user;
    }

    const request = context.switchToHttp().getRequest<OAuthRequest>();
    const response = context.switchToHttp().getResponse<Response>();
    const reason = this.getErrorReason(info);
    delete request.session.oauthRedirectTo;
    response.redirect(this.getFrontendUrl('/auth/error?reason=' + reason));

    // redirect가 먼저 응답을 끝내므로 전역 예외 필터는 headersSent를 보고 JSON을 추가하지 않습니다.
    throw new UnauthorizedException('Google 로그인에 실패했습니다.');
  }

  private getSafeRedirectPath(redirectTo: string | undefined): string {
    if (!redirectTo) {
      return '/auth/callback';
    }

    // /로 시작하고 //로 시작하지 않는 상대 경로만 허용해 오픈 리다이렉트를 막습니다.
    if (redirectTo.startsWith('/') && !redirectTo.startsWith('//')) {
      return redirectTo;
    }

    return '/auth/callback';
  }

  private getErrorReason(info: { message?: string; code?: string } | undefined): string {
    const detail = (info?.message ?? info?.code ?? '').toLowerCase();
    if (detail.includes('access_denied')) return 'ACCESS_DENIED';
    if (detail.includes('state')) return 'INVALID_STATE';
    return 'AUTH_FAILED';
  }

  private getFrontendUrl(path: string): string {
    return new URL(path, this.configService.getOrThrow<string>('FRONTEND_URL')).toString();
  }
}
