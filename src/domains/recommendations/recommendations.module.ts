import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { TourismModule } from '../tourism/tourism.module';
import { RecommendationsController } from './recommendations.controller';
import { RecommendationsService } from './recommendations.service';
import { RecommendationOrchestrator } from './application/recommendation-orchestrator.service';
import { RecommendationCandidateProvider } from './candidate/recommendation-candidate.provider';
import { CandidatePoolGuard } from './candidate/candidate-pool.guard';
import { RecommendationAIClient } from './ai/recommendation-ai-client.interface';
import { GeminiRecommendationClient } from './ai/gemini-recommendation.client';
import { PromptBuilder } from './ai/prompt-builder.service';
import { AIOutputValidator } from './ai/ai-output.validator';
import { KakaoMobilityRouteAdapter } from './route/kakao-mobility-route.adapter';
import { MapRouteService } from './route/map-route.service';
import { GoogleMapsRouteAdapter } from './route/google-maps-route.adapter';
import { RouteFeasibilityValidator } from './route/route-feasibility.validator';
import { CourseAssembler } from './assembler/course-assembler.service';

@Module({
  imports: [AuthModule, PrismaModule, TourismModule],
  controllers: [RecommendationsController],
  providers: [
    RecommendationsService,
    RecommendationOrchestrator,
    RecommendationCandidateProvider,
    CandidatePoolGuard,
    PromptBuilder,
    AIOutputValidator,
    MapRouteService,
    GoogleMapsRouteAdapter,
    KakaoMobilityRouteAdapter,
    RouteFeasibilityValidator,
    CourseAssembler,
    { provide: RecommendationAIClient, useClass: GeminiRecommendationClient },
  ],
})
export class RecommendationsModule {}
