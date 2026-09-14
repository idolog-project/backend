import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import {
  filmingLocationInclude,
  toFilmingLocationResponse,
  type FilmingLocationResponse,
} from '../filming-locations/filming-location.mapper';

export type IdolResponse = {
  id: number;
  name: string;
  agency: string | null;
  imageUrl: string | null;
  locationCount: number;
};

@Injectable()
export class IdolsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 아이돌 목록입니다. `locationCount` 는 그 아이돌의 뮤비에 쓰인 **서로 다른**
   * 촬영지 수입니다.
   *
   * 뮤비마다 세면 한 장소가 여러 뮤비에 나올 때 중복으로 잡혀, 지도에 찍히는
   * 핀 수와 목록의 숫자가 어긋납니다. 그래서 링크를 모아 촬영지 id 로 중복을
   * 걷어낸 뒤 셉니다.
   */
  async findAll(query?: string): Promise<IdolResponse[]> {
    const trimmed = query?.trim();
    const idols = await this.prisma.idol.findMany({
      where: trimmed ? { name: { contains: trimmed, mode: 'insensitive' } } : undefined,
      include: {
        musicVideos: { select: { locations: { select: { filmingLocationId: true } } } },
      },
      orderBy: { name: 'asc' },
    });

    return idols.map((idol) => {
      const locationIds = new Set(
        idol.musicVideos.flatMap((mv) =>
          mv.locations.map((link) => link.filmingLocationId.toString()),
        ),
      );
      return {
        id: Number(idol.id),
        name: idol.name,
        agency: idol.agency,
        imageUrl: idol.imageUrl,
        locationCount: locationIds.size,
      };
    });
  }

  /** 해당 아이돌의 뮤비와 연결된 촬영지입니다. 없는 아이돌은 404 입니다. */
  async findLocations(idolId: number): Promise<FilmingLocationResponse[]> {
    const idol = await this.prisma.idol.findUnique({
      where: { id: BigInt(idolId) },
      select: { id: true },
    });
    if (!idol) throw new NotFoundException('NOT_FOUND');

    const rows = await this.prisma.filmingLocation.findMany({
      where: { musicVideos: { some: { musicVideo: { idolId: BigInt(idolId) } } } },
      include: filmingLocationInclude,
      orderBy: { id: 'asc' },
    });
    return rows.map(toFilmingLocationResponse);
  }
}
