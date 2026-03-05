# APIX BJWT (x402 Entitlement Token) 실현성 및 제안 계획

기반 문서: [apiX-402-bjwt-entitlement-token-proposal.md](/home/jylee/omx/APIX/docs/proposals/apiX-402-bjwt-entitlement-token-proposal.md)  
작성일: 2026-03-06

## 1) 결론 (실현성 요약)

- **실현 가능성: 높음(High)**  
  현재 APIX는 402 challenge + settlement 검증 + quota 기반 세션 소모 흐름을 이미 갖추고 있어, BJWT 확장은 구조적으로 수월하게 이식 가능.
- **현재 상태에서의 한계: 중간(Medium) → 운영용으로 미완성**  
  다만 지금은 `jwt` 세션 토큰 기반의 데모 구현이므로, 제안서의 BJWT/ENTITLEMENT-TOKEN 체계(헤더/PoP/replay 인덱스/온체인-결제 바인딩)는 별도 구현이 필요.
- **핵심 판단**  
  바로 “프로토타입 수준 POC”은 바로 시작할 수 있으나, “프로덕션 출시 가능 상태”는 상태저장, 서명기반 검증, 오류 스키마 통일, 운영 runbook가 완성되어야 달성됨.

## 2) 현재 구현 대비 갭 분석 (2026-03-06 기준)

