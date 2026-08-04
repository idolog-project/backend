import { Module } from '@nestjs/common';
import { IdolsController } from './idols.controller';
import { IdolsService } from './idols.service';

@Module({ controllers: [IdolsController], providers: [IdolsService] })
export class IdolsModule {}
