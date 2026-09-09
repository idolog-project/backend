import { Module } from '@nestjs/common';

import { TourApiClient } from './tour-api.client';
import { TourismController } from './tourism.controller';
import { TourismService } from './tourism.service';

@Module({
  controllers: [TourismController],
  providers: [TourismService, TourApiClient],
  // 코스 추천이 관광지 조회를 필요로 하므로 밖으로 냅니다.
  exports: [TourApiClient],
})
export class TourismModule {}
