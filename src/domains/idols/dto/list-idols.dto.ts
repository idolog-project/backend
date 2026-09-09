import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ListIdolsDto {
  /** 이름 검색어입니다. 비어 있으면 전체를 돌려줍니다. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  query?: string;
}
