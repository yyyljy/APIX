# Apix 피벗 업무 체크리스트

`docs/003.pivot/plan.md`를 기반으로 Apix를 미들웨어 SDK로 전환하기 위한 구체적인 업무 목록입니다.
최신 기준일: 2026-02-21 (현재 코드 기준 정렬)

## 1단계: 위임된 검증 (1-2주차)
*목표: API 접근 시 블록체인 지연 시간 제거.*

- [x] **SDK 코어 설정**
    - [x] `apix-sdk-node` 프로젝트 초기화 (TypeScript/Node.js).
    - [x] `ApixMiddleware` 클래스 구조 정의.
    - [ ] `init(config)` 메서드 기반 초기화 API 추가 (현재는 생성자 기반 부트스트랩).
- [x] **Apix Cloud (Facilitator) 모의 서버**
    - [x] `Apix Cloud`용 간단한 Go 서버 생성.
    - [x] `POST /v1/verify` 엔드포인트 구현.
    - [x] tx-hash 스텁 모드에서 실체인/혼합 검증 경로로 전환.
- [ ] **위임된 검증 코어**
    - [x] SDK 내 `verifyPayment(tx_hash)` 구현.
    - [x] SDK에서 Apix Cloud로 HTTP 검증 요청 전송.
    - [x] 검증 응답 및 에러 처리.

## 2단계: 세션 캐싱 및 엔진 (3-4주차)
*목표: 밀리초(ms) 단위의 반복 접근 활성화.*

- [ ] **JWT 구현**
    - [x] Apix Cloud: `verify` 성공 시 서명된 JWT 발급.
    - [ ] SDK: 공개 키(Public Key) 기반 `verifyJWT(token)` API 추가 (`Shared secret` 검증으로 동작 중).
- [x] **인메모리 캐싱**
    - [x] SDK 캐싱 레이어 통합 (`Map` + 파일 기반 영속 스토어 옵션).
    - [x] 활성 JWT 및 쿼터/만료 시간 저장.
    - [x] 유효한 JWT가 있으면 Cloud 조회를 생략하는 Fast Path 구현.
- [x] **원자적 차감 (Atomic Deduction) 로직**
    - [x] SDK 캐시 내 요청별 쿼터 추적 구현.
    - [x] HTTP 상태 코드를 모니터링하는 Response Hook 생성.
    - [x] **Commit 로직:** 200 OK -> 사용량 확정.
    - [x] **Rollback 로직:** 비-2xx -> 진행 중인 차감 복구.

## 3단계: L1 연동 및 보안 (5-6주차)
*목표: 실제 Avalanche L1 연결 및 시스템 보안 강화.*

- [ ] **스마트 컨트랙트 (Avalanche C-Chain)**
    - [ ] `ApixPaymentRouter` 테스트넷 배포.
    - [ ] 이벤트 정의: `PaymentDeposited(bytes32 indexed txHash, uint256 amount)`.
- [x] **실제 검증 로직**
    - [ ] Apix Cloud: RPC/WebSocket 기반 이벤트 폴링 연동(폴링 운영 경로 우선).
    - [x] 수신자/금액/확인 횟수 및 메타데이터 기반 on-chain 검증.
- [ ] **보안 강화**
    - [x] **재생(Replay) 방지:** 검증 페이로드에 `request_id + tx_hash` 기반 가드 적용.
    - [ ] **서명:** 응답 본문(EIP-712) 서명 적용.
- [ ] **통합 테스트**
    - [ ] 전체 흐름(E2E): AVAX 결제 -> 해시 획득 -> API 호출 -> 캐시 검증 -> 데이터 수신.

## 4단계: 문서화 및 다듬기
- [x] SDK 퀵스타트용 `README.md` 작성.
- [ ] 예제 "판매자 서버" 생성 (미들웨어를 사용하는 간단한 Express 앱).
- [ ] 예제 "구매자 스크립트" 생성 (ethers.js로 결제하고 API 호출하는 스크립트).

## P0: 프로토콜 정합성 스프린트
*목표: 본격 상용 전환 전 x402 호환성 및 신뢰성 최소 기준 충족.*

- [x] **헤더 호환 레이어 (`PAYMENT-*`)**
    - [x] 402 응답 시 `PAYMENT-REQUIRED` 헤더 반환.
    - [x] `PAYMENT-SIGNATURE` 인증 플로우 수용 및 `Authorization: Apix ...` 호환 경로 유지.
    - [ ] 파싱 우선순위/충돌 규칙 문서화.
    - [ ] 회귀 테스트 추가 (legacy/standard/mixed).
- [x] **실체인 검증 도입 (1개 체인 MVP)**
    - [x] `apix-cloud/main.go`의 mock(`always valid`) 제거 및 실제 검증 적용.
    - [x] 수신자/금액/확정 수량 검증.
    - [x] RPC 실패시 timeout/retry 및 에러 코드 정합화.
    - [ ] 통합 테스트(성공/금액부족/수신자불일치/미확정) 보완.
- [x] **시크릿 외부화 + 키 회전 기반**
    - [x] JWT secret 환경변수화.
    - [ ] 배포 시작 시 필수 시크릿 fail-fast 보완.
    - [x] JWT `kid` 클레임/헤더 반영.
    - [ ] dev/stage/prod 시크릿 운영 가이드 정리.
- [x] **네트워크 식별 표준화**
    - [x] 결제 메타데이터에 CAIP-2 스타일 네트워크 식별 반영.
    - [x] 체인별 설정 정규화.
    - [x] 네트워크 불일치 재생 공격 차단.
- [x] **P0 종료 게이트**
    - [x] 하이브리드 경로(legacy + PAYMENT-*) 402 흐름 통과.
    - [ ] 기본 런타임 기본값에서 mock 경로 비활성화.
    - [x] 코드 상 하드코딩 시크릿 제거.
    - [x] 데모 E2E + 백워드 호환 회귀 통과.
