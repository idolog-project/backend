# AI 추천 구현 및 연동

## 실행 흐름

```text
POST /api/v1/recommendations
 → JWT 인증 + DTO 검증
 → RecommendationsService.buildAgentContext
   → Prisma: 시작 촬영지 조회
   → TourApiClient: 언어·스타일별 관광타입 조회
   → 후보 ID 중복 통합, matchedStyles 병합, 거리순 정렬, 최대 60개
 → COURSE_AGENT = PlanningCourseAgent
   → 좌표·이미지·시작점 중복 검사, 최대 40개
   → AgentContext를 PlanningInput으로 변환
 → RecommendationOrchestrator
   → Gemini: A/B/C 코스 3개 생성
   → AIOutputValidator + CandidatePoolGuard
   → MapRouteService: 실제 구간 거리·이동시간
   → RouteFeasibilityValidator: 일정 검증
   → CourseAssembler: 원본 장소 정보와 일정 결합
 → HTTP 200: { isSuccess, code, message, result: { courses } }
```

원격 브랜치의 전처리와 CourseAgent 인터페이스를 유지하고, 런타임의 FixedCourseAgent를
PlanningCourseAgent로 교체했다. 고정 규칙 에이전트 파일은 남아 있지만 모듈에 등록하지 않는다.
준비된 후보를 오케스트레이터에 전달하므로 동일 요청에서 기존 RecommendationCandidateProvider로
후보를 다시 조회하지 않는다. 기존 provider는 준비된 입력 없이 오케스트레이터를 직접 호출할 때만 사용한다.

## 입력과 언어

프론트는 전처리 후보가 아니라 locationId, transportMode, travelStyles와 선택 조건을 전송한다.
Accept-Language의 첫 태그로 ko/en/zh를 선택하며 그 외에는 ko를 사용한다.
TourAPI 언어와 AI 출력 언어에 이를 전달한다. 후보 ID는 TOUR_<language>_<contentId> 형식이다.
장소명과 이미지는 후보 원본을 사용하며 AI가 생성하지 않는다.

POST /api/v1/recommendations/context는 인증 후 전처리 입력을 반환한다.
이 경로는 AI나 지도 API를 호출하지 않는다.

## AI 및 지도 책임

- Gemini: 허용 후보 선택, 방문 순서, 제목·요약·추천 이유, 권장 체류시간.
- 백엔드: 선택한 촬영지를 모든 코스 첫 장소로 고정, 장소 원본 데이터 결합.
- TAXI/CAR: 카카오모빌리티 자동차 길찾기. KAKAO_MOBILITY_API_KEY 필요.
- WALK/BUS: Google Routes. GOOGLE_MAPS_API_KEY 필요.
- 실제 지도 결과로 거리, 이동시간, 도착·출발 시각, 총 소요시간을 계산한다.

시작 촬영지 체류시간은 1시간, 후속 장소는 2~5개다.
AI 입력에 체류시간 범위, 가용 시간과 자정 제한을 전달한다.
후보가 3개 미만이면 AI를 호출하지 않고 빈 courses 배열을 반환한다.

## 검증과 재시도

- 허용 후보 ID, 코스별 장소 중복, 서로 다른 A/B/C 방문 순서, 출력 형식 검증.
- 잘못된 출력은 오류 코드와 직전 응답을 전달해 Repair 최대 1회.
- 시간 초과·당일 완료 불가·과도한 이동시간은 Replan 최대 1회.
- MAP_ROUTE_NOT_FOUND와 KAKAO_ROUTE_NOT_FOUND도 문제 구간 ID를 전달해 재계획.
- 모든 재계획 사유는 같은 1회 한도를 공유한다.
- 지도 인증·권한 오류는 AI 재계획으로 처리하지 않는다.
- Gemini HTTP 429는 즉시 재시도하지 않는다. 발생 후 같은 서버 프로세스의 Gemini 클라이언트는 60초 동안 추가 호출을 차단한다. 이후 요청부터 호출을 다시 허용하며, 이 대기 시간이 실제 할당량 초기화를 보장하지는 않는다.
- 지도 API의 기존 재시도 정책과 Gemini의 일시적 서버·네트워크 오류 재시도는 유지한다. 여러 서버 인스턴스의 제한 상태는 공유되지 않는다.
- 추천 파이프라인 실패의 외부 계약은 503 RECOMMENDATION_FAILED다.

## 미구현 범위 및 검증 한계

전처리는 운영시간·휴무일·주차·반려동물 허용 여부를 상세 조회하지 않는다.
withPet은 입력에 보존되지만 허용 여부 필터는 아직 없다.
관광지 overview와 homepageUrl은 현재 null이다. AI는 미확인 조건을 사실로 안내하지 않도록 지시한다.

기획서에는 OpenAI가 기재되어 있으나 현재 등록된 AI 구현체는 Gemini다.
자동 테스트는 외부 DB·TourAPI·AI·지도 호출에 대역을 사용한다.
실제 키와 배포 환경에서 전체 추천 성공 여부는 별도 통합 확인이 필요하다.
