import { Injectable } from '@nestjs/common';
import { RecommendationOrchestrator } from './application/recommendation-orchestrator.service';
import { CreateRecommendationDto } from './dto/create-recommendation.dto';
import { RecommendationResult } from './types/recommendation.type';
@Injectable()
export class RecommendationsService {
  constructor(private readonly orchestrator: RecommendationOrchestrator) {}
  createRecommendation(dto: CreateRecommendationDto): Promise<RecommendationResult> {
    return this.orchestrator.recommend(dto);
  }
}
