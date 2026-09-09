import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';

import { CoursesController } from './courses.controller';
import { CoursesService } from './courses.service';

@Module({
  // AccessTokenGuard 가 JwtService 를 주입받습니다.
  imports: [JwtModule.register({})],
  controllers: [CoursesController],
  providers: [CoursesService],
})
export class CoursesModule {}
