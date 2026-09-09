import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  Matches,
  Max,
  Min,
} from 'class-validator';

import {
  TRANSPORT_MODES,
  TRAVEL_STYLES,
  type TransportMode,
  type TravelStyle,
} from '../recommendation.types';

/**
 * 제약은 docs/FRONTEND_API_SPEC.md 의 코스 추천 표를 그대로 따릅니다.
 * 오류 문구는 사용자에게 보이지 않습니다 — 프론트가 자기 언어로 검증합니다.
 */
export class CreateRecommendationDto {
  @ApiProperty({ example: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  locationId!: number;

  @ApiProperty({ enum: TRANSPORT_MODES })
  @IsIn(TRANSPORT_MODES)
  transportMode!: TransportMode;

  @ApiProperty({ enum: TRAVEL_STYLES, isArray: true })
  @IsArray()
  @ArrayMinSize(1)
  @IsIn(TRAVEL_STYLES, { each: true })
  travelStyles!: TravelStyle[];

  @ApiPropertyOptional({ example: '09:00' })
  @IsOptional()
  @Matches(/^\d{2}:\d{2}$/)
  startTime?: string;

  @ApiPropertyOptional({ minimum: 2, maximum: 12 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2)
  @Max(12)
  availableHours?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  withPet?: boolean;

  @ApiPropertyOptional({ minimum: 1, maximum: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10)
  partySize?: number;
}
