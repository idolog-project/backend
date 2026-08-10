import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApiBody,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { CookieOptions, Request, Response } from 'express';

import { AuthService } from './auth.service';
import { LogInDto } from './dto/log-in.dto';
import { AccessTokenGuard, type AccessTokenPayload } from './guards/access-token.guard';
import { GoogleOAuthGuard } from './guards/google-oauth.guard';
import { SignUpDto } from './dto/sign-up.dto';
import type { GoogleProfile } from './strategies/google.strategy';

type GoogleCallbackRequest = Request & {
  user: GoogleProfile;
  session: { oauthRedirectTo?: string };
};
type AuthenticatedRequest = Request & { user: AccessTokenPayload };

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  @Post('signup')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '로컬 회원가입' })
  @ApiBody({ type: SignUpDto })
  @ApiCreatedResponse({
    description: '회원가입에 성공했습니다.',
    schema: {
      example: {
        isSuccess: true,
        code: 'COMMON200',
        message: '요청에 성공했습니다.',
        result: { id: 1, email: 'fan@idolog.kr', nickname: '아이돌팬' },
      },
    },
  })
  @ApiConflictResponse({ description: '이미 가입된 이메일입니다.' })
  async signUp(@Body() signUpDto: SignUpDto) {
    return this.authService.signUp(signUpDto);
  }

  /**
   * access token은 JSON body로, refresh token은 JavaScript가 읽을 수 없는 HttpOnly Cookie로 보냅니다.
   * 프론트는 access token만 메모리에 보관하고, 새로고침 후에는 /auth/refresh를 호출합니다.
   */
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '로컬 로그인' })
  @ApiBody({ type: LogInDto })
  @ApiOkResponse({ description: '로그인에 성공하고 refresh token Cookie를 설정합니다.' })
  async logIn(@Body() logInDto: LogInDto, @Res({ passthrough: true }) response: Response) {
    const tokens = await this.authService.logIn(logInDto);
    this.setRefreshCookie(response, tokens.refreshToken);
    return { accessToken: tokens.accessToken };
  }

  /** Google 로그인 페이지로 브라우저를 리다이렉트합니다. */
  @Get('login/google')
  @UseGuards(GoogleOAuthGuard)
  @ApiOperation({ summary: 'Google 로그인 시작' })
  async startGoogleOAuth(): Promise<void> {
    // AuthGuard가 Google로 리다이렉트하므로 Controller 본문은 비어 있습니다.
  }

  /**
   * Google 인증 뒤 refresh cookie만 설정하고 프론트 콜백 페이지로 이동합니다.
   * access token을 URL query에 넣으면 히스토리·리퍼러에 남으므로 절대 전달하지 않습니다.
   */
  @Get('callback/google')
  @UseGuards(GoogleOAuthGuard)
  @ApiOperation({ summary: 'Google 로그인 콜백' })
  @ApiOkResponse({ description: 'refresh cookie를 설정한 뒤 프론트로 리다이렉트합니다.' })
  async completeGoogleOAuth(
    @Req() request: GoogleCallbackRequest,
    @Res() response: Response,
  ): Promise<void> {
    try {
      const tokens = await this.authService.googleLogIn(request.user);
      this.setRefreshCookie(response, tokens.refreshToken);
      const redirectPath = request.session.oauthRedirectTo ?? '/auth/callback';
      delete request.session.oauthRedirectTo;
      response.redirect(this.getFrontendUrl(redirectPath));
    } catch {
      delete request.session.oauthRedirectTo;
      response.redirect(this.getFrontendUrl('/auth/error?reason=AUTH_FAILED'));
    }
  }

  /** refresh cookie가 유효하면 새 access token과 교체된 refresh cookie를 발급합니다. */
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'access token 재발급' })
  @ApiOkResponse({ description: 'refresh token을 교체하고 새 access token을 반환합니다.' })
  async refresh(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const tokens = await this.authService.refresh(request.cookies?.refreshToken);
    this.setRefreshCookie(response, tokens.refreshToken);
    return { accessToken: tokens.accessToken };
  }

  /** refresh token DB 해시와 브라우저 cookie를 모두 폐기합니다. */
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '로그아웃' })
  @ApiOkResponse({ description: '현재 브라우저의 로그인을 해제합니다.' })
  async logOut(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    await this.authService.logOut(request.cookies?.refreshToken);
    response.clearCookie('refreshToken', this.getRefreshCookieOptions());
    return null;
  }

  /** Authorization Bearer access token으로 현재 로그인 사용자를 조회합니다. */
  @Get('me')
  @UseGuards(AccessTokenGuard)
  @ApiOperation({ summary: '내 정보 조회' })
  @ApiOkResponse({ description: '현재 로그인 사용자의 공개 정보를 반환합니다.' })
  async getMe(@Req() request: AuthenticatedRequest) {
    return this.authService.getMe(request.user.sub);
  }

  private setRefreshCookie(response: Response, refreshToken: string): void {
    response.cookie('refreshToken', refreshToken, {
      ...this.getRefreshCookieOptions(),
      maxAge: this.authService.getRefreshTokenMaxAge(),
    });
  }

  private getRefreshCookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      // Railway 운영 환경은 HTTPS이므로 COOKIE_SECURE=true로 설정해야 합니다.
      secure: this.configService.getOrThrow<boolean>('COOKIE_SECURE'),
      sameSite: 'strict',
      // auth API에만 cookie를 보내도록 범위를 제한합니다.
      path: '/api/v1/auth',
    };
  }

  private getFrontendUrl(path: string): string {
    return new URL(path, this.configService.getOrThrow<string>('FRONTEND_URL')).toString();
  }
}
