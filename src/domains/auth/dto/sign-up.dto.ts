import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * POST /auth/signup 요청 본문(body)의 모양과 검증 규칙입니다.
 *
 * Controller에서 @Body() SignUpDto로 받으면 main.ts의 ValidationPipe가
 * 아래 데코레이터를 확인합니다. 규칙을 지키지 않은 요청은 Service와 DB에
 * 도달하기 전에 자동으로 400 Bad Request가 됩니다.
 */
export class SignUpDto {
  /** 이메일 형식인지 검사합니다. 예: fan@idolog.kr */
  @ApiProperty({ example: 'fan@idolog.kr' })
  @IsEmail()
  email!: string;

  /**
   * 비밀번호 원문입니다. Service에서 해시로 바꾼 후에만 DB에 저장해야 합니다.
   * 이 DTO에 있는 password는 요청 처리 중에만 존재하며 로그에 남기면 안 됩니다.
   */
  @ApiProperty({ example: 'password123', minLength: 8, format: 'password' })
  @IsString()
  @MinLength(8)
  password!: string;

  /** 서비스 화면에 표시할 닉네임입니다. */
  @ApiProperty({ example: '아이돌팬', minLength: 2, maxLength: 20 })
  @IsString()
  @MinLength(2)
  @MaxLength(20)
  nickname!: string;

  @IsOptional()
  @ApiPropertyOptional({
    example: 'ko',
    enum: ['ko', 'en', 'zh'],
    description: '보내지 않으면 Service가 ko를 기본값으로 저장합니다.',
  })
  @IsString()
  @IsIn(['ko', 'en', 'zh'])
  preferredLanguage?: string;
}
