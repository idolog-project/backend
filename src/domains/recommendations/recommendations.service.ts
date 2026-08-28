import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';

import { CreateRecommendationDto } from './dto/create-recommendation.dto';
import { RecommendationFailedException } from './exceptions/recommendation-failed.exception';
import { recommendationResponseSchema } from './recommendation.schema';
import { RecommendationResult } from './types/recommendation.type';

const CANDIDATES = [
  {
    id: 101,
    name: '해운대 해수욕장',
    address: '부산광역시 해운대구 해운대해변로 264',
    latitude: 35.1587,
    longitude: 129.1604,
    imageUrl: null,
    overview: '부산을 대표하는 해변 관광지',
    homepageUrl: null,
    category: 'PHOTO',
    recommendedStaySeconds: 5400,
  },
  {
    id: 102,
    name: '청사포 다릿돌전망대',
    address: '부산광역시 해운대구 청사포로 167',
    latitude: 35.1564,
    longitude: 129.1919,
    imageUrl: null,
    overview: '바다 위를 걷는 유리 전망대',
    homepageUrl: null,
    category: 'PHOTO',
    recommendedStaySeconds: 3600,
  },
  {
    id: 103,
    name: '해리단길',
    address: '부산광역시 해운대구 우동 510-7 일원',
    latitude: 35.1631,
    longitude: 129.1585,
    imageUrl: null,
    overview: '카페와 맛집이 모여 있는 골목',
    homepageUrl: null,
    category: 'FOOD',
    recommendedStaySeconds: 5400,
  },
  {
    id: 104,
    name: '동백섬',
    address: '부산광역시 해운대구 우동 710-1',
    latitude: 35.1525,
    longitude: 129.1527,
    imageUrl: null,
    overview: '해안 산책로와 누리마루 전망을 즐길 수 있는 섬',
    homepageUrl: null,
    category: 'NATURE',
    recommendedStaySeconds: 3600,
  },
  {
    id: 105,
    name: '더베이101',
    address: '부산광역시 해운대구 동백로 52',
    latitude: 35.1568,
    longitude: 129.1522,
    imageUrl: null,
    overview: '마린시티 야경을 감상하기 좋은 복합문화공간',
    homepageUrl: null,
    category: 'PHOTO',
    recommendedStaySeconds: 3600,
  },
  {
    id: 106,
    name: '부산엑스더스카이',
    address: '부산광역시 해운대구 달맞이길 30',
    latitude: 35.1594,
    longitude: 129.169,
    imageUrl: null,
    overview: '해운대 전경을 내려다보는 고층 전망대',
    homepageUrl: null,
    category: 'ACTIVITY',
    recommendedStaySeconds: 5400,
  },
  {
    id: 107,
    name: '달맞이길',
    address: '부산광역시 해운대구 달맞이길 일원',
    latitude: 35.1578,
    longitude: 129.1825,
    imageUrl: null,
    overview: '바다 풍경과 카페가 이어지는 드라이브 및 산책길',
    homepageUrl: null,
    category: 'NATURE',
    recommendedStaySeconds: 3600,
  },
  {
    id: 108,
    name: '미포철길',
    address: '부산광역시 해운대구 달맞이길62번길 13',
    latitude: 35.1592,
    longitude: 129.1718,
    imageUrl: null,
    overview: '해안 풍경을 따라 걷는 옛 철길 산책 구간',
    homepageUrl: null,
    category: 'PHOTO',
    recommendedStaySeconds: 3600,
  },
  {
    id: 109,
    name: '해운대 블루라인파크 미포정거장',
    address: '부산광역시 해운대구 달맞이길62번길 13',
    latitude: 35.1597,
    longitude: 129.1728,
    imageUrl: null,
    overview: '해변열차와 스카이캡슐을 이용하는 해안 관광시설',
    homepageUrl: null,
    category: 'ACTIVITY',
    recommendedStaySeconds: 7200,
  },
  {
    id: 110,
    name: '송정해수욕장',
    address: '부산광역시 해운대구 송정해변로 62',
    latitude: 35.1786,
    longitude: 129.1997,
    imageUrl: null,
    overview: '서핑과 여유로운 해변 분위기로 유명한 관광지',
    homepageUrl: null,
    category: 'ACTIVITY',
    recommendedStaySeconds: 5400,
  },
  {
    id: 111,
    name: '죽도공원',
    address: '부산광역시 해운대구 송정동 288-60',
    latitude: 35.1811,
    longitude: 129.2026,
    imageUrl: null,
    overview: '송정 바다를 조망할 수 있는 작은 해안공원',
    homepageUrl: null,
    category: 'NATURE',
    recommendedStaySeconds: 2700,
  },
  {
    id: 112,
    name: '해동용궁사',
    address: '부산광역시 기장군 기장읍 용궁길 86',
    latitude: 35.1883,
    longitude: 129.2233,
    imageUrl: null,
    overview: '바다 절벽에 자리한 부산의 대표적인 사찰',
    homepageUrl: null,
    category: 'CULTURE',
    recommendedStaySeconds: 5400,
  },
  {
    id: 113,
    name: '국립부산과학관',
    address: '부산광역시 기장군 기장읍 동부산관광6로 59',
    latitude: 35.2048,
    longitude: 129.2127,
    imageUrl: null,
    overview: '과학 전시와 체험 프로그램을 제공하는 전시관',
    homepageUrl: null,
    category: 'CULTURE',
    recommendedStaySeconds: 7200,
  },
  {
    id: 114,
    name: '부산시립미술관',
    address: '부산광역시 해운대구 APEC로 58',
    latitude: 35.1667,
    longitude: 129.137,
    imageUrl: null,
    overview: '현대미술 중심의 전시를 만날 수 있는 문화공간',
    homepageUrl: null,
    category: 'CULTURE',
    recommendedStaySeconds: 5400,
  },
  {
    id: 115,
    name: '영화의전당',
    address: '부산광역시 해운대구 수영강변대로 120',
    latitude: 35.1712,
    longitude: 129.127,
    imageUrl: null,
    overview: '부산국제영화제의 중심이 되는 복합 영상문화공간',
    homepageUrl: null,
    category: 'CULTURE',
    recommendedStaySeconds: 4500,
  },
  {
    id: 116,
    name: '센텀시티 신세계백화점',
    address: '부산광역시 해운대구 센텀남대로 35',
    latitude: 35.1697,
    longitude: 129.1291,
    imageUrl: null,
    overview: '쇼핑과 식사, 문화시설을 함께 이용할 수 있는 공간',
    homepageUrl: null,
    category: 'SHOPPING',
    recommendedStaySeconds: 7200,
  },
  {
    id: 117,
    name: '민락수변공원',
    address: '부산광역시 수영구 민락수변로 129',
    latitude: 35.1533,
    longitude: 129.1325,
    imageUrl: null,
    overview: '광안대교와 바다를 가까이에서 감상하는 수변공원',
    homepageUrl: null,
    category: 'NATURE',
    recommendedStaySeconds: 3600,
  },
  {
    id: 118,
    name: '광안리해수욕장',
    address: '부산광역시 수영구 광안해변로 219',
    latitude: 35.1532,
    longitude: 129.1186,
    imageUrl: null,
    overview: '광안대교 전망과 야경으로 유명한 도심 해변',
    homepageUrl: null,
    category: 'PHOTO',
    recommendedStaySeconds: 5400,
  },
  {
    id: 119,
    name: '수영사적공원',
    address: '부산광역시 수영구 수영성로 43',
    latitude: 35.174,
    longitude: 129.1132,
    imageUrl: null,
    overview: '수영 지역의 역사와 전통을 살펴보는 공원',
    homepageUrl: null,
    category: 'CULTURE',
    recommendedStaySeconds: 3600,
  },
  {
    id: 120,
    name: '망미단길',
    address: '부산광역시 수영구 망미동 일원',
    latitude: 35.1718,
    longitude: 129.1087,
    imageUrl: null,
    overview: '개성 있는 카페와 소규모 상점이 모인 골목',
    homepageUrl: null,
    category: 'FOOD',
    recommendedStaySeconds: 5400,
  },
] as const;

