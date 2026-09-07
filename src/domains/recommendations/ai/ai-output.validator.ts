import { Injectable } from '@nestjs/common';
import * as Joi from 'joi';
import { AIRecommendationDraft, PlanningError, RULES } from '../types/planning.type';
const text = Joi.string().trim().min(1).max(1000).required();
const schema = Joi.object({
  courses: Joi.array()
    .length(3)
    .items(
      Joi.object({
        courseType: Joi.string().valid('A', 'B', 'C').required(),
        title: text,
        summary: text,
        reason: text,
        stops: Joi.array()
          .min(RULES.minStops)
          .max(RULES.maxStops)
          .items(
            Joi.object({
              candidateId: text,
              order: Joi.number().integer().min(2).required(),
              recommendedStaySeconds: Joi.number()
                .integer()
                .min(RULES.minStay)
                .max(RULES.maxStay)
                .required(),
              selectionReason: text,
            }).unknown(false),
          )
          .required(),
      }).unknown(false),
    )
    .required(),
}).unknown(false);
@Injectable()
export class AIOutputValidator {
  parse(raw: string): AIRecommendationDraft {
    let data: unknown;
    try {
      data = JSON.parse(raw);
    } catch {
      throw new PlanningError('AI_INVALID_JSON');
    }
    const result = schema.validate(data, { convert: false });
    if (result.error) throw new PlanningError('AI_SCHEMA_VIOLATION');
    const draft = result.value as AIRecommendationDraft;
    if (new Set(draft.courses.map((c) => c.courseType)).size !== 3)
      throw new PlanningError('AI_COURSE_TYPES');
    for (const c of draft.courses)
      if (c.stops.some((s, i) => s.order !== i + 2)) throw new PlanningError('AI_STOP_ORDER');
    if (new Set(draft.courses.map((c) => c.stops.map((s) => s.candidateId).join(','))).size !== 3)
      throw new PlanningError('AI_IDENTICAL_COURSES');
    return draft;
  }
}
