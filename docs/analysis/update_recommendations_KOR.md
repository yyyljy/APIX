# APIX 코드 분석 기반 업데이트 제안서 (2026-02-21)

## 1. 분석 범위
- `apix-cloud` (Go 검증 서비스)
- `apix-sdk-node` (Node SDK, 세션/쿼터 처리)
- `demo/backend` (Express 데모 API)
- `demo/frontend` (React 데모 UI)
- 실행/검증 스크립트 (`execution/*`)

## 2. 현재 상태 요약
- 아키텍처 방향(402 챌린지 -> 결제 증명 -> 검증 -> 세션 JWT)은 명확합니다.
- 최근 핵심 구현에서 `쿼터 정합성`과 `on-chain` 안정성은 개선되어, 현재 검토 우선순위는 `테스트 보강`, `옵저버빌리티`, `환경 분리 전략`입니다.
- MVP/데모 용도임을 감안해도, 지금 단계에서 누락한 경계 시나리오를 보강하면 이후 리팩터 비용이 크게 줄어듭니다.

## 3. 우선순위별 업데이트 제안

## P0 (즉시)

### P0-1. 쿼터 정합성 재확인
- 근거: `demo/backend/index.ts`
- 현재 로직은 `2xx` 성공만 커밋하고 비성공은 롤백입니다.
- 제안:
  - 완료된 항목으로 반영.
  - 정책상 `4xx/5xx` 구간에서 retry 정책 분리와 비용 귀속 정책을 문서화.

### P0-2. SDK 롤백 안전장치 강화
- 근거: `apix-sdk-node/index.ts`
- 현재 `rollbackRequest`는 `pending` 상태에서만 복구합니다.
- 제안:
  - 현재 동작은 안정적이므로 유지.
  - 상태 전이 모델을 enum 타입으로 명시해 가독성을 높이기.

### P0-3. Go RPC 재시도 신뢰도 검증
- 근거: `apix-cloud/main.go`
- 현재 재시도 및 실패 판별 경로가 구현되어 있으며 안정성 향상 여지가 남아 있음.
- 제안:
  - 재시도 전후 지표를 Cloud 로그에 일관되게 남겨 장애 추적성 강화.

### P0-4. 최소 테스트 체계 확장
- 근거: 기존 단위/통합 테스트는 핵심 흐름은 다루나, 경계 실패 시나리오가 부족.
- 제안:
  - `apix-cloud`: underpayment / wrong recipient / unconfirmed / replay mismatch 테스트 추가.
  - `demo/backend`: `PAYMENT-SIGNATURE` + mixed headers 통합 테스트.
  - `apix-sdk-node`: 파싱/검증 실패 경로 회귀 테스트 보강.

## P1 (단기)

### P1-1. 환경 변수 기반 URL/운영 정책 통일
- 근거: 다중 런타임에서 엔드포인트, 토큰, CORS 정책이 분산.
- 제안:
  - 프론트/백엔드/클라우드 설정을 `.env` 기준으로 정합화.
  - `VITE_API_BASE_URL`, `APIX_ALLOWED_ORIGINS`, `APIX_JWT_SECRET` 운영 가이드 정리.

### P1-2. 보안 헤더/CORS 정책 환경 분리
- 근거: 환경별 정책이 현재 소스 레벨에 부분 고정됨.
- 제안:
  - 운영에서 `*` 허용 정책을 기본값이 아닌 명시형 allowlist로 제한.
  - webhook/HMAC 파트는 검증 모드별 정책 분기 명시.

### P1-3. 세션 저장소 추상화
- 근거: 현재 in-memory/파일 스토어 기반.
- 제안:
  - `SessionStore` 인터페이스를 기반으로 Redis/분산 스토어 플러그인 적용.
  - 다중 인스턴스 배포에서 quota 유실 방지를 기본값으로 강화.

### P1-4. 에러 코드 표준화
- 근거: 코드/클라이언트 메시지 형식이 다층 혼재.
- 제안:
  - Cloud/API/common `code`, `message`, `retryable`, `request_id` 스키마를 공통화.
  - README 및 API 문서에 에러 체계 항목 추가.

## P2 (중기)

### P2-1. 멱등성/재사용 방지 강화
- 제안:
  - request_id + tx_hash 정책 문서화 후 운영 정책(재사용 허용/거절) 고정.

### P2-2. 관측성(Observability) 추가
- 제안:
  - 공통 correlation id 전파.
  - 지표: verify latency, verification fail reason, quota rollback count.
  - 구조화 로그(JSON)로 전환.

### P2-3. 프론트 페이지 정리
- 제안:
  - 라우팅/페이지 사용성 정합성 점검.
  - 미사용 페이지를 의도적으로 정리해 데모 경로만 유지.

## 4. 추천 실행 순서 (2주 기준)
1. P0-1, P0-2, P0-3 검증 강화 및 테스트 확대.
2. 402/검증/E2E 테스트 1세트 구축 (`failure matrix` 포함).
3. 환경변수 정리(`.env.example`, README 정비)와 CORS/보안 정책 분리.
4. 분산 저장소 인터페이스 후속 적용.

## 5. 완료 기준 (Definition of Done)
- 쿼터 커밋은 `2xx` 성공 요청에서만 확정된다.
- 동일 입력 재시도에서 검증이 안정적으로 동작한다.
- 최소 1개 통합 테스트 스위트가 핵심 경로와 실패 케이스를 커버한다.
- 로컬/스테이징에서 환경 변수만으로 endpoint/CORS 설정 전환이 가능하다.

## 6. 검증 메모
- `demo/backend`는 `npm start` 기반의 시나리오 테스트가 실행 흐름 확인에 유효.
- `apix-cloud`: `go test ./...` 시나리오 확대가 권장됨.
- `demo/frontend`: 빌드/렌더 경로 확인은 현재 환경 제약(EADDR/EPERM) 우회 확인 필요.