@Injectable()
export class RecommendationsService {
  private readonly logger = new Logger(RecommendationsService.name);
  private readonly gemini: GoogleGenAI;

  constructor(private readonly configService: ConfigService) {
    this.gemini = new GoogleGenAI({
      apiKey: this.configService.getOrThrow<string>('OPENAI_API_KEY'),
    });
  }

  async createRecommendation(dto: CreateRecommendationDto): Promise<RecommendationResult> {
    try {
      const response = await this.gemini.models.generateContent({
        model: 'gemini-3.6-flash',
        contents: JSON.stringify({
          instructions: this.buildInstructions(),
          userCondition: {
            locationId: dto.locationId,
            transportMode: dto.transportMode,
            travelStyles: dto.travelStyles,
            startTime: dto.startTime ?? '09:00',
            availableHours: dto.availableHours ?? 8,
            withPet: dto.withPet ?? false,
            partySize: dto.partySize ?? 1,
          },
          candidates: CANDIDATES,
        }),
        config: {
          responseMimeType: 'application/json',
          responseJsonSchema: recommendationResponseSchema,
        },
      });

      if (!response.text) throw new Error('Gemini response is empty');

      const result = JSON.parse(response.text) as RecommendationResult;
      if (result.courses.length !== 3) {
        throw new Error(`Gemini returned ${result.courses.length} courses instead of 3`);
      }
      return result;
    } catch (error) {
      this.logger.error(
        '추천 코스 생성에 실패했습니다.',
        error instanceof Error ? error.stack : String(error),
      );
      throw new RecommendationFailedException();
    }
  }

  private buildInstructions(): string {
    return `
      너는 아이돌 뮤직비디오 촬영지를 시작점으로 하는 당일 여행 코스 추천 AI다.
      제공된 관광지 후보 안에서만 장소를 선택하고 주소, 좌표, URL을 변경하지 마라.
      사용자 조건에 맞는 서로 다른 코스를 정확히 3개 추천하라.
      각 코스의 places는 order 오름차순이어야 하며 첫 장소의 이전 이동거리와 이동시간은 null이다.
      totalDurationSeconds는 이동과 체류 시간을 포함하고, travelDurationSeconds는 이동 시간만 포함한다.
      startTime과 availableHours 범위 안에서 코스를 끝내라.
      세 코스는 장소 구성이나 방문 순서가 서로 달라야 한다.
    `;
  }
}
