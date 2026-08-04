import { Module } from '@nestjs/common';
import { MusicVideosController } from './music-videos.controller';
import { MusicVideosService } from './music-videos.service';

@Module({ controllers: [MusicVideosController], providers: [MusicVideosService] })
export class MusicVideosModule {}
