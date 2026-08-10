import { Injectable } from '@nestjs/common';
import { AuthProvider, type User } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AuthRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 가입 전에 이메일 중복을 확인할 때 사용합니다.
   * email은 Prisma schema에서 unique이므로 findUnique가 가장 알맞습니다.
   */
  findUserByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email } });
  }

  /** Google이 부여한 고유 subject 값으로 기존 소셜 계정을 찾습니다. */
  findUserByGoogleSub(googleSub: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { googleSub } });
  }

  /** access/refresh token payload의 사용자 식별자로 현재 사용자를 조회합니다. */
  findUserById(id: bigint): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  /**
   * refresh token 원문은 저장하지 않습니다.
   * 해시를 null로 바꾸면 이전 refresh token은 더 이상 재발급에 사용할 수 없습니다.
   */
  updateRefreshTokenHash(id: bigint, refreshTokenHash: string | null): Promise<User> {
    return this.prisma.user.update({
      where: { id },
      data: { refreshTokenHash },
    });
  }

  /**
   * 로컬 계정을 생성합니다.
   * passwordHash만 받아 저장하므로, 이 계층에도 비밀번호 원문이 전달되지 않습니다.
   */
  createLocalUser(input: {
    email: string;
    passwordHash: string;
    nickname: string;
    preferredLanguage: string;
  }): Promise<User> {
    return this.prisma.user.create({
      data: {
        ...input,
        provider: AuthProvider.LOCAL,
      },
    });
  }

  /** Google에서 검증한 식별자와 이메일로 소셜 계정을 생성합니다. */
  createGoogleUser(input: {
    email: string;
    googleSub: string;
    nickname: string;
    preferredLanguage: string;
  }): Promise<User> {
    return this.prisma.user.create({
      data: {
        ...input,
        provider: AuthProvider.GOOGLE,
      },
    });
  }
}
