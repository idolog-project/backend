import { AuthProvider, PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

/**
 * Railway와 로컬 DB에 프론트엔드 연동용 테스트 계정을 준비하는 시드 스크립트입니다.
 *
 * - prisma migrate reset과 달리 기존 테이블이나 데이터를 삭제하지 않습니다.
 * - 같은 이메일이 이미 있으면 중복 생성하지 않고 비밀번호 등만 최신 시드 값으로 맞춥니다.
 * - 비밀번호는 환경변수에서만 읽으므로 Git과 문서에 평문 비밀번호가 남지 않습니다.
 */
const prisma = new PrismaClient();

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(
      name + ' 환경변수가 필요합니다. .env 또는 Railway Variables에 값을 설정한 뒤 다시 실행하세요.',
    );
  }

  return value;
}

async function main(): Promise<void> {
  const email = requiredEnv('SEED_TEST_EMAIL').toLowerCase();
  const password = requiredEnv('SEED_TEST_PASSWORD');
  const nickname = process.env.SEED_TEST_NICKNAME?.trim() || 'Idolog 테스트';

  // 실제 로그인 API와 동일하게 bcrypt 해시만 DB에 저장합니다.
  const passwordHash = await bcrypt.hash(password, 12);
  const existingUser = await prisma.user.findUnique({ where: { email } });

  if (existingUser && existingUser.provider !== AuthProvider.LOCAL) {
    // Google 계정을 로컬 계정으로 덮어쓰면 안 됩니다.
    throw new Error(
      email + '은(는) ' + existingUser.provider + ' 계정입니다. 다른 SEED_TEST_EMAIL을 사용하세요.',
    );
  }

  if (existingUser) {
    await prisma.user.update({
      where: { email },
      data: {
        passwordHash,
        nickname,
        preferredLanguage: 'ko',
      },
    });
    console.info('테스트 계정을 갱신했습니다: ' + email);
    return;
  }

  await prisma.user.create({
    data: {
      email,
      passwordHash,
      nickname,
      preferredLanguage: 'ko',
      provider: AuthProvider.LOCAL,
    },
  });
  console.info('테스트 계정을 생성했습니다: ' + email);
}

main()
  .catch((error: unknown) => {
    console.error('시드 실행에 실패했습니다.', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
