import { Body, Controller, Headers, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import type { TourLanguage } from '../tourism/tour-api.client';
import { CreateRecommendationDto } from './dto/create-recommendation.dto';
import { RecommendationsService } from './recommendations.service';

/**
 * Accept-Language 를 앱이 지원하는 세 언어 중 하나로 좁힙니다.
 *
 * `zh-Hans` 처럼 지역이 붙은 태그와 `ko, en;q=0.9` 같은 품질값 목록이 모두
 * 들어오므로 앞쪽 기본 태그만 봅니다. 모르는 값은 국문으로 둡니다.
 */
function resolveLanguage(header?: string): TourLanguage {
  const primary = header?.split(',')[0]?.trim().toLowerCase().split('-')[0];
  if (primary === 'en') return 'en';
  if (primary === 'zh') return 'zh';
  return 'ko';
}

@ApiTags('recommendations')
@Controller('recommendations')
export class RecommendationsController {
  constructor(private readonly recommendationsService: RecommendationsService) {}

  /**
   * 촬영지에서 출발하는 코스를 추천합니다.
   *
   * 아직 AI 에이전트가 없어 고정 규칙으로 만든 코스가 나옵니다. 요청·응답
   * 형태는 실제와 같으므로 프론트는 이대로 그리면 되고, 에이전트가 붙어도
   * 이 경로와 형태는 그대로입니다.
   */
  @Post()
  @ApiOperation({ summary: '촬영지에서 출발하는 코스를 추천합니다.' })
  async recommend(
    @Body() dto: CreateRecommendationDto,
    @Headers('accept-language') acceptLanguage?: string,
  ) {
    const courses = await this.recommendationsService.recommend(
      dto,
      resolveLanguage(acceptLanguage),
    );
    return { courses };
  }

  /**
   * 에이전트에 넘길 입력을 그대로 돌려줍니다.
   *
   * 모델이 무엇을 보고 코스를 짜는지 눈으로 확인할 수 있어야, 결과가 이상할 때
   * 입력이 문제인지 프롬프트가 문제인지 가릴 수 있습니다.
   */
  @Post('context')
  @ApiOperation({ summary: 'AI 에이전트에 넘길 추천 입력을 조립해 보여줍니다.' })
  async buildContext(
    @Body() dto: CreateRecommendationDto,
    @Headers('accept-language') acceptLanguage?: string,
  ) {
    return this.recommendationsService.buildAgentContext(dto, resolveLanguage(acceptLanguage));
  }
}
