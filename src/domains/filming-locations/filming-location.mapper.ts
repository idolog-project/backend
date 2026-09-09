import { Prisma } from '@prisma/client';

/** 촬영지를 뮤비·아이돌까지 끌고 오는 조회 옵션입니다. */
export const filmingLocationInclude = {
  musicVideos: { include: { musicVideo: true } },
} satisfies Prisma.FilmingLocationInclude;

type LocationRow = Prisma.FilmingLocationGetPayload<{
  include: typeof filmingLocationInclude;
}>;

/** 프론트가 받는 촬영지 형태입니다. frontend `filmingLocationSchema` 와 같습니다. */
export type FilmingLocationResponse = {
  id: number;
  name: string;
  category: string;
  address: string;
  latitude: number;
  longitude: number;
  imageUrl: string | null;
  description: string | null;
  musicVideos: {
    id: number;
    title: string;
    idolId: number;
    releaseDate: string | null;
    youtubeUrl: string | null;
  }[];
};

/**
 * DB 행을 응답 형태로 옮깁니다.
 *
 * BigInt 는 JSON 으로 직렬화되지 않고, 계약도 number ID 이므로 여기서 좁힙니다.
 * 날짜는 "YYYY-MM-DD" 로 잘라 보냅니다 — 발매일에는 시각이 의미가 없고,
 * ISO 문자열을 그대로 주면 프론트가 다시 자르는 일을 하게 됩니다.
 */
export function toFilmingLocationResponse(row: LocationRow): FilmingLocationResponse {
  return {
    id: Number(row.id),
    name: row.name,
    category: row.category,
    address: row.address,
    latitude: row.latitude,
    longitude: row.longitude,
    imageUrl: row.imageUrl,
    description: row.description,
    musicVideos: row.musicVideos.map(({ musicVideo }) => ({
      id: Number(musicVideo.id),
      title: musicVideo.title,
      idolId: Number(musicVideo.idolId),
      releaseDate: musicVideo.releaseDate?.toISOString().slice(0, 10) ?? null,
      youtubeUrl: musicVideo.youtubeUrl,
    })),
  };
}
