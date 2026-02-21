# APIX L1 Admin API 기술명세서 (Gin / Go)

## 1. 구성 요소
- `cmd/adminapi/main.go`
  - 환경변수 기반으로 운영 API 구성 생성
  - API 키 미들웨어 등록 (`/v1/*`)
  - Kafka Publisher + AdminService DI
- `internal/adminapi`
  - `handlers.go`: 라우트/파라미터 파싱/응답
  - `security_middleware.go`: `X-API-KEY` 또는 설정 헤더 기반 인증
  - `service.go`: DB/Kafka/리스크 엔진 비즈니스 로직
  - `kafka_publisher.go`: kafka-go 기반 발행 래퍼

## 2. API Contract
### GET `/v1/health`
- 응답
  - `status`: UP / DEGRADED
  - `chain_id`: 402
  - `kafka_healthy`, `lag_ms` 등

### GET `/v1/events`
- Query: `wallet`, `event_type`, `api_id`, `status`, `from`, `to`, `page`, `size`
- 정렬: `created_at DESC`
- 응답: `EventListResponse`

### GET `/v1/risk/alerts`
- Query: `wallet`, `grade`, `status`, `page`, `size`
- 응답: `RiskAlertListResponse`

### GET `/v1/risk/score/{wallet}`
- 응답: `RiskScoreResponse` (`risk_score`, `risk_grade`, `signals`)

### POST `/v1/risk/alerts/{alert_id}/ack`
- Body: `status`, `note`, `assigned_to`
- 상태 허용값: `ACKNOWLEDGED`, `INVESTIGATING`, `RESOLVED`

### GET `/v1/ops/lag`
- 운영 모니터링 지표

### POST `/v1/ops/replay`
- Body: `from_block`, `to_block`, `reason`
- 실행 큐에 재처리 Job 등록

### POST `/v1/ops/rules/reload`
- Body: `dry_run`, `force`

### POST `/webhooks/apix-l1`
- Body: `WebhookEnvelope` (`event_id`, `event_type`, `source`, `payload`)
- 서명 헤더 기본값: `X-Webhook-Signature`
- 검증 통과 후 raw 저장 → Kafka `raw topic` 발행 → 비동기 리스크 재평가

## 3. Webhook 검증
- 서명 모드 A: `v1`/`sha256` + `t` 조합 (`t=...,v1=...`)
- 입력 문자열: `"{timestamp}.{raw_body}"`
  - `HMAC-SHA256(secret, 문자열)` 비교
  - Replay 허용 범위: 기본 300초
- 서명 모드 B: 일반 `X-Webhook-Signature`에 Raw HMAC 비교
- 실패 시: `401` 반환

## 4. 리스크 엔진
- 창:
  - 소량: 60초
  - 중간: 300초(기본)
- 계산 항목:
  - 최근 1분/5분 요청 수
  - 실패율
  - 5분간 API 다중 사용
  - 금액 합계(평균치 기반 스파이크)
- 점수 기반 등급:
  - `NORMAL` / `WARN` / `SUSPECT` / `CRITICAL`
- 반영 동작:
  - `risk_scores` 저장
  - 임계 시 `risk_alerts` 생성/업데이트
  - Kafka로 `risk_score`, `risk_alert` 발행

## 5. 환경변수
- `APIX_ADMIN_PORT`: 서버 포트
- `APIX_ADMIN_DATABASE_URL`: DB 연결 문자열(없으면 degraded 모드)
- `APIX_ADMIN_KAFKA_BROKERS`: `broker1,broker2`
- `APIX_ADMIN_KAFKA_ENABLED`, `APIX_ADMIN_KAFKA_TIMEOUT_MS`
- `APIX_ADMIN_WEBHOOK_SECRET`, `APIX_ADMIN_WEBHOOK_VERIFY`, `APIX_ADMIN_WEBHOOK_SIGNATURE_HEADER`
- `APIX_ADMIN_WEBHOOK_REPLAY_SKEW_SEC`
- `APIX_ADMIN_API_KEYS`, `APIX_ADMIN_API_KEY_HEADER`
- `APIX_ADMIN_TOPIC_*`, `APIX_ADMIN_RISK_WINDOW_*`, `APIX_ADMIN_RULE_VERSION`

## 6. 의도된 실패 처리
- DB가 없거나 스키마 미준비:
  - health = DEGRADED
  - 조회 API는 빈 값/기본값 반환
  - 이벤트 수신은 DB 미존재 시에도 수신 성공 처리
- Kafka 비가용:
  - 비즈니스 로직은 계속 처리
  - 발행은 무시
