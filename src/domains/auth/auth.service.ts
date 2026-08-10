import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AuthProvider, Prisma, type User } from '@prisma/client';
import * as bcrypt from 'bcrypt';

import { AuthRepository } from './auth.repository';
import { LogInDto } from './dto/log-in.dto';
import { SignUpDto } from './dto/sign-up.dto';
import type { GoogleProfile } from './strategies/google.strategy';

/**
 * 클라이언트에 안전하게 공개할 사용자 정보입니다.
 * passwordHash, refreshTokenHash, googleSub처럼 민감하거나 내부 구현에만 필요한 값은 제외합니다.
 */
export type PublicUser = {
  id: number;
  email: string;
  nickname: string;
};

export type AccessTokenResponse = {
  accessToken: string;
};

type AuthTokenPair = AccessTokenResponse & {
  refreshToken: string;
};

type RefreshTokenPayload = {
  sub: string;
  email: string;
  tokenType: 'refresh';
};

@Injectable()
export class AuthService {
  /** bcrypt 비용입니다. 숫자가 클수록 추측 공격에는 강하지만 해시 생성은 느려집니다. */
  private static readonly BCRYPT_SALT_ROUNDS = 12;

  constructor(
    private readonly authRepository: AuthRepository,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * 로컬 회원가입 흐름입니다.
   *
   * 1. 이메일을 정규화하고 중복 여부를 확인합니다.
   * 2. 비밀번호 원문을 bcrypt 해시로 바꿉니다.
   * 3. 해시와 사용자 정보를 DB에 저장합니다.
   * 4. 비밀 정보를 제외한 사용자 정보만 반환합니다.
   */
  async signUp(signUpDto: SignUpDto): Promise<PublicUser> {
    const email = signUpDto.email.trim().toLowerCase();
    const existingUser = await this.authRepository.findUserByEmail(email);

    if (existingUser) {
      throw new ConflictException('이미 가입된 이메일입니다.');
    }

    const passwordHash = await bcrypt.hash(signUpDto.password, AuthService.BCRYPT_SALT_ROUNDS);

    let user: User;
    try {
      user = await this.authRepository.createLocalUser({
        email,
        passwordHash,
        nickname: signUpDto.nickname.trim(),
        preferredLanguage: signUpDto.preferredLanguage ?? 'ko',
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('이미 가입된 이메일입니다.');
      }
      throw error;
    }

    return this.toPublicUser(user);
  }

  /**
   * 이메일/비밀번호가 맞으면 access token과 refresh token을 함께 새로 발급합니다.
   * Controller는 refresh token을 응답 body가 아닌 HttpOnly Cookie로만 전달합니다.
   */
  async logIn(logInDto: LogInDto): Promise<AuthTokenPair> {
    const email = logInDto.email.trim().toLowerCase();
    const user = await this.authRepository.findUserByEmail(email);

    if (!user || user.provider !== AuthProvider.LOCAL || !user.passwordHash) {
      throw new UnauthorizedException('이메일 또는 비밀번호가 올바르지 않습니다.');
    }

    const isPasswordValid = await bcrypt.compare(logInDto.password, user.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedException('이메일 또는 비밀번호가 올바르지 않습니다.');
    }

    return this.issueTokenPair(user);
  }

  /**
   * Google OAuth가 검증한 profile로 로그인하거나 처음 방문한 사용자면 계정을 생성합니다.
   * LOCAL 계정과 같은 이메일을 자동 연결하지 않아 계정 탈취 위험을 막습니다.
   */
  async googleLogIn(profile: GoogleProfile): Promise<AuthTokenPair> {
    const existingGoogleUser = await this.authRepository.findUserByGoogleSub(profile.googleSub);
    if (existingGoogleUser) {
      return this.issueTokenPair(existingGoogleUser);
    }

    const userWithSameEmail = await this.authRepository.findUserByEmail(profile.email);
    if (userWithSameEmail) {
      throw new ConflictException('이미 로컬 계정으로 가입된 이메일입니다.');
    }

    let user: User;
    try {
      user = await this.authRepository.createGoogleUser({
        email: profile.email,
        googleSub: profile.googleSub,
        nickname: profile.nickname,
        preferredLanguage: 'ko',
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('이미 가입된 이메일 또는 Google 계정입니다.');
      }
      throw error;
    }

    return this.issueTokenPair(user);
  }

  /**
   * refresh cookie를 검증하고 access/refresh token을 모두 교체합니다.
   * rotation을 사용하면 탈취된 과거 refresh token은 다음 갱신 뒤 더 이상 쓸 수 없습니다.
   */
  async refresh(refreshToken: string | undefined): Promise<AuthTokenPair> {
    if (!refreshToken) {
      throw new UnauthorizedException('refresh token이 필요합니다.');
    }

    let payload: RefreshTokenPayload;
    try {
      payload = await this.jwtService.verifyAsync<RefreshTokenPayload>(refreshToken, {
        secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('유효하지 않거나 만료된 refresh token입니다.');
    }

    if (payload.tokenType !== 'refresh') {
      throw new UnauthorizedException('유효하지 않은 refresh token입니다.');
    }

    let userId: bigint;
    try {
      userId = BigInt(payload.sub);
    } catch {
      throw new UnauthorizedException('유효하지 않은 refresh token입니다.');
    }

    const user = await this.authRepository.findUserById(userId);
    if (!user?.refreshTokenHash) {
      throw new UnauthorizedException('다시 로그인해 주세요.');
    }

    const isCurrentRefreshToken = await bcrypt.compare(refreshToken, user.refreshTokenHash);
    if (!isCurrentRefreshToken) {
      throw new UnauthorizedException('다시 로그인해 주세요.');
    }

    return this.issueTokenPair(user);
  }

  /**
   * 로그아웃은 성공 여부를 외부에 드러내지 않는 idempotent 동작입니다.
   * 쿠키가 없거나 이미 만료돼도 브라우저 쿠키는 지우고 성공 응답을 보냅니다.
   */
  async logOut(refreshToken: string | undefined): Promise<void> {
    if (!refreshToken) {
      return;
    }

    try {
      const payload = await this.jwtService.verifyAsync<RefreshTokenPayload>(refreshToken, {
        secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
      });
      if (payload.tokenType !== 'refresh') {
        return;
      }

      const user = await this.authRepository.findUserById(BigInt(payload.sub));
      if (user?.refreshTokenHash && (await bcrypt.compare(refreshToken, user.refreshTokenHash))) {
        await this.authRepository.updateRefreshTokenHash(user.id, null);
      }
    } catch {
      // 만료·위조 토큰도 쿠키만 지우면 되므로 오류로 응답하지 않습니다.
    }
  }

  /** access token으로 인증된 현재 사용자의 공개 정보를 반환합니다. */
  async getMe(userId: string): Promise<PublicUser> {
    let id: bigint;
    try {
      id = BigInt(userId);
    } catch {
      throw new UnauthorizedException('유효하지 않은 인증 토큰입니다.');
    }

    const user = await this.authRepository.findUserById(id);
    if (!user) {
      throw new UnauthorizedException('존재하지 않는 사용자입니다.');
    }

    return this.toPublicUser(user);
  }

  /** Cookie maxAge를 JWT refresh 만료 시간과 같게 만듭니다. */
  getRefreshTokenMaxAge(): number {
    const expiresIn = this.configService.getOrThrow<string>('JWT_REFRESH_EXPIRES_IN');
    const match = /^(\d+)([smhd])$/.exec(expiresIn);
    if (!match) {
      throw new Error('JWT_REFRESH_EXPIRES_IN 형식이 올바르지 않습니다.');
    }

    const value = Number(match[1]);
    const unitMilliseconds: Record<string, number> = {
      s: 1000,
      m: 60 * 1000,
      h: 60 * 60 * 1000,
      d: 24 * 60 * 60 * 1000,
    };
    return value * unitMilliseconds[match[2]];
  }

  private async issueTokenPair(user: User): Promise<AuthTokenPair> {
    const payload = { sub: user.id.toString(), email: user.email };
    const accessToken = await this.jwtService.signAsync(payload);
    const refreshToken = await this.jwtService.signAsync(
      { ...payload, tokenType: 'refresh' },
      {
        secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
        expiresIn: this.configService.getOrThrow<string>('JWT_REFRESH_EXPIRES_IN') as never,
      },
    );

    // DB에는 refresh token 원문 대신 해시만 저장합니다.
    const refreshTokenHash = await bcrypt.hash(refreshToken, AuthService.BCRYPT_SALT_ROUNDS);
    await this.authRepository.updateRefreshTokenHash(user.id, refreshTokenHash);

    return { accessToken, refreshToken };
  }

  private toPublicUser(user: User): PublicUser {
    return {
      id: Number(user.id),
      email: user.email,
      nickname: user.nickname ?? '',
    };
  }
}
