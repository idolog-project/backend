import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { createSuccessResponse } from '../common/types/api-response.type';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  @Get()
  @ApiOperation({ summary: '서버 상태 확인' })
  @ApiOkResponse({ description: '서버가 정상적으로 동작 중입니다.' })
  getHealth() {
    return createSuccessResponse({ status: 'ok' }, 'COMMON200', '서버가 정상적으로 동작 중입니다.');
  }
}
