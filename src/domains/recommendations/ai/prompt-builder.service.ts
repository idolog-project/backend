import { Injectable } from '@nestjs/common';
import { PlanningInput, RULES } from '../types/planning.type';
@Injectable()
export class PromptBuilder {
  build(input: PlanningInput): string {
    const [hours, minutes] = (input.userConditions.startTime ?? '09:00').split(':').map(Number);
    return JSON.stringify({
      ...input,
      planningConstraints: {
        fixedStartStaySeconds: RULES.startStay,
        minFollowingStops: RULES.minStops,
        maxFollowingStops: RULES.maxStops,
        minStaySeconds: RULES.minStay,
        maxStaySeconds: RULES.maxStay,
        maxTotalDurationSeconds: Math.min(
          (input.userConditions.availableHours ?? 8) * 3600,
          86400 - hours * 3600 - minutes * 60 - 1,
        ),
        maxLegSeconds: RULES.maxLegSeconds,
      },
    });
  }
}
