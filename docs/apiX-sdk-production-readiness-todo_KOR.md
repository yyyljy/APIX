# APIX SDK 프로덕션 레벨 고도화 TODO

Generated date: 2026-03-16

이 문서는 현재 `apix-sdk-node/` 구현 상태를 기준으로, APIX SDK를 **데모/MVP 수준에서 프로덕션 및 외부 배포 가능한 수준**으로 끌어올리기 위해 필요한 추가 작업을 정리한 실행 문서다.

## 현재 상태 요약

- SDK 핵심 기능(402 challenge 생성, tx hash 기반 on-chain verification, session/quota 처리)은 구현되어 있다.
- TypeScript 빌드/타입 진단은 통과한다.
- 그러나 아직 아래의 프로덕션 필수 요건이 부족하다:
  - 테스트 스위트 신뢰성 부족
  - 설정값 안전성 부족(fallback 과다)
  - replay/session 상태의 영속성 부족
  - 프로토콜 계약 고정 미완료
  - 패키징/배포 메타데이터 부족
  - 운영 관측성 및 문서 부족

## 최신 확인 사항

- [ ] `apix-sdk-node npm test` 정상 통과
  - 현재는 실패 상태
  - 원인: 테스트가 `rpcUrl` 없이 `ApixMiddleware`를 생성하지만, 실제 생성자는 `APIX_VERIFICATION_RPC_URL` 또는 `config.rpcUrl`을 필수로 요구함
- [x] TypeScript/진단 기준 컴파일 오류 없음
- [ ] 외부 배포 가능한 npm 패키지 메타데이터 완비
- [ ] contract/integration/E2E 테스트 체계 확보

---

## Priority 0 (외부 공개/실서비스 전 반드시 완료)

### 1. 테스트 스위트 복구 및 CI 기본선 확립
- [ ] `apix-sdk-node/index.test.js`를 현재 SDK 생성자 요구사항과 맞게 수정
- [ ] JSON-RPC mock 기반 unit test 추가
- [ ] `verifyPayment()` negative-path 테스트 추가
  - [ ] tx not found
  - [ ] receipt missing
  - [ ] receipt status failed
  - [ ] recipient mismatch
  - [ ] insufficient amount
  - [ ] network mismatch
  - [ ] insufficient confirmations
  - [ ] RPC timeout / retry exhaustion
- [ ] `createPaymentRequest()` 응답 스냅샷 테스트 추가
- [ ] session start/commit/rollback race/duplicate 테스트 추가
- [ ] CI 파이프라인에서 최소 `build + test + pack check` 자동화

**이유**
- 현재 테스트 실패 상태에서는 회귀(regression)를 막을 수 없고, SDK 외부 배포 신뢰도가 낮다.

**완료 기준**
- `cd apix-sdk-node && npm test` 통과
- CI에서 main 브랜치 기준 자동 검증

### 2. 설정값을 fail-closed 방식으로 전환
- [x] `paymentChainId`, `paymentNetwork`, `paymentRecipient`, `paymentAmountWei`를 프로덕션 필수값으로 승격
- [x] `paymentAmount`, `paymentCurrency`도 명시 설정으로 전환
- [x] 위험한 기본값 제거
  - [x] 기본 chainId `43114` 제거 → APIX `402` 기본값으로 정렬
  - [x] 기본 currency `AVAX`
  - [x] 기본 recipient 하드코딩
  - [x] 자동 fallback 네트워크 보정
- [x] verification RPC 기본값을 APIX testnet RPC로 정렬
- [x] SDK 초기화 시 schema validation 추가
- [x] 설정 불일치 시 경고가 아니라 예외로 실패하도록 변경

**이유**
- 프로덕션에서 fallback은 잘못된 체인/금액/수신자로 결제 검증이 이뤄질 위험이 있다.

**완료 기준**
- 잘못된 config로는 서버가 시작되지 않음
- 운영 환경에서 payment profile이 항상 명시적으로 주입됨

