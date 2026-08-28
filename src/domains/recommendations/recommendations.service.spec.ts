import { ConfigService } from '@nestjs/config';

import {
  CreateRecommendationDto,
  TransportMode,
  TravelStyle,
} from './dto/create-recommendation.dto';
import { RecommendationFailedException } from './exceptions/recommendation-failed.exception';
import { RecommendationsService } from './recommendations.service';

describe('RecommendationsService', () => {
  const dto: CreateRecommendationDto = {
    locationId: 1,
    transportMode: TransportMode.TAXI,
    travelStyles: [TravelStyle.PHOTO, TravelStyle.FOOD],
    startTime: '09:00',
    availableHours: 8,
    withPet: false,
    partySize: 2,
  };

  const createService = () => {
    const configService = {
      getOrThrow: jest.fn().mockReturnValue('test-api-key'),
      get: jest.fn().mockReturnValue(false),
    } as unknown as ConfigService;
    return new RecommendationsService(configService);
  };

  const createMockCourse = (id: string, title: string) => ({
    id,
    title,
    summary: `${title} 요약`,
    reason: '사진과 맛집 취향을 반영한 코스입니다.',
    places: [
      {
        order: 1,
        name: '해운대 해수욕장',
        address: '부산광역시 해운대구 해운대해변로 264',
        latitude: 35.1587,
        longitude: 129.1604,
        imageUrl: null,
        overview: '부산을 대표하는 해변 관광지',
        homepageUrl: null,
        arrivalTime: '09:00',
        category: 'PHOTO',
        distanceFromPrevMeters: null,
        durationFromPrevSeconds: null,
      },
    ],
    totalDistanceMeters: 0,
    totalDurationSeconds: 5400,
    travelDurationSeconds: 0,
    startTime: '09:00',
    endTime: '10:30',
  });

  it('구조화된 코스 목록을 반환한다', async () => {
    const service = createService();
    const result = {
      courses: [
        createMockCourse('course-1', '해운대 포토 코스'),
        createMockCourse('course-2', '청사포 산책 코스'),
        createMockCourse('course-3', '해리단길 맛집 코스'),
      ],
    };
    const generateContent = jest.fn().mockResolvedValue({ text: JSON.stringify(result) });
    Reflect.set(service, 'gemini', { models: { generateContent } });

    await expect(service.createRecommendation(dto)).resolves.toEqual(result);
    expect(generateContent).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'gemini-3.6-flash',
        config: expect.objectContaining({
          responseMimeType: 'application/json',
          responseJsonSchema: expect.objectContaining({ type: 'object' }),
        }),
      }),
    );

    const request = generateContent.mock.calls[0][0] as { contents: string };
    const prompt = JSON.parse(request.contents) as {
      userCondition: CreateRecommendationDto;
      candidates: Array<{ id: number; name: string }>;
    };
    expect(prompt.userCondition).toMatchObject(dto);
    expect(prompt.candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 101, name: '해운대 해수욕장' }),
        expect.objectContaining({ id: 102, name: '청사포 다릿돌전망대' }),
        expect.objectContaining({ id: 103, name: '해리단길' }),
      ]),
    );
    expect(result.courses).toHaveLength(3);
  });

  it('외부 추천 호출 실패를 503 오류로 변환한다', async () => {
    const service = createService();
    const generateContent = jest.fn().mockRejectedValue(new Error('Gemini unavailable'));
    Reflect.set(service, 'gemini', { models: { generateContent } });

    const promise = service.createRecommendation(dto);
    await expect(promise).rejects.toBeInstanceOf(RecommendationFailedException);
    await expect(promise).rejects.toMatchObject({
      response: {
        code: 'RECOMMENDATION_FAILED',
        message: '추천 코스를 생성할 수 없습니다.',
      },
    });
  });

  it('Gemini가 코스를 정확히 3개 반환하지 않으면 503 오류로 변환한다', async () => {
    const service = createService();
    const generateContent = jest.fn().mockResolvedValue({
      text: JSON.stringify({ courses: [{}, {}] }),
    });
    Reflect.set(service, 'gemini', { models: { generateContent } });

    await expect(service.createRecommendation(dto)).rejects.toBeInstanceOf(
      RecommendationFailedException,
    );
  });
});
