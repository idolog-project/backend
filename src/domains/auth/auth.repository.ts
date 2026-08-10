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
}
