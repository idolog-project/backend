import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';

/**
 * POST /auth/login 요청 본문입니다.
 * 회원가입과 달리 닉네임·언어는 필요하지 않고, 계정을 식별할 이메일과 비밀번호만 받습니다.
 */
export class LogInDto {
  @ApiProperty({ example: 'fan@idolog.kr' })
  @IsEmail()
  email!: string;

  /** 원문 비밀번호는 bcrypt.compare에만 사용하며 응답·로그·DB에 남기지 않습니다. */
  @ApiProperty({ example: 'password123', minLength: 8, format: 'password' })
  @IsString()
  @MinLength(8)
  password!: string;
}
