# APIX 402 아키텍처 재구성 제안서 (Seller Backend + SDK + Avalanche L1)

## 1) 목적

중계 서비스를 경유하지 않는 경량 경로로 재구성한다.

- **전제**: API 공급자(판매자)의 백엔드 서버는 존재하며, SDK는 그 백엔드에 내장/연동되어 동작한다.
- SDK 개발자 관점에서는 “백엔드는 있고 SDK가 그 안에서 동작”이 목표가 맞다.

- 기존: 클라이언트 → 백엔드 → SDK → L1
- 목표: 클라이언트 → **판매자 백엔드 + SDK** → L1

아래는 현재 코드 베이스에서 확인 가능한 현재 구조를 기반으로 한 재구성 문서입니다.

이 문서는 **SDK 개발자 관점**에서 작성했으며, 백엔드(판매자 서버)는 반드시 있어야 한다는 조건을 전제로 한다.

- 핵심 정합성: 요청 라우팅/커밋/롤백은 백엔드가 담당하고, `verifyPayment`는 SDK가 Avalanche L1 직접 검증으로 수행한다.
- SDK는 `/v1/verify`, `/v1/session/*`를 더 이상 호출하지 않고, 백엔드 프로세스 내부에서 세션 상태를 직접 소유한다.
- 백엔드가 402 챌린지/세션 시작/커밋/롤백 흐름을 SDK 위임으로 수행하고 있음: `demo/backend/index.ts:454`, `demo/backend/index.ts:473`, `demo/backend/index.ts:420`

---

## 2) 목표 상태 아키텍처

- **Client**
  - 보호 API 호출 → 402 수신 → 지갑으로 tx 제출 → tx hash 재요청
- **판매자 백엔드 + SDK 통합 계층**
  - 402 challenge 생성, tx 검증, JWT 발급/검증, 세션 상태 관리
- **Avalanche L1**
  - tx 영수증/체인/수신자/금액 검증 근거 제공

---

## 3) 설계 원칙

1. 클라우드 필수 경로를 제거해 장애 지점을 줄인다
2. SDK는 인증/세션/쿼터/리플레이 보호의 소유자 역할 수행
3. L1 검증은 실결제 진실성 역할로 한정
4. 다중 인스턴스 환경에서 상태 경쟁을 막기 위한 영속 상태 저장소 도입

---

## 4) 핵심 플로우 (재구성 후)

1. 클라이언트가 보호 리소스 호출
2. 결제 정보가 없으면 백엔드 내부 SDK가 `WWW-Authenticate`, `PAYMENT-REQUIRED` 반환(기존 402 흐름 유지)
3. 클라이언트가 tx 제출 후 `Authorization: Apix <tx_hash>`로 재요청
4. 백엔드 SDK가 tx hash를 L1 기준으로 검증
5. 검증 성공 시 JWT 세션 발급 및 세션 상태 기록
6. 리소스 처리 전 `start`(pending) 처리(공급자 백엔드에서 수행)
7. 2xx 응답 시 commit, 5xx/실패 시 rollback

---

## 5) 상세 변경안

### 5.1 SDK(`apix-sdk-node`) 변경

- `verifyPayment`를 항상 L1 직접 검증으로 단일화
  - `APIX_RPC_URL`, `APIX_RPC_TIMEOUT_MS`, `APIX_RPC_MAX_RETRIES`, `APIX_MIN_CONFIRMATIONS` 사용
- 직접 검증 구성 옵션
  - `rpcUrl` (`APIX_RPC_URL`)
  - `rpcTimeoutMs` (`APIX_RPC_TIMEOUT_MS`)
  - `rpcMaxRetries` (`APIX_RPC_MAX_RETRIES`)
  - `defaultMinConfirmations` (`APIX_MIN_CONFIRMATIONS`)
- 세션 관리 의존성 제거/내부화
  - `SessionStore`는 `validateSession`, `startRequestState`, `commitRequestState`, `rollbackRequestState` 같은 동작을 로컬 스토어에서 직접 수행
