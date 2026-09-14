import { ApiPropertyOptional } from '@nestjs/swagger';
import { LocationCategory } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Min } from 'class-validator';

export class ListLocationsDto {
  @ApiPropertyOptional({ enum: LocationCategory })
  @IsOptional()
  @IsEnum(LocationCategory)
  category?: LocationCategory;

  /** 지정하면 그 아이돌의 뮤비에 쓰인 촬영지만 남깁니다. */
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  idolId?: number;
}
