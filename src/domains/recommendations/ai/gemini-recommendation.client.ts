import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';
import { PlanningError, PlanningInput } from '../types/planning.type';
import { RecommendationAIClient } from './recommendation-ai-client.interface';
import { PromptBuilder } from './prompt-builder.service';
import { SYSTEM_INSTRUCTION } from './recommendation-system-instruction';
import { recommendationSchema } from './recommendation-schema.factory';
import { networkRetry, retryable } from './network-retry';
import { geminiQuotaCode } from './gemini-quota-error';
export const MODEL_NAME = 'gemini-3.6-flash';
@Injectable()
export class GeminiRecommendationClient extends RecommendationAIClient {
  private readonly client: GoogleGenAI;
  private rateLimitedUntil = 0;
  private rateLimitCode: 'GEMINI_DAILY_LIMIT' | 'GEMINI_RATE_LIMIT' = 'GEMINI_RATE_LIMIT';
  constructor(
    config: ConfigService,
    private readonly prompt: PromptBuilder,
  ) {
    super();
    this.client = new GoogleGenAI({
      apiKey: config.getOrThrow<string>('GEMINI_API_KEY'),
      httpOptions: {
        timeout: config.get<number>('GEMINI_TIMEOUT_MS', 60000),
        retryOptions: { attempts: 1 },
      },
    });
  }
  async generateCourseDraft(input: PlanningInput): Promise<string> {
    if (Date.now() < this.rateLimitedUntil) throw new PlanningError(this.rateLimitCode);
    try {
      const response = await networkRetry(
        () => {
          if (Date.now() < this.rateLimitedUntil) throw new PlanningError(this.rateLimitCode);
          return this.client.models.generateContent({
            model: MODEL_NAME,
            contents: this.prompt.build(input),
            config: {
              systemInstruction: SYSTEM_INSTRUCTION,
              responseMimeType: 'application/json',
              responseJsonSchema: recommendationSchema(
                input.candidatePool.map((p) => p.candidateId),
              ),
              maxOutputTokens: 8192,
            },
          });
        },
        undefined,
        (error) =>
          !(error instanceof Error && Number(Reflect.get(error, 'status')) === 429) &&
          retryable(error),
      );
      return response.text ?? '';
    } catch (error) {
      if (error instanceof PlanningError) throw error;
      const status = error instanceof Error ? Number(Reflect.get(error, 'status')) : 0;
      // This process shares a short cooldown across requests; provider quotas may last longer.
      if (status === 429 && error instanceof Error) {
        this.rateLimitCode = geminiQuotaCode(error);
        this.rateLimitedUntil = Date.now() + 60000;
      }
      throw new PlanningError(
        status === 429
          ? this.rateLimitCode
          : status === 499
            ? 'GEMINI_CANCELLED'
            : error instanceof Error && /timeout|timed out|abort/i.test(error.message + error.name)
              ? 'GEMINI_TIMEOUT'
              : Number.isInteger(status) && status >= 400 && status <= 599
                ? `GEMINI_HTTP_${status}`
                : 'GEMINI_API_FAILED',
      );
    }
  }
}
