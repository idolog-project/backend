import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  Matches,
  Max,
  Min,
} from 'class-validator';

export enum TransportMode {
  WALK = 'WALK',
  TAXI = 'TAXI',
  BUS = 'BUS',
  CAR = 'CAR',
}

export enum TravelStyle {
  NATURE = 'NATURE',
  CULTURE = 'CULTURE',
  ACTIVITY = 'ACTIVITY',
  FOOD = 'FOOD',
  SHOPPING = 'SHOPPING',
  PHOTO = 'PHOTO',
}

export class CreateRecommendationDto {
  @ApiProperty({ minimum: 1, example: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  locationId!: number;

  @ApiProperty({ enum: TransportMode, example: TransportMode.TAXI })
  @IsEnum(TransportMode)
  transportMode!: TransportMode;

  @ApiProperty({
    enum: TravelStyle,
    isArray: true,
    example: [TravelStyle.PHOTO, TravelStyle.FOOD],
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsEnum(TravelStyle, { each: true })
  travelStyles!: TravelStyle[];

  @ApiPropertyOptional({ pattern: '^([01]\\d|2[0-3]):[0-5]\\d$', example: '09:00' })
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  startTime?: string;

  @ApiPropertyOptional({ minimum: 2, maximum: 12, default: 8 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2)
  @Max(12)
  availableHours?: number;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  withPet?: boolean;

  @ApiPropertyOptional({ minimum: 1, maximum: 10, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10)
  partySize?: number;
}
