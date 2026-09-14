import type { TourLanguage } from '../tourism/tour-api.client';
import {
  Body,
  Headers,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import { CreateRecommendationDto } from './dto/create-recommendation.dto';
import { RecommendationExceptionFilter } from './filters/recommendation-exception.filter';
import { RecommendationsService } from './recommendations.service';

@ApiTags('Recommendations')
@ApiBearerAuth('access-token')
@UseGuards(AccessTokenGuard)
@UseFilters(RecommendationExceptionFilter)
@Controller('recommendations')
export class RecommendationsController {
  constructor(private readonly recommendationsService: RecommendationsService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '조건 기반 여행 코스 추천' })
  @ApiOkResponse({ description: '서로 다른 추천 코스 3개 생성 성공' })
  @ApiBadRequestResponse({ description: '요청값 검증 실패' })
  @ApiUnauthorizedResponse({ description: 'access token 누락, 만료 또는 유효하지 않음' })
  @ApiServiceUnavailableResponse({ description: '추천 엔진 호출 실패' })
  createRecommendation(
    @Body() dto: CreateRecommendationDto,
    @Headers('accept-language') language?: string,
  ) {
    return this.recommendationsService.createRecommendation(dto, resolveLanguage(language));
  }
  @Post('context')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'AI 추천 입력 조회' })
  buildContext(
    @Body() dto: CreateRecommendationDto,
    @Headers('accept-language') language?: string,
  ) {
    return this.recommendationsService.buildAgentContext(dto, resolveLanguage(language));
  }
}

function resolveLanguage(header?: string): TourLanguage {
  const primary = header?.split(',')[0]?.trim().toLowerCase().split('-')[0];
  return primary === 'en' || primary === 'zh' ? primary : 'ko';
}
