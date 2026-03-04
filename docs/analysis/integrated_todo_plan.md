# 통합 TODO 플랜 (문서 + 코드 정합성)

작성일: 2026-02-21

목표: 기존 문서 체크리스트의 미완료 항목을 코드 실제 상태와 교차 검증해서 실행 가능한 작업 리스트로 통합 정리.

## 우선순위 기준
- `P0`: 현재 보안/호환성/런타임 실패 가능성이 즉시 높은 항목
- `P1`: 기능 완성도/테스트 결함을 빠르게 보완할 항목
- `P2`: 운영/문서/개선 항목

## 1) 문서 기준 TODO (미완료)

### docs/003.pivot/task/pivot_tasks.md
- [P0] SDK Core Setup: `init(config)` 부트스트랩 API 구현.
- [P0] JWT Implementation: SDK의 `verifyJWT(token)` 공개키 기반 검증 API 추가.
- [P1] Smart Contract (Avalanche C-Chain): 스마트 컨트랙트 테스트넷 배포.
- [P1] Smart Contract (Avalanche C-Chain): 이벤트 스키마 `PaymentDeposited(bytes32 indexed txHash, uint256 amount)` 명세/적용.
- [P1] Real Verification Logic: RPC/WebSocket 이벤트 구독 경로(현재는 폴링 운영 경로 우선) 구현/정리.
- [P1] Security Hardening: 응답 본문 EIP-712 서명 적용.
- [P1] Integration Testing: E2E(결제→해시→API→검증→데이터 수신) 테스트 보강.
- [P0] 예제: Express "Seller Server" 예제 앱 추가.
- [P0] 예제: ethers.js "Buyer Script" 추가.
- [P1] Header Compatibility: 헤더 파싱 우선순위/충돌 규칙 문서화.
- [P1] Header Compatibility: 레거시 Apix 헤더, PAYMENT-* 표준, mixed case 회귀 테스트 추가.
- [P1] Real On-Chain Verification: 성공/underpayment/수신자 불일치/미확정 tx 통합 테스트 추가.
- [P1] Secret Management: 런타임 fail-fast(필수 시크릿 누락 즉시 종료) 보강.
- [P2] Secret Management: dev/stage/prod 비밀관리 가이드 정리.
- [P0] Definition of Done: 기본 런타임에서 mock 경로 기본 비활성화(옵션 모드만 유지) 완결.

### docs/003.pivot/task/x402_p0_tasks_KOR.md
- [P1] 파싱 우선순위/충돌 규칙 문서화.
- [P1] 회귀 테스트: legacy/standard/mixed 헤더 케이스.
- [P1] 통합 테스트: 성공/금액부족/수신자불일치/미확정 케이스.
- [P2] dev/stage/prod 비밀관리 가이드 문서화.
- [P1] 운영 체크: 최소 로깅/오류코드/장애 원인 추적이 실제로 가능한지 점검.

### docs/002.plan/002.dev/listup/*
- [P2] 순위에 따라 문서 산출물(시퀀스 다이어그램, API 명세, ERD, FRD, 아키텍처, QA/테스트 계획, 마일스톤, 리스크 완화 등) 작성.

## 2) 코드 기준 TODO (현재 구현 대비)

### apix-sdk-node/index.ts
- [P0] `verifyJWT(token)` 추가. 현재는 세션 검증에서 `jwt.verify`로 토큰 무결성만 확인하고 공개키/검증 모드 분리 정책이 없음.
- [P1] `validateSessionState/verifyPayment`에서 공용 에러 메시지/타입 일관성 정리 (오류 코드 명세와 동기화).

### demo/backend/index.ts
- [P1] 헤더 파싱 정합성 정책을 코드 + 테스트로 고정:
  - `Authorization`(Apix) vs `PAYMENT-SIGNATURE` mixed/legacy/표준 케이스 우선순위 규칙을 명시하고 회귀 테스트로 보장.
- [P1] 결제 미제출 응답에서 `PAYMENT-REQUIRED`/`WWW-Authenticate` 동시 동작에 대한 명세 주석 정리(문서와 동일성 유지).

### apix-cloud/main.go
- [P1] `EnableMockVerify` 가동/비가동 모드 동작 문서화 및 테스트 프로파일 강화.
  - 현재 mock-path은 환경변수 전환으로 유지되므로, 기본 런타임 정책이 문서 게이트와 일치하는지 점검 필요.
- [P1] 운영 체크포인트 보강: `writeError`/`verify.request_completed`에서 최소 장애 추적 항목(log/event) 점검 및 누락 항목 보완.
- [P2] verify 플로우 관련 핵심 분기(네트워크/확정수/값 조건 실패) 통합 테스트를 시나리오별로 확장.

## 3) 통합 완료 기준 (권장)
- P0 3개 항목(`verifyJWT`, 예제 앱/스크립트, 헤더 우선순위 회귀 테스트)을 선행 완료.
- P1 항목은 코드+문서 동기화 후, `x402_p0_tasks_KOR`의 운영 테스트 항목으로 회귀.
- 문서 체크리스트의 `[ ]` 항목은 문서 상태표시와 구현 상태표시를 동일 라인에서 1주기 단위로 동기화.
