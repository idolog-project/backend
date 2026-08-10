import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, type Profile } from 'passport-google-oauth20';

/**
 * Google 인증이 성공한 뒤 Controller와 Service에 전달할 최소 사용자 정보입니다.
 * Google access token은 Idolog DB에 저장하지 않습니다. 우리 서비스의 JWT만 발급합니다.
 */
export type GoogleProfile = {
  googleSub: string;
  email: string;
  nickname: string;
};

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(configService: ConfigService) {
    super({
      clientID: configService.getOrThrow<string>('GOOGLE_CLIENT_ID'),
      clientSecret: configService.getOrThrow<string>('GOOGLE_CLIENT_SECRET'),
      callbackURL: configService.getOrThrow<string>('GOOGLE_CALLBACK_URL'),
      // 로그인에 필요한 최소 권한만 요청합니다.
      scope: ['email', 'profile'],
    });
  }

  /**
   * Google이 callback URL로 돌려보낸 profile을 검증·정규화합니다.
   * Passport AuthGuard가 이 반환값을 request.user에 넣어 줍니다.
   */
  validate(_accessToken: string, _refreshToken: string, profile: Profile): GoogleProfile {
    const email = profile.emails?.[0]?.value?.trim().toLowerCase();
    if (!email) {
      // 이메일 없는 Google profile로는 Idolog 계정을 만들 수 없습니다.
      throw new UnauthorizedException('Google 계정에서 이메일 정보를 가져오지 못했습니다.');
    }

    return {
      // profile.id는 Google OAuth/OpenID Connect의 안정적인 사용자 식별자(sub)입니다.
      googleSub: profile.id,
      email,
      nickname: profile.displayName?.trim() || email.split('@')[0],
    };
  }
}
