import { Module } from '@nestjs/common';
import { TourismController } from './tourism.controller';
import { TourismService } from './tourism.service';
import { TourApiClient } from './tour-api.client';
@Module({
  controllers: [TourismController],
  providers: [TourismService, TourApiClient],
  exports: [TourismService, TourApiClient],
})
export class TourismModule {}
