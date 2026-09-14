import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { ListIdolsDto } from './dto/list-idols.dto';
import { IdolsService } from './idols.service';

@ApiTags('idols')
@Controller('idols')
export class IdolsController {
  constructor(private readonly idolsService: IdolsService) {}

  @Get()
  @ApiOperation({ summary: '아이돌 목록을 조회합니다. query 로 이름 검색이 됩니다.' })
  async findAll(@Query() dto: ListIdolsDto) {
    const idols = await this.idolsService.findAll(dto.query);
    return { idols };
  }

  @Get(':idolId/locations')
  @ApiOperation({ summary: '해당 아이돌의 뮤비에 쓰인 촬영지를 조회합니다.' })
  async findLocations(@Param('idolId', ParseIntPipe) idolId: number) {
    const locations = await this.idolsService.findLocations(idolId);
    return { locations };
  }
}
