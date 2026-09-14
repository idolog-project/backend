import { Injectable } from '@nestjs/common';
import { PlanningInput, RoutedCourse, RULES, validCoordinates } from '../types/planning.type';
@Injectable()
export class RouteFeasibilityValidator {
  validate(courses: RoutedCourse[], input: PlanningInput) {
    const violations: Array<{
      courseType: string;
      violation: {
        type: string;
        fromCandidateId?: string;
        toCandidateId?: string;
        travelSeconds?: number;
      };
    }> = [];
    const [h, m] = (input.userConditions.startTime ?? '09:00').split(':').map(Number);
    for (const c of courses) {
      const add = (type: string) =>
        violations.push({ courseType: c.draft.courseType, violation: { type } });
      if (c.locations[0].candidateId !== input.fixedStartLocation.candidateId)
        add('FIXED_START_CHANGED');
      if (c.locations.length < RULES.minStops + 1 || c.locations.length > RULES.maxStops + 1)
        add('STOP_COUNT');
      if (new Set(c.locations.map((p) => p.candidateId)).size !== c.locations.length)
        add('DUPLICATE_STOP');
      if (c.locations.some((p) => !validCoordinates(p))) add('INVALID_COORDINATES');
      const total =
        c.stays.reduce((a, b) => a + b, 0) + c.legs.reduce((a, b) => a + b.durationSeconds, 0);
      if (total > (input.userConditions.availableHours ?? 8) * 3600)
        add('AVAILABLE_HOURS_EXCEEDED');
      if (h * 3600 + m * 60 + total >= 86400) add('DAY_BOUNDARY_EXCEEDED');
      c.legs.forEach((leg, i) => {
        if (leg.durationSeconds > RULES.maxLegSeconds)
          violations.push({
            courseType: c.draft.courseType,
            violation: {
              type: 'EXCESSIVE_TRAVEL_TIME',
              fromCandidateId: c.locations[i].candidateId,
              toCandidateId: c.locations[i + 1].candidateId,
              travelSeconds: leg.durationSeconds,
            },
          });
      });
      // businessHours/closedDays are free text and DTO has no date: availability is unknown.
    }
    return violations;
  }
}
