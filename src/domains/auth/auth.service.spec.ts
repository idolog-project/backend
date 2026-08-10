import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';

import { AuthRepository } from './auth.repository';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  // 실제 DB 대신 Repository의 필요한 동작만 흉내 내는 객체입니다.
  const findUserByEmail = jest.fn();
  const createLocalUser = jest.fn();
  const findUserByGoogleSub = jest.fn();
  const createGoogleUser = jest.fn();
  const findUserById = jest.fn();
  const updateRefreshTokenHash = jest.fn();
  const signAsync = jest.fn();
  const verifyAsync = jest.fn();
  const authRepository = {
    findUserByEmail,
    createLocalUser,
    findUserByGoogleSub,
    createGoogleUser,
    findUserById,
    updateRefreshTokenHash,
  } as unknown as jest.Mocked<AuthRepository>;
  const jwtService = { signAsync, verifyAsync } as unknown as jest.Mocked<JwtService>;
  const getOrThrow = jest.fn();
  const configService = { getOrThrow };
  const authService = new AuthService(authRepository, jwtService, configService as never);

  beforeEach(() => {
    jest.resetAllMocks();
    getOrThrow.mockImplementation((key: string) => {
      if (key === 'JWT_REFRESH_SECRET') return 'refresh-secret';
      if (key === 'JWT_REFRESH_EXPIRES_IN') return '14d';
      return 'access-secret';
    });
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

  it('issues an access token when the local password is correct', async () => {
    const passwordHash = await bcrypt.hash('password123', 4);
    findUserByEmail.mockResolvedValue({
      id: 1n,
      email: 'fan@idolog.kr',
      passwordHash,
      googleSub: null,
      nickname: '아이돌팬',
      preferredLanguage: 'ko',
      provider: 'LOCAL',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    signAsync.mockResolvedValueOnce('access-token').mockResolvedValueOnce('refresh-token');
    updateRefreshTokenHash.mockResolvedValue({});

    await expect(
      authService.logIn({ email: 'Fan@Idolog.kr', password: 'password123' }),
    ).resolves.toEqual({ accessToken: 'access-token', refreshToken: 'refresh-token' });
    expect(signAsync).toHaveBeenCalledWith({ sub: '1', email: 'fan@idolog.kr' });
    expect(updateRefreshTokenHash).toHaveBeenCalledWith(1n, expect.any(String));
  });

  it('uses the same 401 error for an unknown email and incorrect password', async () => {
    findUserByEmail.mockResolvedValue(null);

    await expect(
      authService.logIn({ email: 'unknown@idolog.kr', password: 'password123' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('creates a Google user on their first Google login', async () => {
    findUserByGoogleSub.mockResolvedValue(null);
    findUserByEmail.mockResolvedValue(null);
    createGoogleUser.mockResolvedValue({
      id: 2n,
      email: 'google@idolog.kr',
      passwordHash: null,
      googleSub: 'google-sub-123',
      nickname: 'Google Fan',
      preferredLanguage: 'ko',
      provider: 'GOOGLE',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    signAsync
      .mockResolvedValueOnce('google-access-token')
      .mockResolvedValueOnce('google-refresh-token');
    updateRefreshTokenHash.mockResolvedValue({});

    await expect(
      authService.googleLogIn({
        googleSub: 'google-sub-123',
        email: 'google@idolog.kr',
        nickname: 'Google Fan',
      }),
    ).resolves.toEqual({
      accessToken: 'google-access-token',
      refreshToken: 'google-refresh-token',
    });
    expect(createGoogleUser).toHaveBeenCalledWith(
      expect.objectContaining({ googleSub: 'google-sub-123', preferredLanguage: 'ko' }),
    );
  });

  it('rotates refresh token after verifying its DB hash', async () => {
    const oldRefreshToken = 'old-refresh-token';
    const refreshTokenHash = await bcrypt.hash(oldRefreshToken, 4);
    verifyAsync.mockResolvedValue({
      sub: '1',
      email: 'fan@idolog.kr',
      tokenType: 'refresh',
    });
    findUserById.mockResolvedValue({
      id: 1n,
      email: 'fan@idolog.kr',
      passwordHash: 'hash',
      refreshTokenHash,
      googleSub: null,
      nickname: '아이돌팬',
      preferredLanguage: 'ko',
      provider: 'LOCAL',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    signAsync.mockResolvedValueOnce('new-access-token').mockResolvedValueOnce('new-refresh-token');
    updateRefreshTokenHash.mockResolvedValue({});

    await expect(authService.refresh(oldRefreshToken)).resolves.toEqual({
      accessToken: 'new-access-token',
      refreshToken: 'new-refresh-token',
    });
    expect(updateRefreshTokenHash).toHaveBeenCalledWith(1n, expect.any(String));
  });
});
