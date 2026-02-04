# Apix 피벗 업무 체크리스트

`docs/003.pivot/plan.md`를 기반으로 Apix를 미들웨어 SDK로 전환하기 위한 구체적인 업무 목록입니다.

## 1단계: 위임된 검증 (1-2주차)
*목표: API 접근 시 블록체인 지연 시간 제거.*

- [ ] **SDK 코어 설정**
    - [ ] `apix-sdk-node` 프로젝트 초기화 (TypeScript/Node.js).
    - [ ] `ApixMiddleware` 클래스 구조 정의.
    - [ ] `init(config)` 메서드 구현 (API Key, Facilitator URL).
- [ ] **Apix Cloud (Facilitator) 모의 서버**
    - [ ] `Apix Cloud`용 간단한 Mock 서버 생성 (Golang).
    - [ ] `POST /v1/verify` 엔드포인트 구현.
    - [ ] Ethers.js 로직 스텁(Stub) 구현 (`tx_hash` 검증 시 우선 항상 true 반환).
- [ ] **위임된 검증 코어**
    - [ ] SDK 내 `verifyPayment(tx_hash)` 구현.
    - [ ] SDK에서 Apix Cloud Mock으로 HTTP 요청 전송.
    - [ ] 검증 응답 및 에러 처리.

## 2단계: 세션 캐싱 및 엔진 (3-4주차)
*목표: 밀리초(ms) 단위의 반복 접근 활성화.*

- [ ] **JWT 구현**
    - [ ] Apix Cloud: `verify` 성공 시 서명된 JWT 발급 로직.
    - [ ] SDK: 공개 키(Public Key)를 사용한 `verifyJWT(token)` 구현.
- [ ] **인메모리 캐싱**
    - [ ] SDK 내 캐싱 레이어 통합 (MVP는 Map, Prod는 Redis 인터페이스).
    - [ ] 활성 JWT 및 쿼터/만료 시간 저장.
    - [ ] 유효한 JWT 존재 시 Cloud 체크를 우회하는 "Fast Path" 구현.
- [ ] **원자적 차감 (Atomic Deduction) 로직**
    - [ ] SDK 캐시 내 요청(Request)별 쿼터 추적 구현.
    - [ ] HTTP 상태 코드를 모니터링하는 `ResponseInterceptor` 생성.
    - [ ] **Commit 로직:** 200 OK -> 쿼터 차감.
    - [ ] **Rollback 로직:** 5xx 오류 -> 차감 안 함(또는 되돌림).

## 3단계: L1 연동 및 보안 (5-6주차)
*목표: 실제 Avalanche L1 연결 및 시스템 보안 강화.*

- [ ] **스마트 컨트랙트 (Avalanche C-Chain)**
    - [ ] `ApixPaymentRouter` 테스트넷 배포.
    - [ ] 이벤트 정의: `PaymentDeposited(bytes32 indexed txHash, uint256 amount)`.
- [ ] **실제 검증 로직**
    - [ ] Apix Cloud: RPC(WebSocket)를 통해 `ApixPaymentRouter` 이벤트 리스닝.
    - [ ] 실제 온체인 데이터를 확인하도록 `verify` 엔드포인트 업데이트.
- [ ] **보안 강화**
    - [ ] **재생(Replay) 방지:** 검증 페이로드에 `nonce` 및 `request_id` 추가.
    - [ ] **서명:** 응답 본문(Body)에 대한 EIP-712 서명 구현.
- [ ] **통합 테스트**
    - [ ] 전체 흐름(E2E): AVAX 결제 -> 해시 획득 -> API 호출 -> 캐시 검증 -> 데이터 수신.

## 4단계: 문서화 및 다듬기
- [ ] SDK 퀵스타트용 `README.md` 작성.
- [ ] 예제 "판매자 서버" 생성 (미들웨어를 사용하는 간단한 Express 앱).
- [ ] 예제 "구매자 스크립트" 생성 (ethers.js로 결제하고 API를 호출하는 스크립트).
