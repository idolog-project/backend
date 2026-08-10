import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import session from 'express-session';

import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { ApiResponseInterceptor } from './common/interceptors/api-response.interceptor';
import { setupSwagger } from './config/swagger.config';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  // Railway는 HTTPS를 프록시에서 종료하므로 secure session cookie를 위해 프록시를 신뢰합니다.
  app.getHttpAdapter().getInstance().set('trust proxy', 1);
  /**
   * refresh token은 HttpOnly 쿠키로 전달합니다.
   * credentials를 켜야 브라우저가 프론트↔백엔드 요청에서 이 쿠키를 주고받을 수 있습니다.
   */
  const allowedOrigins = (process.env.FRONTEND_URL ?? 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  app.enableCors({ origin: allowedOrigins, credentials: true });
  app.use(cookieParser());
  /**
   * Google OAuth 왕복 중 state와 허용된 프론트 redirect 경로만 잠시 저장합니다.
   * 로그인 사용자 세션이나 refresh token을 이 메모리 세션에 저장하지는 않습니다.
   */
  app.use(
    session({
      name: 'idolog-oauth',
      secret: process.env.OAUTH_SESSION_SECRET ?? '',
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        secure: process.env.COOKIE_SECURE === 'true',
        sameSite: 'lax',
        path: '/api/v1/auth',
        maxAge: 10 * 60 * 1000,
      },
    }),
  );
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new ApiResponseInterceptor());
  setupSwagger(app);

  app.enableShutdownHooks();
  await app.listen(process.env.PORT ?? 3000);
}

void bootstrap();
