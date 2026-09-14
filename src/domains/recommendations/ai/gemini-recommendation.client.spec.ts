import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';
import { GeminiRecommendationClient } from './gemini-recommendation.client';
import { PlanningInput } from '../types/planning.type';

jest.mock('@google/genai', () => ({ GoogleGenAI: jest.fn() }));

describe('Gemini rate limit policy', () => {
  const generateContent = jest.fn();
  const input = { candidatePool: [] } as unknown as PlanningInput;
  let client: GeminiRecommendationClient;
  beforeEach(() => {
    jest.useFakeTimers();
    generateContent.mockReset();
    jest
      .mocked(GoogleGenAI)
      .mockImplementation(() => ({ models: { generateContent } }) as unknown as GoogleGenAI);
    client = new GeminiRecommendationClient(
      { getOrThrow: () => 'test-key', get: () => 60000 } as unknown as ConfigService,
      { build: () => '{}' },
    );
  });
  afterEach(() => jest.useRealTimers());

  it('makes only one attempt on 429 and blocks further requests during cooldown', async () => {
    generateContent.mockRejectedValue(Object.assign(new Error('quota'), { status: 429 }));
    await expect(client.generateCourseDraft(input)).rejects.toMatchObject({
      code: 'GEMINI_RATE_LIMIT',
    });
    await expect(client.generateCourseDraft(input)).rejects.toMatchObject({
      code: 'GEMINI_RATE_LIMIT',
    });
    expect(generateContent).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
    jest.advanceTimersByTime(60000);
    generateContent.mockResolvedValue({ text: '{}' });
    await expect(client.generateCourseDraft(input)).resolves.toBe('{}');
    expect(generateContent).toHaveBeenCalledTimes(2);
  });

  it('retains bounded retries for temporary server failures', async () => {
    generateContent
      .mockRejectedValueOnce(Object.assign(new Error('temporary'), { status: 503 }))
      .mockResolvedValue({ text: '{}' });
    const result = client.generateCourseDraft(input);
    await jest.runAllTimersAsync();
    await expect(result).resolves.toBe('{}');
    expect(generateContent).toHaveBeenCalledTimes(2);
  });
  it.each([
    ['GenerateRequestsPerDayPerProjectPerModel-FreeTier', 'GEMINI_DAILY_LIMIT'],
    ['generate_content_free_tier_requests_per_day', 'GEMINI_DAILY_LIMIT'],
    ['GenerateRequestsPerMinutePerProjectPerModel-FreeTier', 'GEMINI_RATE_LIMIT'],
  ])('classifies structured quota %s and preserves it during cooldown', async (quotaId, code) => {
    const message = JSON.stringify({
      error: {
        details: [
          {
            '@type': 'type.googleapis.com/google.rpc.QuotaFailure',
            violations: [{ quotaId }],
          },
        ],
      },
    });
    generateContent.mockRejectedValue(Object.assign(new Error(message), { status: 429 }));
    await expect(client.generateCourseDraft(input)).rejects.toMatchObject({ code });
    await expect(client.generateCourseDraft(input)).rejects.toMatchObject({ code });
    expect(generateContent).toHaveBeenCalledTimes(1);
  });

  it.each([
    'daily limit exceeded',
    '{invalid',
    JSON.stringify({ error: { message: 'daily limit exceeded' } }),
    JSON.stringify({
      error: { details: [{ '@type': 'unknown', violations: [{ quotaId: 'PerDay' }] }] },
    }),
    JSON.stringify({ error: { details: null } }),
  ])('does not infer daily quota from unverified data: %s', async (message) => {
    generateContent.mockRejectedValue(Object.assign(new Error(message), { status: 429 }));
    await expect(client.generateCourseDraft(input)).rejects.toMatchObject({
      code: 'GEMINI_RATE_LIMIT',
    });
    expect(generateContent).toHaveBeenCalledTimes(1);
  });
});
