import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  ApiBody,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { AuthService } from './auth.service';
import { LogInDto } from './dto/log-in.dto';
import { SignUpDto } from './dto/sign-up.dto';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * 로컬 이메일 회원가입 API입니다.
   * @Body()에 SignUpDto 타입을 지정하면 전역 ValidationPipe가 DTO 데코레이터를 검증합니다.
   */
  @Post('signup')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '로컬 회원가입' })
  @ApiBody({ type: SignUpDto })
  @ApiCreatedResponse({
    description:
      '회원가입에 성공했습니다. 응답은 전역 인터셉터에 의해 공통 성공 형식으로 감싸집니다.',
    schema: {
      example: {
        isSuccess: true,
        code: 'COMMON200',
        message: '요청에 성공했습니다.',
        result: { id: 1, email: 'fan@idolog.kr', nickname: '아이돌팬' },
      },
    },
  })
  @ApiConflictResponse({ description: '이미 가입된 이메일입니다.' })
  async signUp(@Body() signUpDto: SignUpDto) {
    return this.authService.signUp(signUpDto);
  }

  /** 이메일과 비밀번호를 확인하고 짧은 수명의 access token을 발급합니다. */
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '로컬 로그인' })
  @ApiBody({ type: LogInDto })
  @ApiOkResponse({
    description: '로그인에 성공했습니다.',
    schema: {
      example: {
        isSuccess: true,
        code: 'COMMON200',
        message: '요청에 성공했습니다.',
        result: { accessToken: 'eyJhbGciOiJIUzI1NiJ9...' },
      },
    },
  })
  async logIn(@Body() logInDto: LogInDto) {
    return this.authService.logIn(logInDto);
  }
}
