import { ConflictException } from '@nestjs/common';

import { AuthRepository } from './auth.repository';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  // 실제 DB 대신 Repository의 필요한 동작만 흉내 내는 객체입니다.
  const findUserByEmail = jest.fn();
  const createLocalUser = jest.fn();
  const authRepository = {
    findUserByEmail,
    createLocalUser,
  } as unknown as jest.Mocked<AuthRepository>;
  const authService = new AuthService(authRepository);

  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('hashes the password and creates a local user', async () => {
    findUserByEmail.mockResolvedValue(null);
    createLocalUser.mockImplementation((input) =>
      Promise.resolve({
        id: 1n,
        email: input.email,
        passwordHash: input.passwordHash,
        googleSub: null,
        nickname: input.nickname,
        preferredLanguage: input.preferredLanguage,
        provider: 'LOCAL',
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    );

    const result = await authService.signUp({
      email: ' Fan@Idolog.kr ',
      password: 'password123',
      nickname: ' 아이돌팬 ',
    });

    expect(createLocalUser).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'fan@idolog.kr',
        nickname: '아이돌팬',
        preferredLanguage: 'ko',
        // 해시는 매번 달라지므로, 원문과 다른 문자열인지로 확인합니다.
        passwordHash: expect.not.stringMatching(/^password123$/),
      }),
    );
    expect(result).toEqual({ id: 1, email: 'fan@idolog.kr', nickname: '아이돌팬' });
  });

  it('rejects a duplicate email before hashing or creating a user', async () => {
    findUserByEmail.mockResolvedValue({});

    await expect(
      authService.signUp({
        email: 'fan@idolog.kr',
        password: 'password123',
        nickname: '아이돌팬',
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(createLocalUser).not.toHaveBeenCalled();
  });
});
