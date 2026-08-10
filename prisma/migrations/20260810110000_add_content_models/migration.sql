CREATE TYPE "LocationCategory" AS ENUM ('MV_SPOT', 'CAFE', 'PHOTO_SPOT');

CREATE TABLE "Idol" (
    "id" BIGSERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "agency" TEXT,
    "imageUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Idol_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MusicVideo" (
    "id" BIGSERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "releaseDate" TIMESTAMP(3),
    "youtubeUrl" TEXT,
    "sourceLinkType" TEXT,
    "idolId" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MusicVideo_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FilmingLocation" (
    "id" BIGSERIAL NOT NULL,
    "sourceId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "category" "LocationCategory" NOT NULL,
    "sourcePlaceType" TEXT NOT NULL,
    "description" TEXT,
    "businessHours" TEXT,
    "closedDays" TEXT,
    "address" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "phoneNumber" TEXT,
    "sourceUpdatedAt" TIMESTAMP(3),
    "imageUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FilmingLocation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MusicVideoFilmingLocation" (
    "musicVideoId" BIGINT NOT NULL,
    "filmingLocationId" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MusicVideoFilmingLocation_pkey" PRIMARY KEY ("musicVideoId", "filmingLocationId")
);

CREATE UNIQUE INDEX "Idol_name_key" ON "Idol"("name");
CREATE UNIQUE INDEX "MusicVideo_idolId_title_key" ON "MusicVideo"("idolId", "title");
CREATE UNIQUE INDEX "FilmingLocation_sourceId_key" ON "FilmingLocation"("sourceId");
CREATE INDEX "MusicVideoFilmingLocation_filmingLocationId_idx" ON "MusicVideoFilmingLocation"("filmingLocationId");

ALTER TABLE "MusicVideo" ADD CONSTRAINT "MusicVideo_idolId_fkey"
  FOREIGN KEY ("idolId") REFERENCES "Idol"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MusicVideoFilmingLocation" ADD CONSTRAINT "MusicVideoFilmingLocation_musicVideoId_fkey"
  FOREIGN KEY ("musicVideoId") REFERENCES "MusicVideo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MusicVideoFilmingLocation" ADD CONSTRAINT "MusicVideoFilmingLocation_filmingLocationId_fkey"
  FOREIGN KEY ("filmingLocationId") REFERENCES "FilmingLocation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
