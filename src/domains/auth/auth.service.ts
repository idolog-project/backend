import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthProvider, Prisma, type User } from '@prisma/client';
import * as bcrypt from 'bcrypt';

import { SignUpDto } from './dto/sign-up.dto';
import { AuthRepository } from './auth.repository';
import { LogInDto } from './dto/log-in.dto';
import type { GoogleProfile } from './strategies/google.strategy';

/**
 * 클라이언트에 안전하게 공개할 사용자 정보입니다.
 * passwordHash, googleSub처럼 민감하거나 내부 구현에만 필요한 값은 절대 포함하지 않습니다.
 */
type PublicUser = {
  id: number;
  email: string;
  nickname: string;
};

/** 로그인 성공 후 프론트엔드가 Authorization 헤더에 넣을 access token입니다. */
type AccessTokenResponse = {
  accessToken: string;
};

@Injectable()
export class AuthService {
  /** bcrypt 비용입니다. 숫자가 클수록 추측 공격에는 강하지만 해시 생성은 느려집니다. */
  private static readonly BCRYPT_SALT_ROUNDS = 12;

  constructor(
    private readonly authRepository: AuthRepository,
    private readonly jwtService: JwtService,
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
    // 이메일 대소문자·앞뒤 공백 차이로 중복 계정이 생기지 않게 합니다.
    const email = signUpDto.email.trim().toLowerCase();
    const existingUser = await this.authRepository.findUserByEmail(email);

    if (existingUser) {
      // 이메일 존재 여부를 명확하게 알려 주는 회원가입 전용 오류입니다.
      throw new ConflictException('이미 가입된 이메일입니다.');
    }

    // 원문 비밀번호는 이 줄 이후 DB에 저장하지 않습니다.
    const passwordHash = await bcrypt.hash(signUpDto.password, AuthService.BCRYPT_SALT_ROUNDS);

    let user: User;
    try {
      user = await this.authRepository.createLocalUser({
        email,
        passwordHash,
        nickname: signUpDto.nickname.trim(),
        // DTO에서는 선택값이지만 DB column은 필수이므로 여기서 기본값을 채웁니다.
        preferredLanguage: signUpDto.preferredLanguage ?? 'ko',
      });
    } catch (error) {
      /**
       * findUserByEmail 직후에 다른 요청이 가입할 수 있습니다.
       * 그래서 DB unique 제약(P2002)도 중복 이메일로 변환해야 경쟁 상태에서도 409를 보장합니다.
       */
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('이미 가입된 이메일입니다.');
      }
      throw error;
    }

    return {
      // Prisma의 BigInt는 JSON으로 바로 반환할 수 없으므로 number로 변환합니다.
      id: Number(user.id),
      email: user.email,
      // 로컬 회원가입에서는 nickname을 항상 받지만, DB 타입 안전성을 위해 빈 문자열도 대비합니다.
      nickname: user.nickname ?? '',
    };
  }

  /**
   * 로컬 로그인 흐름입니다.
   *
   * 이메일 존재 여부와 비밀번호 오류를 같은 401 메시지로 처리합니다.
   * 둘을 구분해 주면 공격자가 가입된 이메일을 알아낼 수 있기 때문입니다.
   */
  async logIn(logInDto: LogInDto): Promise<AccessTokenResponse> {
    const email = logInDto.email.trim().toLowerCase();
    const user = await this.authRepository.findUserByEmail(email);

    // Google 전용 계정은 로컬 비밀번호로 로그인할 수 없습니다.
    if (!user || user.provider !== AuthProvider.LOCAL || !user.passwordHash) {
      throw new UnauthorizedException('이메일 또는 비밀번호가 올바르지 않습니다.');
    }

    // compare는 요청의 원문 비밀번호와 DB의 해시를 안전하게 비교합니다.
    const isPasswordValid = await bcrypt.compare(logInDto.password, user.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedException('이메일 또는 비밀번호가 올바르지 않습니다.');
    }

    return this.issueAccessToken(user);
  }

  /**
   * Google OAuth가 검증한 profile로 로그인하거나, 처음 방문한 사용자면 계정을 생성합니다.
   *
   * LOCAL 계정과 같은 이메일이라고 자동 연결하지 않습니다. 계정 탈취 위험을 피하기 위해
   * 계정 연결 기능은 사용자가 로그인한 상태에서 별도의 인증 절차로 구현해야 합니다.
   */
  async googleLogIn(profile: GoogleProfile): Promise<AccessTokenResponse> {
    const existingGoogleUser = await this.authRepository.findUserByGoogleSub(profile.googleSub);
    if (existingGoogleUser) {
      return this.issueAccessToken(existingGoogleUser);
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
      // 동시에 같은 Google 계정으로 가입을 요청한 경우에도 중복 계정을 만들지 않습니다.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('이미 가입된 이메일 또는 Google 계정입니다.');
      }
      throw error;
    }

    return this.issueAccessToken(user);
  }

  /**
   * 로그인 방식과 관계없이 동일한 access token을 발급합니다.
   * Google OAuth 구현 시에도 Google 사용자 검증 후 이 메서드를 호출합니다.
   */
  private async issueAccessToken(user: User): Promise<AccessTokenResponse> {
    const accessToken = await this.jwtService.signAsync({
      // BigInt는 JWT payload에 직접 넣지 않고 문자열로 변환합니다.
      sub: user.id.toString(),
      email: user.email,
    });

    return { accessToken };
  }
}