### 3. 402 프로토콜 / 에러 계약 동결
- [x] SDK/backend/frontend 간 error code를 단일 체계로 통일
  - [x] `verification_failed`
  - [x] legacy `apix_verification_failed` 제거 및 alias 정규화
  - [x] `invalid_apix_session`
  - [x] `payment_required`
  - [x] `tx_hash_already_used`
- [x] `WWW-Authenticate` / `PAYMENT-REQUIRED` / JSON body canonical schema 문서화
- [x] 프런트/백엔드/SDK 공통 contract test 추가
- [x] retryable 여부와 상태코드 매트릭스 고정

**이유**
- 클라이언트/서버 간 에러 이름이 흔들리면 SDK 채택 시 통합 비용이 커진다.

**완료 기준**
- 하나의 shared schema 문서가 존재
- 프런트 fallback map과 SDK error code가 1:1로 일치

---

## Priority 1 (실서비스 안정성 확보)

### 4. Session / replay 상태를 영속 저장소로 이전
- [ ] `SessionStore`를 async 인터페이스로 확장 검토
- [ ] Redis/PostgreSQL 기반 store 구현
- [ ] quota 차감/복구를 atomic update로 전환
- [ ] replay 방지(tx hash 사용 이력)를 durable storage로 이전
- [ ] TTL / expiration 정책 추가
- [ ] multi-instance 환경에서 동일 proof 중복 사용 차단

**이유**
- 현재 memory/file 기반 구조는 단일 인스턴스 데모에는 적합하지만, 재시작/수평확장/장애복구 환경에서는 불충분하다.

**완료 기준**
- 서버 재시작 이후에도 session/replay 상태 보존
- 두 인스턴스 이상에서 동일 tx proof 중복 승인 불가

### 5. On-chain verification 및 보안 정책 강화
- [ ] tx proof 재사용 방지를 request/service/path 단위로 정의
- [ ] stale proof 허용 범위 및 block-depth 정책 추가
- [ ] chain reorg 대응 정책 문서화
- [ ] payment requirement와 settlement context의 정합성 검사 강화
- [ ] 향후 entitlement token/BJWT와 연결 가능한 검증 지점 분리

**이유**
- 현재 검증은 recipient/amount/chain/confirmation 중심의 최소 검증이다.
- 프로덕션에서는 replay, stale proof, reorg, 잘못된 context 결합까지 다뤄야 한다.

**완료 기준**
- 보안 실패 케이스별 분류 코드 정의
- 재사용/오래된/stale proof에 대한 명시적 거부 동작 구현

### 6. 운영 관측성(Observability) 추가
- [ ] SDK logger interface 주입
- [ ] metrics/telemetry hook 추가
- [ ] 주요 이벤트 계측
  - [ ] verification latency
  - [ ] rpc retry count
  - [ ] replay reject count
  - [ ] session start/commit/rollback mismatch
  - [ ] challenge issued count
- [ ] request_id / tx_hash / route 중심 tracing 필드 정리

**이유**
- 현재 SDK는 `console.warn` 수준 외에 운영 추적 포인트가 부족하다.

**완료 기준**
- 통합 서비스가 자체 logger/metrics backend에 SDK 이벤트를 연결할 수 있음

---

## Priority 2 (배포 품질 및 개발자 채택성)

### 7. npm 패키징 / 릴리스 엔지니어링 정비
- [ ] `package.json` 메타데이터 보강
  - [ ] `description`
  - [ ] `types`
  - [ ] `exports`
  - [ ] `files`
  - [ ] `repository`
  - [ ] `engines`
  - [ ] 적절한 `license`
- [ ] tarball에서 불필요 파일 제외
  - [ ] `index.ts`
  - [ ] `index.test.js`
