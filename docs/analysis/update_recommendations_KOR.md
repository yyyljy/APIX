# APIX 코드 분석 기반 업데이트 제안서 (2026-02-13)

## 1. 분석 범위
- `apix-cloud` (Go 검증 서비스)
- `apix-sdk-node` (Node SDK, 세션/쿼터 처리)
- `demo/backend` (Express 데모 API)
- `demo/frontend` (React 데모 UI)
- 실행/검증 스크립트 (`execution/*`)

## 2. 현재 상태 요약
- 아키텍처 방향(402 챌린지 -> 결제 증명 -> 검증 -> 세션 JWT)은 명확합니다.
- 그러나 실제 운영 전환 관점에서 `쿼터 정합성`, `RPC 재시도 안정성`, `테스트 자동화`, `환경 분리`가 취약합니다.
- MVP/데모 용도임을 감안해도, 지금 단계에서 수정해두면 이후 리팩터 비용을 크게 줄일 수 있는 항목이 다수 확인되었습니다.

## 3. 우선순위별 업데이트 제안

## P0 (즉시)

### P0-1. 쿼터 커밋 조건 오류 수정
- 근거: `demo/backend/index.ts:167`
- 현재 로직은 `2xx~4xx` 응답을 모두 `commit` 처리합니다.
- 영향: 비정상 요청(예: 4xx)에도 쿼터가 차감되어 과금/사용량 정합성이 깨집니다.
- 제안:
  - 커밋 조건을 `2xx`로 제한.
  - `4xx/5xx`는 기본 `rollback` 처리.
  - `commit/rollback` 호출 시점 중복 방지 플래그를 추가해 방어 로직 강화.

### P0-2. SDK 롤백 안전장치 추가
- 근거: `apix-sdk-node/index.ts:170`, `apix-sdk-node/index.ts:191`
- 현재 `rollbackRequest`는 `pendingDeduction` 여부 확인 없이 quota를 증가시킵니다.
- 영향: 비정상 호출 순서/중복 호출 시 quota가 실제보다 커질 수 있습니다.
- 제안:
  - `pendingDeduction === true`일 때만 rollback 수행.
  - start/commit/rollback 상태 전이를 enum(예: `idle/pending/committed`)으로 관리.

### P0-3. Go RPC 재시도 시 request 재생성
- 근거: `apix-cloud/main.go:395`, `apix-cloud/main.go:411`, `apix-cloud/main.go:413`
- 현재는 동일 `http.Request`를 재시도 루프에서 재사용합니다.
- 영향: 재시도 시 body 재사용 문제가 발생할 수 있어 RPC 호출 안정성이 저하됩니다.
- 제안:
  - 재시도 루프 내부에서 `http.NewRequest`를 매번 새로 생성.
  - `http.Client`는 루프 외부에서 재사용.
  - 가능하면 `context.WithTimeout` + request-scoped context로 취소 제어.

### P0-4. 최소 테스트 체계 도입
- 근거: `apix-sdk-node/package.json:7`, `demo/backend/package.json:8`, `apix-cloud` 테스트 파일 부재
- 영향: 회귀 방지 장치가 없어 핵심 로직 변경 시 리스크가 큽니다.
- 제안:
  - `apix-sdk-node`: `validateSession/start/commit/rollback` 단위 테스트.
  - `apix-cloud`: `validateVerifyRequest`, `chainIDFromNetwork`, `hexToUint64` 단위 테스트.
  - `demo/backend`: 402->검증->JWT 재사용 플로우 통합 테스트.

## P1 (단기)

### P1-1. 환경 변수 기반 URL 통일
- 근거: `demo/frontend/src/utils/api.js:3` (`8080` 고정), 데모 API 호출은 `3000` 사용
- 영향: 코드 전반에서 endpoint 기준이 분산되어 혼선 발생 가능.
- 제안:
  - 프론트는 `VITE_API_BASE_URL` 단일 진입점 사용.
  - 백엔드/클라우드 URL을 `.env.example`로 명시.
  - README 실행 절차를 환경 변수 기준으로 정렬.

### P1-2. 보안 헤더/CORS 정책 환경 분리
- 근거: `apix-cloud/main.go:100` (`Access-Control-Allow-Origin: *`)
- 영향: 운영 전환 시 무분별 허용 정책이 잔존할 위험.
- 제안:
  - `APIX_ALLOWED_ORIGINS` 도입 (쉼표 구분).
  - dev/prod 프로파일 분리 및 기본값 보수화.

### P1-3. 세션 저장소 추상화
- 근거: `apix-sdk-node/index.ts`의 in-memory `Map`
- 영향: 멀티 인스턴스/재시작 시 세션 및 quota 일관성 손실.
- 제안:
  - `SessionStore` 인터페이스 정의 (`get/set/update/delete`).
  - 기본 in-memory + Redis 어댑터 구조로 확장.

### P1-4. 에러 코드 표준화
- 근거: Cloud/SDK/Backend가 문자열 메시지 중심으로 불균일.
- 영향: 클라이언트 분기 처리와 운영 모니터링이 어려움.
- 제안:
  - `code`, `message`, `retryable`, `request_id` 스키마 통일.
  - README 및 API 스펙 문서에 에러 표 추가.

## P2 (중기)

### P2-1. 멱등성/재사용 방지 강화
- 현 상태에서는 동일 tx hash 반복 제출에 대한 명시적 재사용 방지 장치가 부족합니다.
- 제안:
  - `request_id + tx_hash` 조합 멱등키 저장.
  - 재요청 시 동일 결과 반환(또는 명시적 거절) 정책 선택.

### P2-2. 관측성(Observability) 추가
- 제안:
  - 공통 correlation id 전파.
  - 지표: verify latency, verification fail reason, quota rollback count.
  - 구조화 로그(JSON)로 전환.

### P2-3. 프론트 미사용/불완전 페이지 정리
- 근거: 현재 라우팅은 `demo/frontend/src/App.jsx`에서 `/`만 활성화.
- 보조 근거: 일부 페이지는 미완성 코드가 포함됨 (`demo/frontend/src/pages/ProvidersPage.jsx` 내 문자열 깨짐).
- 제안:
  - 미사용 페이지 제거 또는 실사용 라우팅 편입 전까지 `archive`로 분리.
  - 데모 목적 페이지와 실험 페이지를 명시적으로 분리.

## 4. 권장 실행 순서 (2주 기준)
1. P0-1, P0-2, P0-3 수정 및 단위 테스트 작성.
2. 402/검증/JWT 재사용 E2E 테스트 1세트 구축.
3. 환경변수 정리(`.env.example`, README 정비)와 CORS 정책 분리.
4. 세션 저장소 인터페이스 도입 후 in-memory 어댑터부터 교체.

## 5. 완료 기준 (Definition of Done)
- 쿼터 차감은 `2xx` 성공 요청에서만 확정된다.
- 동일 입력 재시도에서 RPC 검증이 안정적으로 동작한다.
- 최소 1개의 CI 테스트 스위트가 SDK/Cloud 핵심 로직을 커버한다.
- 로컬/스테이징에서 환경 변수만으로 endpoint/CORS 설정 전환이 가능하다.

## 6. 검증 메모
- 실행 확인:
  - `apix-sdk-node`: `npm.cmd run build` 성공.
  - `apix-cloud`: `go test ./...` 실행 성공(테스트 파일은 아직 없음).
- 제한:
  - `demo/frontend`는 현재 환경에서 `vite build` 시 `Error: spawn EPERM`으로 빌드 실행 검증이 완료되지 않았습니다(샌드박스 제약 가능성).
