-- refresh token 원문은 저장하지 않고 bcrypt 해시만 저장합니다.
-- nullable 컬럼이므로 이미 가입한 사용자 데이터도 안전하게 유지됩니다.
ALTER TABLE "User" ADD COLUMN "refreshTokenHash" TEXT;
