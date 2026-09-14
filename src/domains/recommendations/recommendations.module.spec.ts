import { ConfigModule, ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { RecommendationAIClient } from './ai/recommendation-ai-client.interface';
import { RecommendationsController } from './recommendations.controller';
import { RecommendationsModule } from './recommendations.module';

describe('RecommendationsModule dependency wiring', () => {
  it('initializes the real controller guard with JWT exported from AuthModule', async () => {
    const settings: Record<string, string> = {
      JWT_ACCESS_SECRET: 'test-only-access-secret-at-least-32-characters',
      JWT_ACCESS_EXPIRES_IN: '1h',
      GOOGLE_CLIENT_ID: 'test-client',
      GOOGLE_CLIENT_SECRET: 'test-secret',
      GOOGLE_CALLBACK_URL: 'http://localhost:3000/auth/callback/google',
    };
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        RecommendationsModule,
      ],
    })
      .overrideProvider(ConfigService)
      .useValue({ getOrThrow: (key: string) => settings[key] })
      .overrideProvider(PrismaService)
      .useValue({})
      .overrideProvider(RecommendationAIClient)
      .useValue({ generateCourseDraft: jest.fn() })
      .compile();

    try {
      await module.init();
      expect(module.get(RecommendationsController)).toBeInstanceOf(RecommendationsController);
    } finally {
      await module.close();
    }
  });
});
