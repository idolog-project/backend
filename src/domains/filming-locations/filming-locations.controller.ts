import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { ListLocationsDto } from './dto/list-locations.dto';
import { FilmingLocationsService } from './filming-locations.service';

/** 경로는 계약(docs/FRONTEND_API_SPEC.md)을 따라 `/locations` 입니다. */
@ApiTags('locations')
@Controller('locations')
export class FilmingLocationsController {
  constructor(private readonly filmingLocationsService: FilmingLocationsService) {}

  @Get()
  @ApiOperation({ summary: '지도에 표시할 촬영지를 조회합니다.' })
  async findAll(@Query() query: ListLocationsDto) {
    const locations = await this.filmingLocationsService.findAll(query);
    return { locations };
  }

  @Get(':locationId')
  @ApiOperation({ summary: '촬영지 상세를 조회합니다.' })
  async findOne(@Param('locationId', ParseIntPipe) locationId: number) {
    return this.filmingLocationsService.findOne(locationId);
  }
}
