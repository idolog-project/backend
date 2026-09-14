import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { validateEnvironment } from './config/env.validation';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './domains/auth/auth.module';
import { BookmarksModule } from './domains/bookmarks/bookmarks.module';
import { CoursesModule } from './domains/courses/courses.module';
import { FilmingLocationsModule } from './domains/filming-locations/filming-locations.module';
import { IdolsModule } from './domains/idols/idols.module';
import { MusicVideosModule } from './domains/music-videos/music-videos.module';
import { RecommendationsModule } from './domains/recommendations/recommendations.module';
import { RoutesModule } from './domains/routes/routes.module';
import { TourismModule } from './domains/tourism/tourism.module';
import { UsersModule } from './domains/users/users.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnvironment,
    }),
    PrismaModule,
    HealthModule,
    AuthModule,
    UsersModule,
    IdolsModule,
    MusicVideosModule,
    FilmingLocationsModule,
    TourismModule,
    RecommendationsModule,
    CoursesModule,
    RoutesModule,
    BookmarksModule,
  ],
})
export class AppModule {}
