import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PlanningInput, RoutedCourse } from '../types/planning.type';
import { RecommendationResult } from '../types/recommendation.type';
const clock = (seconds: number) =>
  `${String(Math.floor(seconds / 3600)).padStart(2, '0')}:${String(Math.floor((seconds % 3600) / 60)).padStart(2, '0')}`;
@Injectable()
export class CourseAssembler {
  assemble(courses: RoutedCourse[], input: PlanningInput): RecommendationResult {
    const [h, m] = (input.userConditions.startTime ?? '09:00').split(':').map(Number);
    return {
      courses: courses.map((c) => {
        let elapsed = 0;
        const places = c.locations.map((p, i) => {
          const leg = i === 0 ? null : c.legs[i - 1];
          elapsed += leg?.durationSeconds ?? 0;
          const arrivalTime = clock(h * 3600 + m * 60 + elapsed);
          elapsed += c.stays[i];
          return {
            order: i + 1,
            locationId: p.locationId,
            tourContentId: p.tourContentId,
            candidateId: p.candidateId,
            name: p.name,
            address: p.address,
            latitude: p.latitude,
            longitude: p.longitude,
            imageUrl: p.imageUrl,
            overview: p.description,
            homepageUrl: p.homepageUrl,
            category: p.category,
            musicVideos: p.musicVideos,
            businessHours: p.businessHours,
            closedDays: p.closedDays,
            availability: 'unknown' as const,
            arrivalTime,
            departureTime: clock(h * 3600 + m * 60 + elapsed),
            recommendedStaySeconds: c.stays[i],
            selectionReason:
              i === 0
                ? '사용자가 선택한 뮤직비디오 촬영지입니다.'
                : c.draft.stops[i - 1].selectionReason,
            distanceFromPrevMeters: leg?.distanceMeters ?? null,
            durationFromPrevSeconds: leg?.durationSeconds ?? null,
          };
        });
        return {
          id: randomUUID(),
          courseType: c.draft.courseType,
          title: c.draft.title,
          summary: c.draft.summary,
          reason: c.draft.reason,
          places,
          totalDistanceMeters: c.legs.reduce((a, b) => a + b.distanceMeters, 0),
          totalDurationSeconds: elapsed,
          travelDurationSeconds: c.legs.reduce((a, b) => a + b.durationSeconds, 0),
          startTime: input.userConditions.startTime ?? '09:00',
          endTime: clock(h * 3600 + m * 60 + elapsed),
        };
      }),
    };
  }
}
