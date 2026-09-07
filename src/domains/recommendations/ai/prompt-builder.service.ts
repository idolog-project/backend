import { Injectable } from '@nestjs/common';
import { PlanningInput } from '../types/planning.type';
@Injectable()
export class PromptBuilder {
  build(input: PlanningInput): string {
    return JSON.stringify(input);
  }
}