- JWT 발급/검증은 SDK가 직접 담당

### 5.2 백엔드(`demo/backend`) 변경

- 기존 미들웨어 진입점은 유지 (`/apix-product`)
- 402 반환/세션 시작/커밋/롤백 호출은 유지
- `ApixMiddleware` 설정에 L1 검증 파라미터 반영
  - `rpcUrl`, `rpcTimeoutMs`, `rpcMaxRetries`, `defaultMinConfirmations`
- 다중 인스턴스 안전 동작을 위해 `APIX_SESSION_STORE_PATH` 사용을 권장

### 5.3 스토어/동시성

- 최소 구현: 기존 파일/메모리 스토어로 PoC 가능
- 운영 권장: Redis 또는 DB 사용
  - `tx_hash` 중복 사용 방지
  - `request_id + tx_hash` idempotency
  - pending 상태 동시성 제어
  - TTL 정리

---

## 6) 제안 데이터 구조(권장)

### Verification/Replay Record
- `request_id`
- `tx_hash`
- `request_id + tx_hash` 정규키
- `expires_at`
- `request_state`

### Session Record
- `token`
- `remaining_quota`
- `request_state` (`idle` / `pending`)
- `expires_at`

---

## 7) 마이그레이션 단계

### Phase 1: Direct L1 Verification 정착
- SDK와 백엔드에서 단일 L1 검증 경로로 동작.
- 외부 검증 서비스 호출 없이 SDK 내부에서 검증/세션 상태를 처리함.

---

## 8) 호환성/운영 체크리스트

- 402 형식(`WWW-Authenticate`, `PAYMENT-REQUIRED`) 유지
- `Authorization: Apix <credential>` 처리 유지(프론트 UX 호환)
- `session_request_in_progress`, `session_quota_exceeded`, `invalid_apix_session` 코드 의미 유지
- 롤백/커밋 정확성(200/비200)
- 멀티 인스턴스에서 replay 및 quota 동시성 안전성

---

## 9) 예상 리스크

- RPC 단일 장애: fallback RPC 및 timeout/retry 전략 필요
- 상태저장 경쟁: 파일 락만으로는 다중 인스턴스 한계
- 체인 재정합성: 블록 재조정/미확인 tx 처리 정책 명문화

---

## 10) 결론

요청하신 “클라이언트-SDK-L1만” 아키텍처는 현재 코드에서 구현됨.

`클라우드 제거`의 본질은 URL 비우기가 아니라, 백엔드-내장 SDK가 검증/세션 상태 책임을 일체 수행한다는 점이다. 즉, SDK는 다음을 모두 자체 처리한다:

- tx hash 검증(
- session 검증/획득/커밋/롤백
- 리플레이 방지
- JWT/쿼터 정책

을 모두 수용하도록 재설계해야 함을 뜻한다.

## 11) SDK 개발자 오해 포인트 정리 (추가)

- 잘못된 표현: “client → SDK → L1”  
  - 정확도: 판매자 리소스 접근 판단은 결국 백엔드에서 일어나므로, 백엔드는 필수.
- 권장 표현: “client → seller backend(with SDK) → L1”
- SDK가 해야 할 일:
  - 402 challenge 발급
  - 결제 tx 검증
  - 세션/쿼터/리플레이 제어
- 백엔드가 해야 할 일:
  - 보호 리소스 라우팅(예: `/apix-product`)와 정책 집행
  - 응답 커밋/롤백 시점 훅(현재 코드 기준: `finalizeQuota`)

현재 코드 근거:
- 백엔드 라우트에서 미들웨어가 402/세션/검증을 트리거 [demo/backend/index.ts:454](/home/jeff/personal/APIX/demo/backend/index.ts:454)
- 세션/쿼터 commit/rollback은 응답 상태 기반으로 처리 [demo/backend/index.ts:420](/home/jeff/personal/APIX/demo/backend/index.ts:420)