### 구현된 베이스
- `APIX`는 402 응답을 반환하고, 결제 검증 후 토큰을 발급하는 흐름이 존재.
  - PaymentRequired/Settlement 유사 흐름: [demo/backend/index.ts:472](</home/jylee/omx/APIX/demo/backend/index.ts#L472>), [demo/backend/index.ts:491](</home/jylee/omx/APIX/demo/backend/index.ts#L491>)  
- `verifyPayment`는 온체인 트랜잭션 확인과 수신 파라미터 검증을 수행하며, 성공 시 토큰 발급.
  - [apix-sdk-node/index.ts:555](</home/jylee/omx/APIX/apix-sdk-node/index.ts#L555>)  
- 현재 토큰은 내부 세션 관리 목적의 HS256 JWT + `max_requests` 방식으로 동작하며, 요청 시작/커밋/롤백 로직이 존재.
  - 발급: [apix-sdk-node/index.ts:527](</home/jylee/omx/APIX/apix-sdk-node/index.ts#L527>)  
  - 시작/커밋/롤백: [apix-sdk-node/index.ts:657](</home/jylee/omx/APIX/apix-sdk-node/index.ts#L657>), [apix-sdk-node/index.ts:686](</home/jylee/omx/APIX/apix-sdk-node/index.ts#L686>), [apix-sdk-node/index.ts:683](</home/jylee/omx/APIX/apix-sdk-node/index.ts#L683>)  
- 백엔드는 현재 `Authorization: Apix <proof>` 또는 `PAYMENT-SIGNATURE`에 대해 휴리스틱 파싱을 수행.
  - [demo/backend/index.ts:380](</home/jylee/omx/APIX/demo/backend/index.ts#L380>), [demo/backend/index.ts:398](</home/jylee/omx/APIX/demo/backend/index.ts#L398>), [demo/backend/index.ts:457](</home/jylee/omx/APIX/demo/backend/index.ts#L457>)  
- 프론트는 `tx_hash` 기반 재시도 플로우를 가정하고 있다.
  - [demo/frontend/src/utils/api.js:149](</home/jylee/omx/APIX/demo/frontend/src/utils/api.js#L149>)  

### BJWT/제안 문서 대비 미흡 항목
- `ENTITLEMENT-TOKEN` 전용 헤더/객체 형식 미지원 (현재는 Apix 토큰 중심).
- EIP-191 BJWT 발급/검증 스택 미구축 (`jsonwebtoken` 기반 HS256만 사용).
- 제안서의 `proof (htm/htu/ath/requestHash/jti)` 검증 미구현.
- `paymentRequirementsHash`, `scope` 강제 검증, `jti` 단위 재사용 탐지 미구현.
- `FileSessionStore`는 싱글 프로세스 파일 락 기반으로 운영 강건성이 낮음.
  - 락 경쟁 시 busy-wait: [apix-sdk-node/index.ts:172](</home/jylee/omx/APIX/apix-sdk-node/index.ts#L172>)  
  - 동기 I/O: [apix-sdk-node/index.ts:205](</home/jylee/omx/APIX/apix-sdk-node/index.ts#L205>), [apix-sdk-node/index.ts:224](</home/jylee/omx/APIX/apix-sdk-node/index.ts#L224>)  
- 오류 코드 매핑이 분산되어 프론트-백엔드 불일치.
  - 백엔드: `apix_verification_failed`
  - SDK: `verification_failed`
  - 프론트 에러 맵: [demo/frontend/src/utils/api.js](</home/jylee/omx/APIX/demo/frontend/src/utils/api.js>)  

## 3) 보완해야 될 점 (필수 개선)

1. **토큰 모델 전환 전략**
   - 단일 토큰 파이프라인에서 BJWT path를 병행 유지(하위 호환).
   - 기존 `Apix` JWT는 legacy path로 격리하고, `ENTITLEMENT-TOKEN`은 v1 BJWT 전용 path로 점진 전환.

2. **헤더/전송 스키마 정합성**
   - `createPaymentRequest` 응답에 `extensions.entitlement-token` 광고를 명시하고,
  pack 옵션(`uses`, `amount`, `pack id`)을 인증 가능한 형태로 제시.
  - 클라이언트는 `PaymentPayload.accepted.extra["entitlement-token"]`를 통해 pack 선택 전달.

3. **EIP-191/BJWT 구현**
   - 서명 검증: EIP-191 recover.
   - claim 표준화: `ver`, `kid`, `typ`, `iss/sub`, `aud`, `jti`, `exp/iat`, `quota`, `x402.transaction`.
   - 권장: `ver`/`payload schema` 버전 고정.

4. **PoP proof 도입**
   - 요청 시 `ENTITLEMENT-TOKEN` 헤더 내 token+proof를 JSON(B64)로 받는 방식으로 구현.
   - JCS canonicalization + EIP-191 signature 검증.
   - 최소 항목: `token`, `proof.type`, `proof.jti`, `proof.iat`, `proof.htm`, `proof.htu`, `proof.ath`.

5. **재사용 방지 + 멱등성**
   - `(token.jti, proof.jti)` 복합키 유일 제약 필수.
   - 동일 proof 중복 수신 시 재사용거부 또는 idempotent replay response.
   - proof/jti는 TTL 캐시 또는 DB unique index로 관리.

6. **스토어 강화**
   - 파일 기반 세션 스토어를 Redis/PostgreSQL로 교체.
   - `used_count`, `quota`, `last_used_at`, `proof_jtis` 저장소 모델 분리.

7. **운영 계약 정합성**
   - 에러 코드 단일화: `invalid_token`, `invalid_proof`, `expired`, `quota_exhausted`, `replay_detected` 등.
   - 402/402-extensions 스키마 버저닝 정책 문서화.

8. **프론트엔드 UX**
- 402 수신 시 pack 목록 렌더링 + 사용자 선택 + 결제 후 자동 재요청.
- 보유 토큰 상태를 로컬 캐시에서 관리할지(세션/영속) 결정.

## 4) 개선안 설계 (권고안)

### A. BJWT는 “동일 자격 증명+요청별 PoP” 구조로 유지
- 토큰 자체는 권한 보유 증거, proof는 요청 주체 증명으로 분리.
- 장점: 단순 bearer token 유출 위험 줄임 + replay 제한.

### B. 정산 바인딩 강화
- x402 payment hash(`tx_hash`)를 토큰에 바인딩.
- 가능하면 `paymentRequirementsHash` 저장하여 동일 광고(상품 가격/pack)에 대한 변조 대응.

### C. 멀티-채널 하위 호환
- 기존 Apix JWT는 기존 데모 API에서 계속 지원(legacy).
- BJWT 경로 도입 시 `ENTITLEMENT-TOKEN` 우선 탐지.

### D. 운영 상태 모델(권장)
- `entitlements` 테이블: jti, iss/sub, aud, scope, quota_max, quota_used, tx_hash, exp.
- `proof_events` 테이블: token_jti, proof_jti, request_method, request_path, status, created_at (unique idx on token_jti+proof_jti).
- `quota_events` 테이블: token_jti, endpoint, delta, request_id, settled_at.

## 5) 10주 실행 계획

| 주차 | 목표 | 산출물 | 완료 기준 |
|---|---|---|---|
| 1~2 | 스키마/프로토콜 정합성 확정 | `entitlement-token` draft-to-impl v1 스펙 | 샘플 request/response JSON 확정, 오류 코드표 확정 |
| 3~4 | BJWT 엔진/검증 모듈 구현 | `apix-sdk-node`에 BJWT signer+verifier 추가 | EIP-191 서명/검증 및 토큰 decode 테스트 통과 |
| 5 | 백엔드 402 광고 + pack 선택 수집 | `/apix-product` 경로가 pack 선택을 받음 | accepted.extra 파싱 + verify에서 pack 반영 |
| 6 | entitlement 서버사이드 저장소 전환 | DB/Redis 기반 quota/리플레이 저장소 | 동시성 테스트에서 누락/중복 없는 증명 |
| 7 | request-time PoP 검증/재사용 탐지 구현 | `(token.jti, proof.jti)` 유일성 보장 | 동일 proof 재요청에서 중복 증감 없음 |
| 8 | API contract 통일 및 에러 매핑 통합 | 백엔드-SDK-프론트 에러표 일치 | e2e 402/재요청 케이스 회귀 통과 |
| 9 | 보안/운영 강화 | 로그/알람, 시그니처 key 회전, runbook | 공격 시나리오 대응 체크리스트 통과 |
| 10 | 통합 PoC 데모 | end-to-end pack 구매·재요청·quota 소진 시나리오 | 데모 + 문서 + 체크리스트 완료 |

## 6) 구현 우선순위(바인딩)

- **P0**
  1) BJWT 스펙 동기화(버전·에러·헤더)  
  2) 엔드포인트 광고 및 pack 선택 수신 파이프라인  
  3) BJWT 발급/검증 최소 구현  

- **P1**
  4) PoP proof + replay 제어  
  5) state 저장소 PostgreSQL/Redis 이전  
  6) 402/에러 계약 통일 및 프론트 계약 정합

- **P2**
  7) 리오그/회복성/감사 로그 강화  
  8) 운영 runbook + 모니터링 임계치  
  9) 공개 베타용 문서/온보딩 업데이트

