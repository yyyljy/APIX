# x402 플로우 분석 및 비교 (현행 상태 기준)

**일자:** 2026-02-21
**프로젝트:** Apix (Pivot Phase)
**주제:** Apix x402 플로우와 HTTP 402 계열 표준 비교

## 1. 요약 (Executive Summary)

Apix는 현재 `402 Payment Required` 기반 챌린지-응답 흐름을 사용하며, 호환성 우선 방식으로 다음을 지원합니다.
- 보호된 API는 `402`와 함께 `WWW-Authenticate`, `PAYMENT-REQUIRED`, JSON 바디를 함께 반환
- 결제 증명은 `Authorization: Apix <tx_hash>` 또는 `PAYMENT-SIGNATURE` 폴백으로 수신
- 기본 동작은 mock가 아닌 실체인 검증 경로를 사용하고, replay/network 검증 및 확인 수(depth) 검증이 적용

## 2. 현행 Apix x402 구현

### 2.1. 플로우 (챌린지-응답 모델)

1. **요청:** 클라이언트가 자격 증명 없이 보호된 리소스(예: `GET /apix-product`)를 요청.
2. **챌린지:** 서버가 `HTTP 402` 응답 반환
   - `WWW-Authenticate` 헤더
   - `PAYMENT-REQUIRED` 헤더
   - JSON 바디: `request_id`, 네트워크/체인 정보, 결제 금액/수신자
3. **결제:** 클라이언트가 Avalanche L1에서 온체인 트랜잭션 수행.
4. **증명:** 동일 요청을 재시도하며
   - `Authorization: Apix <tx_hash>` 또는
   - `PAYMENT-SIGNATURE` 폴백으로 증명 전달
5. **검증:** Cloud가 트랜잭션을 온체인 메타데이터/요청 메타데이터와 대조 후 세션 JWT 발급

### 2.2. 코드 참조
- `apix-cloud/main.go`: `POST /v1/verify`에서 트랜잭션 검증, replay/네트워크 체크, JWT 발급.
- `apix-sdk-node/index.ts`: 증명 추출 및 Cloud 검증 요청, 세션 캐시/쿼터 추적, start-commit-rollback.
- `demo/backend/index.ts`: `extractPaymentProof`에서 `Authorization`과 `payment-signature` 동시 지원, 402 응답 헤더 포함.

## 3. 업계 표준과의 비교 (x402 / L402)

| 항목 | Apix 현행 | 표준 x402 / L402 | Gap / 비고 |
| :--- | :--- | :--- | :--- |
| **상태 코드** | `402 Payment Required` | `402 Payment Required` | ✅ 일치 |
| **챌린지 위치** | 바디 + `WWW-Authenticate` + `PAYMENT-REQUIRED` | 주로 헤더 기반 | 헤더 제공으로 파서성/호환성 개선됨 |
| **증명 전송** | `Authorization: Apix <tx_hash>` + `PAYMENT-SIGNATURE` 폴백 | `Authorization: L402 <credential>` | 실무 호환은 높아졌지만 표준 credential 경로는 추가 개선 필요 |
| **상태 관리** | 상태 기반 세션 + 쿼터 + replay 가드 | 무상태 토큰형이 기본인 사례 존재 | 상태 기반이지만 실시간 사용량 제어에 유리 |
| **정산 레이어** | Avalanche L1(확정 후 검증) | L2/LN 즉시 정산 모델이 일반적인 예시 | 대가치 API에는 L1 정합성 이점이 큼 |

## 4. 최신 갭 분석

### 4.1. 장점
- 헤더 + 바디 동시 제공으로 호환성과 디버깅성 상승
- mock 기반이 아닌 실체인 검증 기반으로 신뢰성 상승
- `request_id + tx_hash` + 네트워크 검증으로 replay 방지 강화

### 4.2. 남은 과제
- `L402` 스타일 credential 정식 경로의 우선 채택
- 완전 무상태 토큰 처리 모델로의 단계적 전환
- underpayment/수신자 불일치/미확정 케이스 통합 테스트 보강

### 4.3. 다음 단계 권고
1. 파싱 우선순위를 문서화하고 계약으로 고정
2. 기존 호환 경로를 유지한 상태로 `L402` 스타일 토큰 경로를 병행 도입
3. 결제 실패-재시도 시나리오 및 운영 메트릭(rollback/commit/오류코드) 강화
