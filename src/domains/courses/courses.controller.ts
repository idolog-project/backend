import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';

import { AccessTokenGuard, type AccessTokenPayload } from '../auth/guards/access-token.guard';
import { CoursesService } from './courses.service';
import { SaveCourseDto } from './dto/save-course.dto';

type AuthenticatedRequest = { user: AccessTokenPayload };

@ApiTags('courses')
@ApiBearerAuth()
@Controller('courses')
@UseGuards(AccessTokenGuard)
export class CoursesController {
  constructor(private readonly coursesService: CoursesService) {}

  @Get()
  @ApiOperation({ summary: '내가 저장한 코스를 최신순으로 조회합니다.' })
  async findMine(@Req() request: AuthenticatedRequest) {
    const courses = await this.coursesService.findMine(Number(request.user.sub));
    return { courses };
  }

  /**
   * 새로 저장하면 201, 이미 저장돼 있던 코스면 200 입니다.
   *
   * 상태코드를 응답 안에서 정해야 해서 Res 를 직접 씁니다. passthrough 로 두어
   * 공통 응답 인터셉터가 평소처럼 봉투를 씌우게 합니다.
   */
  @Post()
  @ApiOperation({ summary: '추천 코스를 저장합니다. 같은 코스를 다시 저장해도 늘지 않습니다.' })
  async save(
    @Req() request: AuthenticatedRequest,
    @Body() dto: SaveCourseDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { course, created } = await this.coursesService.save(
      Number(request.user.sub),
      dto.locationId,
      dto.course,
    );
    response.status(created ? HttpStatus.CREATED : HttpStatus.OK);
    return course;
  }

  @Delete(':courseId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '내 저장 코스를 삭제합니다.' })
  async remove(@Req() request: AuthenticatedRequest, @Param('courseId') courseId: string) {
    await this.coursesService.remove(Number(request.user.sub), courseId);
  }
}