## 7) 핵심 리스크 및 완화안

- **리스크: EIP-191 라이브러리/키 관리 누락**
  - 완화: `ethers.js` 또는 `viem` + 키 롤링 정책, issuer 주소 화이트리스트.
- **리스크: 동시성 높은 환경에서 quota race**
  - 완화: 트랜잭션 기반 원자 차감, DB unique 제약.
- **리스크: 현재 FileSessionStore 성능·안정성 한계**
  - 완화: 영속 스토어/락 분산 구현.
- **리스크: 스키마 불일치로 프론트/백엔드 회귀**
  - 완화: API error contract fixture를 공통 모듈화.

## 8) 바로 실행할 제안 사항(이번 주)

1. `apix-sdk-node`에 BJWT 객체 타입 및 발급/검증 유틸의 뼈대 추가(서명 검증 우선 제외 가능).
2. `demo/backend`에서 402 응답 광고에 `entitlement-token` 필드를 추가하고 `pack`를 선택 받는 입력점 최소화.
3. `API_ERROR_DEFINITIONS`를 제안된 공통 에러셋으로 리팩토링.
4. 프론트 `fetchProxyResource`에 `ENTITLEMENT-TOKEN` 헤더 전송 경로 분기 추가(legacy/extension 동시 지원).
5. `docs/apiX-development-todo.md`와 [apiX-master-delivery-table.md](/home/jylee/omx/APIX/docs/apiX-master-delivery-table.md)에 BJWT P0 항목 3개를 추가해 추적.

## 9) 결론

`apiX-402-bjwt-entitlement-token-proposal.md`의 방향은 현재 APIX 구조에 **정합적으로 탑재 가능**합니다.  
다만 현재 상태는 “샘플 데모 + 기본 402 + 제한적 세션 토큰” 수준이므로, BJWT는 **프로토콜 확장 + 영속 스토어 + 증명 검증 + 보안 운영**이 모두 붙어야만 출시형으로 성립합니다.
