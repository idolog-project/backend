import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';

export type AccessTokenPayload = {
  sub: string;
  email: string;
};

type AuthenticatedRequest = Request & { user: AccessTokenPayload };

/**
 * Authorization: Bearer <access token> 헤더를 검사하는 Guard입니다.
 * refresh token은 HttpOnly Cookie에만 있으므로 이 Guard로 인증할 수 없습니다.
 */
@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authorization = request.headers.authorization;
    const [scheme, token] = authorization?.split(' ') ?? [];

    if (scheme !== 'Bearer' || !token) {
      throw new UnauthorizedException('인증 토큰이 필요합니다.');
    }

    try {
      request.user = await this.jwtService.verifyAsync<AccessTokenPayload>(token, {
        secret: this.configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
      });
      return true;
    } catch {
      throw new UnauthorizedException('유효하지 않거나 만료된 인증 토큰입니다.');
    }
  }
}
