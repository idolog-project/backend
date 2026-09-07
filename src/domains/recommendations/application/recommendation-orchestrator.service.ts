import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { RecommendationCandidateProvider } from '../candidate/recommendation-candidate.provider';
import { CandidatePoolGuard } from '../candidate/candidate-pool.guard';
import { RecommendationAIClient } from '../ai/recommendation-ai-client.interface';
import { AIOutputValidator } from '../ai/ai-output.validator';
import { MapRouteService } from '../route/map-route.service';
import { RouteFeasibilityValidator } from '../route/route-feasibility.validator';
import { CourseAssembler } from '../assembler/course-assembler.service';
import { CreateRecommendationDto } from '../dto/create-recommendation.dto';
import { RecommendationFailedException } from '../exceptions/recommendation-failed.exception';
import { AIRecommendationDraft, PlanningError, PlanningInput, RULES } from '../types/planning.type';
import { MODEL_NAME } from '../ai/gemini-recommendation.client';
import { PROMPT_VERSION } from '../ai/recommendation-system-instruction';
import { SCHEMA_VERSION } from '../ai/recommendation-schema.factory';
@Injectable()
export class RecommendationOrchestrator {
  private readonly logger = new Logger(RecommendationOrchestrator.name);
  constructor(
    private readonly candidates: RecommendationCandidateProvider,
    private readonly ai: RecommendationAIClient,
    private readonly output: AIOutputValidator,
    private readonly guard: CandidatePoolGuard,
    private readonly maps: MapRouteService,
    private readonly feasibility: RouteFeasibilityValidator,
    private readonly assembler: CourseAssembler,
  ) {}
  async recommend(dto: CreateRecommendationDto) {
    const started = Date.now();
    const metrics = {
      requestId: randomUUID(),
      modelName: MODEL_NAME,
      selectedStartLocationId: String(dto.locationId),
      candidateCount: 0,
      geminiLatencyMs: 0,
      mapApiLatencyMs: 0,
      promptVersion: PROMPT_VERSION,
      schemaVersion: SCHEMA_VERSION,
      repairCount: 0,
      replanCount: 0,
      validationFailureReason: '',
    };
    try {
      const pool = await this.candidates.getPool(dto);
      metrics.candidateCount = pool.candidatePool.length;
      // Three pairwise-distinct sequences with at least two following stops need >=3 candidates.
      if (
        pool.candidatePool.length < 3 ||
        (dto.availableHours ?? 8) * 3600 < RULES.startStay + RULES.minStops * RULES.minStay
      ) {
        metrics.validationFailureReason = 'INSUFFICIENT_CANDIDATES';
        return { courses: [] };
      }
      this.maps.assertConfigured(dto.transportMode);
      const input: PlanningInput = {
        ...pool,
        userConditions: {
          ...dto,
          startTime: dto.startTime ?? '09:00',
          availableHours: dto.availableHours ?? 8,
          withPet: dto.withPet ?? false,
          partySize: dto.partySize ?? 1,
        },
      };
      const generate = async (): Promise<AIRecommendationDraft> => {
        for (;;) {
          let raw: string;
          const aiStart = Date.now();
          try {
            raw = await this.ai.generateCourseDraft(input);
          } finally {
            metrics.geminiLatencyMs += Date.now() - aiStart;
          }
          try {
            const draft = this.output.parse(raw);
            this.guard.validate(draft, input);
            return draft;
          } catch (error) {
            if (!(error instanceof PlanningError)) throw error;
            metrics.validationFailureReason = error.code;
            if (metrics.repairCount >= 1) throw error;
            metrics.repairCount++;
            input.feedback = {
              kind: 'REPAIR',
              violations: { code: error.code, priorFeedback: input.feedback },
            };
          }
        }
      };
      for (;;) {
        const draft = await generate();
        const mapStart = Date.now();
        let routed;
        try {
          routed = await this.maps.route(draft, input, this.guard.validate(draft, input));
        } finally {
          metrics.mapApiLatencyMs += Date.now() - mapStart;
        }
        const violations = this.feasibility.validate(routed, input);
        if (!violations.length) return this.assembler.assemble(routed, input);
        metrics.validationFailureReason = 'ROUTE_NOT_FEASIBLE';
        if (metrics.replanCount >= 1) throw new PlanningError('ROUTE_NOT_FEASIBLE');
        metrics.replanCount++;
        input.feedback = { kind: 'REPLAN', violations, previousDraft: draft };
      }
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      metrics.validationFailureReason =
        error instanceof PlanningError ? error.code : 'RECOMMENDATION_INTERNAL_ERROR';
      throw new RecommendationFailedException(metrics.validationFailureReason, metrics.requestId);
    } finally {
      this.logger.log({ ...metrics, totalRecommendationLatencyMs: Date.now() - started });
    }
  }
}
