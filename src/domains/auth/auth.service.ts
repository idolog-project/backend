import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma, type User } from '@prisma/client';
import * as bcrypt from 'bcrypt';

import { SignUpDto } from './dto/sign-up.dto';
import { AuthRepository } from './auth.repository';

/**
 * 클라이언트에 안전하게 공개할 사용자 정보입니다.
 * passwordHash, googleSub처럼 민감하거나 내부 구현에만 필요한 값은 절대 포함하지 않습니다.
 */
type PublicUser = {
  id: number;
  email: string;
  nickname: string;
};

@Injectable()
export class AuthService {
  /** bcrypt 비용입니다. 숫자가 클수록 추측 공격에는 강하지만 해시 생성은 느려집니다. */
  private static readonly BCRYPT_SALT_ROUNDS = 12;

  constructor(private readonly authRepository: AuthRepository) {}

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
}
