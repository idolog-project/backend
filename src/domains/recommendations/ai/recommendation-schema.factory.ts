import { RULES } from '../types/planning.type';
export const SCHEMA_VERSION = 'draft-v1';
export function recommendationSchema(ids: string[]) {
  const text = { type: 'string', minLength: 1, maxLength: 1000 };
  return {
    type: 'object',
    additionalProperties: false,
    required: ['courses'],
    properties: {
      courses: {
        type: 'array',
        minItems: 3,
        maxItems: 3,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['courseType', 'title', 'summary', 'reason', 'stops'],
          properties: {
            courseType: { type: 'string', enum: ['A', 'B', 'C'] },
            title: text,
            summary: text,
            reason: text,
            stops: {
              type: 'array',
              minItems: RULES.minStops,
              maxItems: RULES.maxStops,
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['candidateId', 'order', 'recommendedStaySeconds', 'selectionReason'],
                properties: {
                  candidateId: { type: 'string', enum: ids },
                  order: { type: 'integer', minimum: 2, maximum: RULES.maxStops + 1 },
                  recommendedStaySeconds: {
                    type: 'integer',
                    minimum: RULES.minStay,
                    maximum: RULES.maxStay,
                  },
                  selectionReason: text,
                },
              },
            },
          },
        },
      },
    },
  };
}
