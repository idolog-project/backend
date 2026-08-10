import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';

import { AuthController } from './auth.controller';
import { AuthRepository } from './auth.repository';
import { AuthService } from './auth.service';

@Module({
  imports: [
    /**
     * JWT secret은 소스 코드가 아니라 환경변수에서만 읽습니다.
     * registerAsync를 쓰면 ConfigModule이 .env를 읽은 뒤에 JWT 설정이 만들어집니다.
     */
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
        signOptions: {
          // env.validation.ts가 허용하는 값(예: 1h)을 JWT 라이브러리가 해석합니다.
          expiresIn: configService.getOrThrow<string>('JWT_ACCESS_EXPIRES_IN') as `${number}h`,
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, AuthRepository],
})
export class AuthModule {}
