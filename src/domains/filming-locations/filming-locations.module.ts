import { Module } from '@nestjs/common';

import { FilmingLocationsController } from './filming-locations.controller';
import { FilmingLocationsService } from './filming-locations.service';

@Module({
  controllers: [FilmingLocationsController],
  providers: [FilmingLocationsService],
  // 아이돌별 촬영지 조회가 같은 매퍼를 씁니다.
  exports: [FilmingLocationsService],
})
export class FilmingLocationsModule {}