- [ ] package-level `README`
- [ ] `CHANGELOG`
- [ ] 버전 정책(SemVer) 및 breaking-change 정책
- [ ] publish 전 smoke check 자동화
- [ ] CJS only 유지 여부 vs ESM/CJS dual package 결정

**이유**
- 지금 상태는 동작 코드는 있지만, “배포 가능한 SDK 패키지” 품질로는 부족하다.

**완료 기준**
- `npm pack --dry-run` 결과가 최소 파일만 포함
- 외부 개발자가 npm 패키지만으로 설치/사용 가능

### 8. 문서/예제/개발자 경험(DX) 보강
- [ ] `apix-sdk-node/README.md` 추가
- [ ] Express quickstart 작성
- [ ] Fastify/Nest 예제 추가 검토
- [ ] env reference 문서화
- [ ] troubleshooting guide 작성
- [ ] example integration repo 또는 sample snippet 보강
- [ ] 루트 README와 실제 체인/RPC/데모 설정 정합성 정리

**이유**
- SDK 채택 장벽은 코드보다 문서와 샘플 부족에서 자주 발생한다.

**완료 기준**
- 신규 개발자가 문서만 보고 30분 내 데모 통합 가능

---

## Priority 3 (제품 확장/상용화 기능)

### 9. Entitlement token / BJWT 확장
- [ ] 402 challenge에 entitlement advertisement 추가
- [ ] settlement response에 entitlement issuance 추가
- [ ] request-time entitlement verifier 추가
- [ ] `proof.jti`, quota, scope, expiry enforcement 추가
- [ ] 관련 negative-path 테스트 추가

**이유**
- pay-per-call에서 quota/pack 기반 제품으로 확장하려면 필요한 구조다.

### 10. 운영 control plane 연계
- [ ] Admin API와 SDK 이벤트/세션 상태 연계 설계
- [ ] reconciliation webhook/consumer 연결
- [ ] settlement lifecycle 조회/운영 API와의 데이터 계약 정의

**이유**
- 프로덕션 SaaS/플랫폼 수준으로 가려면 SDK 단독이 아니라 운영 control plane이 필요하다.

---

## 공통 품질 기준 (각 major ticket 공통)

- [ ] 잘못된 입력/환경설정에 대해 fail-closed
- [ ] 최소 1개 이상의 negative-path 테스트 포함
- [ ] 문서/샘플/변경 로그 업데이트
- [ ] request_id 기준으로 장애 추적 가능
- [ ] 멀티 인스턴스/재시작 환경에서 의미가 유지됨

## 권장 실행 순서

### 1단계: SDK 기본 신뢰성 회복
1. 테스트 복구
2. 설정 fail-closed 전환
3. 프로토콜/에러 계약 통일

### 2단계: 실서비스 안정성
4. durable session/replay store
5. replay/stale/reorg 정책 구현
6. observability 추가

### 3단계: 외부 배포 가능화
7. package/release engineering
8. README / quickstart / examples

### 4단계: 제품 확장
9. entitlement/BJWT
10. admin/reconciliation control plane 연동

## Immediate next action (추천)

이번 주 바로 시작할 작업은 아래 순서를 권장한다.

1. `apix-sdk-node/index.test.js`를 현재 생성자 요구사항에 맞게 수정하고 테스트를 green으로 만든다.
2. payment profile 기본 fallback을 제거하고 필수 env/config validation을 넣는다.
3. SDK/backend/frontend 사이의 error code와 402 challenge schema를 하나로 고정한다.
4. 이후 Redis 또는 PostgreSQL 기반 durable replay/session store 설계로 넘어간다.

## 참고 파일

- `apix-sdk-node/index.ts`
- `apix-sdk-node/index.test.js`
- `apix-sdk-node/package.json`
- `demo/backend/index.ts`
- `demo/frontend/src/utils/api.js`
- `README.md`
- `docs/apiX-development-todo.md`
- `docs/apiX-production-go-to-market-todo.md`
