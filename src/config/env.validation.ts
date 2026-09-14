import * as Joi from 'joi';

export function validateEnvironment(config: Record<string, unknown>): Record<string, unknown> {
  const schema = Joi.object({
    PORT: Joi.number().port().default(3000),
    DATABASE_URL: Joi.string()
      .uri({ scheme: ['postgres', 'postgresql'] })
      .required(),
    JWT_ACCESS_SECRET: Joi.string().min(32).required(),
    JWT_REFRESH_SECRET: Joi.string().min(32).required(),
    JWT_ACCESS_EXPIRES_IN: Joi.string()
      .pattern(/^\d+[smhd]$/)
      .default('1h'),
    JWT_REFRESH_EXPIRES_IN: Joi.string()
      .pattern(/^\d+[smhd]$/)
      .default('14d'),
    FRONTEND_URL: Joi.string().default('http://localhost:5173'),
    COOKIE_SECURE: Joi.boolean().default(false),
    GOOGLE_CLIENT_ID: Joi.string().required(),
    GOOGLE_CLIENT_SECRET: Joi.string().required(),
    GOOGLE_CALLBACK_URL: Joi.string().uri().required(),
    OAUTH_SESSION_SECRET: Joi.string().min(32).required(),
    GEMINI_API_KEY: Joi.string().required(),
    GEMINI_TIMEOUT_MS: Joi.number().integer().min(1000).max(120000).default(60000),
    RECOMMENDATION_STANDALONE_ENABLED: Joi.boolean().default(false),
    TOUR_API_SERVICE_KEY: Joi.string().required(),
    KAKAO_MOBILITY_API_KEY: Joi.string().trim().empty('').optional(),
    GOOGLE_MAPS_API_KEY: Joi.string().required(),
  }).unknown(true);

  const { error, value } = schema.validate(config, { abortEarly: false });
  if (error) {
    throw new Error(`환경변수 검증에 실패했습니다: ${error.message}`);
  }
  return value as Record<string, unknown>;
}
