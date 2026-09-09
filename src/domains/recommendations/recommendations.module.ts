import { Module } from '@nestjs/common';

import { TourismModule } from '../tourism/tourism.module';
import { FixedCourseAgent } from './fixed-course.agent';
import { COURSE_AGENT } from './recommendation.types';
import { RecommendationsController } from './recommendations.controller';
import { RecommendationsService } from './recommendations.service';

@Module({
  imports: [TourismModule],
  controllers: [RecommendationsController],
  // 실제 AI 에이전트가 준비되면 이 한 줄의 구현만 갈아끼우면 됩니다.
  providers: [RecommendationsService, { provide: COURSE_AGENT, useClass: FixedCourseAgent }],
})
export class RecommendationsModule {}
