import { Module } from '@nestjs/common';
import { FilmingLocationsController } from './filming-locations.controller';
import { FilmingLocationsService } from './filming-locations.service';

@Module({ controllers: [FilmingLocationsController], providers: [FilmingLocationsService] })
export class FilmingLocationsModule {}
