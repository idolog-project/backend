import * as Joi from 'joi';

export function validateEnvironment(config: Record<string, unknown>): Record<string, unknown> {
  const recommendationStandaloneEnabled =
    config.RECOMMENDATION_STANDALONE_ENABLED === true ||
    config.RECOMMENDATION_STANDALONE_ENABLED === 'true';
  const standaloneDefaults = {
    DATABASE_URL: 'postgresql://standalone:standalone@localhost:5432/idolog_standalone',
    JWT_ACCESS_SECRET: 'standalone-access-secret-at-least-32-characters',
    JWT_REFRESH_SECRET: 'standalone-refresh-secret-at-least-32-characters',
    GOOGLE_CLIENT_ID: 'standalone-google-client-id',
    GOOGLE_CLIENT_SECRET: 'standalone-google-client-secret',
    GOOGLE_CALLBACK_URL: 'http://localhost:3000/api/v1/auth/callback/google',
    OAUTH_SESSION_SECRET: 'standalone-session-secret-at-least-32-characters',
    TOUR_API_SERVICE_KEY: 'standalone-tour-api-key',
    GOOGLE_MAPS_API_KEY: 'standalone-google-maps-key',
  };
  const configToValidate = recommendationStandaloneEnabled
    ? { ...config, ...standaloneDefaults }
    : config;
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
    OPENAI_API_KEY: Joi.string().required(),
    RECOMMENDATION_STANDALONE_ENABLED: Joi.boolean().default(false),
    TOUR_API_SERVICE_KEY: Joi.string().required(),
    GOOGLE_MAPS_API_KEY: Joi.string().required(),
  }).unknown(true);

  const { error, value } = schema.validate(configToValidate, { abortEarly: false });
  if (error) {
    throw new Error(`환경변수 검증에 실패했습니다: ${error.message}`);
  }
  return value as Record<string, unknown>;
}
