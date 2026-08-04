import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('returns the standard healthy response', () => {
    const controller = new HealthController();

    expect(controller.getHealth()).toEqual({
      isSuccess: true,
      code: 'COMMON200',
      message: '서버가 정상적으로 동작 중입니다.',
      result: { status: 'ok' },
    });
  });
});
