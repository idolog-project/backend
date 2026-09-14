import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import type { CourseDto } from './dto/save-course.dto';

/** 프론트가 받는 코스 형태입니다. frontend `courseSchema` 와 같습니다. */
export type CourseResponse = {
  id: string;
  title: string;
  summary: string;
  reason: string;
  places: {
    order: number;
    name: string;
    address: string;
    latitude: number;
    longitude: number;
    imageUrl: string | null;
    overview: string | null;
    homepageUrl: string | null;
    arrivalTime: string | null;
    category: string | null;
    distanceFromPrevMeters: number | null;
    durationFromPrevSeconds: number | null;
  }[];
  totalDistanceMeters: number;
  totalDurationSeconds: number;
  travelDurationSeconds: number | null;
  startTime: string | null;
  endTime: string | null;
};

/** places 까지 끌고 오는 조회에만 쓰는 타입입니다. */
const withPlaces = {
  places: { orderBy: { order: 'asc' } },
} satisfies Prisma.SavedCourseInclude;

type SavedCourseWithPlaces = Prisma.SavedCourseGetPayload<{ include: typeof withPlaces }>;

@Injectable()
export class CoursesService {
  constructor(private readonly prisma: PrismaService) {}

  /** 최신 저장순입니다. */
  async findMine(userId: number): Promise<CourseResponse[]> {
    const courses = await this.prisma.savedCourse.findMany({
      where: { userId: BigInt(userId) },
      include: withPlaces,
      orderBy: { createdAt: 'desc' },
    });
    return courses.map((course) => this.toResponse(course));
  }

  /**
   * 추천 결과 하나를 저장합니다.
   *
   * 같은 코스를 다시 저장해도 늘지 않는 멱등 동작입니다(계약: 새로 저장하면
   * 201, 기존 저장본이면 200). 장소는 통째로 지웠다 다시 넣습니다 — 순서가
   * 바뀌면 order 유일 제약과 부딪히고, 코스는 통으로 의미가 있는 값이라
   * 부분 갱신이 이득이 없습니다.
   */
  async save(
    userId: number,
    locationId: number,
    course: CourseDto,
  ): Promise<{ course: CourseResponse; created: boolean }> {
    const existing = await this.prisma.savedCourse.findUnique({
      where: { userId_courseKey: { userId: BigInt(userId), courseKey: course.id } },
      select: { id: true },
    });

    const scalars = {
      title: course.title,
      summary: course.summary,
      reason: course.reason,
      totalDistanceMeters: course.totalDistanceMeters,
      totalDurationSeconds: course.totalDurationSeconds,
      travelDurationSeconds: course.travelDurationSeconds ?? null,
      startTime: course.startTime ?? null,
      endTime: course.endTime ?? null,
      filmingLocationId: BigInt(locationId),
    };

    const places = course.places.map((place) => ({
      order: place.order,
      name: place.name,
      address: place.address,
      latitude: place.latitude,
      longitude: place.longitude,
      imageUrl: place.imageUrl ?? null,
      overview: place.overview ?? null,
      homepageUrl: place.homepageUrl ?? null,
      arrivalTime: place.arrivalTime ?? null,
      category: place.category ?? null,
      distanceFromPrevMeters: place.distanceFromPrevMeters ?? null,
      durationFromPrevSeconds: place.durationFromPrevSeconds ?? null,
    }));

    // 지우고 다시 넣는 사이에 다른 요청이 끼면 장소가 빈 코스가 보일 수 있어
    // 한 트랜잭션으로 묶습니다.
    const saved = await this.prisma.$transaction(async (tx) => {
      if (existing) {
        await tx.savedCoursePlace.deleteMany({ where: { savedCourseId: existing.id } });
        return tx.savedCourse.update({
          where: { id: existing.id },
          data: { ...scalars, places: { create: places } },
          include: withPlaces,
        });
      }
      return tx.savedCourse.create({
        data: {
          ...scalars,
          courseKey: course.id,
          userId: BigInt(userId),
          places: { create: places },
        },
        include: withPlaces,
      });
    });

    return { course: this.toResponse(saved), created: !existing };
  }

  /** 남의 코스는 존재를 알리지 않고 404 로 처리합니다. */
  async remove(userId: number, courseKey: string): Promise<void> {
    const deleted = await this.prisma.savedCourse.deleteMany({
      where: { userId: BigInt(userId), courseKey },
    });
    if (deleted.count === 0) {
      throw new NotFoundException('NOT_FOUND');
    }
  }

  private toResponse(course: SavedCourseWithPlaces): CourseResponse {
    return {
      // 프론트가 아는 id 는 에이전트가 붙인 courseKey 입니다. DB 의 BigInt id 는
      // 내부용이라 밖으로 내보내지 않습니다.
      id: course.courseKey,
      title: course.title,
      summary: course.summary,
      reason: course.reason,
      places: course.places.map((place) => ({
        order: place.order,
        name: place.name,
        address: place.address,
        latitude: place.latitude,
        longitude: place.longitude,
        imageUrl: place.imageUrl,
        overview: place.overview,
        homepageUrl: place.homepageUrl,
        arrivalTime: place.arrivalTime,
        category: place.category,
        distanceFromPrevMeters: place.distanceFromPrevMeters,
        durationFromPrevSeconds: place.durationFromPrevSeconds,
      })),
      totalDistanceMeters: course.totalDistanceMeters,
      totalDurationSeconds: course.totalDurationSeconds,
      travelDurationSeconds: course.travelDurationSeconds,
      startTime: course.startTime,
      endTime: course.endTime,
    };
  }
}
