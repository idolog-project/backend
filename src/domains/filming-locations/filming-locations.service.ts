import { Injectable, NotFoundException } from '@nestjs/common';
import type { LocationCategory, Prisma } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import {
  filmingLocationInclude,
  toFilmingLocationResponse,
  type FilmingLocationResponse,
} from './filming-location.mapper';

@Injectable()
export class FilmingLocationsService {
  constructor(private readonly prisma: PrismaService) {}

  /** 지도에 찍을 촬영지입니다. 필터는 둘 다 선택값입니다. */
  async findAll(filters: {
    category?: LocationCategory;
    idolId?: number;
  }): Promise<FilmingLocationResponse[]> {
    const where: Prisma.FilmingLocationWhereInput = {
      ...(filters.category ? { category: filters.category } : {}),
      ...(filters.idolId
        ? {
            musicVideos: {
              some: { musicVideo: { idolId: BigInt(filters.idolId) } },
            },
          }
        : {}),
    };

    const rows = await this.prisma.filmingLocation.findMany({
      where,
      include: filmingLocationInclude,
      orderBy: { id: 'asc' },
    });
    return rows.map(toFilmingLocationResponse);
  }

  async findOne(locationId: number): Promise<FilmingLocationResponse> {
    const row = await this.prisma.filmingLocation.findUnique({
      where: { id: BigInt(locationId) },
      include: filmingLocationInclude,
    });
    if (!row) throw new NotFoundException('NOT_FOUND');
    return toFilmingLocationResponse(row);
  }
}
