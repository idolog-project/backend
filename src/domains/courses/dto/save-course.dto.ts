import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Min,
  ValidateNested,
} from 'class-validator';

/** frontend `coursePlaceSchema` 와 같은 모양입니다. */
export class CoursePlaceDto {
  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  order!: number;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty()
  @IsString()
  address!: string;

  @ApiProperty()
  @Type(() => Number)
  @IsLatitude()
  latitude!: number;

  @ApiProperty()
  @Type(() => Number)
  @IsLongitude()
  longitude!: number;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  imageUrl?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  overview?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  homepageUrl?: string | null;

  @ApiPropertyOptional({ nullable: true, example: '10:30' })
  @IsOptional()
  @Matches(/^\d{2}:\d{2}$/)
  arrivalTime?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  category?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  distanceFromPrevMeters?: number | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  durationFromPrevSeconds?: number | null;
}

/** frontend `courseSchema` 와 같은 모양입니다. */
export class CourseDto {
  @ApiProperty({ description: '에이전트가 붙인 코스 식별자' })
  @IsString()
  @IsNotEmpty()
  id!: string;

  @ApiProperty()
  @IsString()
  title!: string;

  @ApiProperty()
  @IsString()
  summary!: string;

  @ApiProperty()
  @IsString()
  reason!: string;

  @ApiProperty({ type: [CoursePlaceDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CoursePlaceDto)
  places!: CoursePlaceDto[];

  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  totalDistanceMeters!: number;

  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  totalDurationSeconds!: number;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  travelDurationSeconds?: number | null;

  @ApiPropertyOptional({ nullable: true, example: '09:00' })
  @IsOptional()
  @Matches(/^\d{2}:\d{2}$/)
  startTime?: string | null;

  @ApiPropertyOptional({ nullable: true, example: '18:30' })
  @IsOptional()
  @Matches(/^\d{2}:\d{2}$/)
  endTime?: string | null;
}

export class SaveCourseDto {
  @ApiProperty({ description: '코스의 출발점이 된 촬영지' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  locationId!: number;

  @ApiProperty({ type: CourseDto })
  @ValidateNested()
  @Type(() => CourseDto)
  course!: CourseDto;
}
