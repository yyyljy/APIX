# APIX L1 Admin API Technical Specification (Gin / Go)

## 1. Components
- `cmd/adminapi/main.go`
  - Builds operational API wiring from environment variables
  - Registers API key middleware (`/v1/*`)
  - Injects Kafka Publisher + AdminService
- `internal/adminapi`
  - `handlers.go`: route/parameter parsing and responses
  - `security_middleware.go`: authentication via `X-API-KEY` or configured header
  - `service.go`: DB / Kafka / risk engine business logic
  - `kafka_publisher.go`: kafka-go publisher wrapper

## 2. API Contract
### GET `/v1/health`
- Response
  - `status`: UP / DEGRADED
  - `chain_id`: 402
  - `kafka_healthy`, `lag_ms`, etc.

### GET `/v1/events`
- Query: `wallet`, `event_type`, `api_id`, `status`, `from`, `to`, `page`, `size`
- Sort: `created_at DESC`
- Response: `EventListResponse`

### GET `/v1/risk/alerts`
- Query: `wallet`, `grade`, `status`, `page`, `size`
- Response: `RiskAlertListResponse`

### GET `/v1/risk/score/{wallet}`
- Response: `RiskScoreResponse` (`risk_score`, `risk_grade`, `signals`)

### POST `/v1/risk/alerts/{alert_id}/ack`
- Body: `status`, `note`, `assigned_to`
- Allowed states: `ACKNOWLEDGED`, `INVESTIGATING`, `RESOLVED`

### GET `/v1/ops/lag`
- Operational monitoring metrics

### POST `/v1/ops/replay`
- Body: `from_block`, `to_block`, `reason`
- Register replay job into execution queue

### POST `/v1/ops/rules/reload`
- Body: `dry_run`, `force`

### POST `/webhooks/apix-l1`
- Body: `WebhookEnvelope` (`event_id`, `event_type`, `source`, `payload`)
- Default signature header: `X-Webhook-Signature`
- After validation, persist raw payload -> publish to Kafka `raw topic` -> async risk re-evaluation

## 3. Webhook validation
- Signature mode A: `v1`/`sha256` plus `t` tuple (`t=...`, `v1=...`)
- Signature payload: `"{timestamp}.{raw_body}"`
  - Compare `HMAC-SHA256(secret, payload)`
  - Replay acceptance default: 300 seconds
- Signature mode B: legacy `X-Webhook-Signature` with raw HMAC comparison
- On failure: return `401`

## 4. Risk engine
- Window:
  - Short: 60 seconds
  - Mid: 300 seconds (default)
- Calculations:
  - Request volume in last 1m/5m
  - Failure rate
  - Wallet usage across APIs in 5 minutes
  - Amount sum spike versus baseline
- Score-based grades:
  - `NORMAL` / `WARN` / `SUSPECT` / `CRITICAL`
- Processing actions:
  - Persist `risk_scores`
  - Create/update `risk_alerts` when threshold reached
  - Publish `risk_score`, `risk_alert` via Kafka

## 5. Environment variables
- `APIX_ADMIN_PORT`: server port
- `APIX_ADMIN_DATABASE_URL`: DB connection string (degraded mode when absent)
- `APIX_ADMIN_KAFKA_BROKERS`: `broker1,broker2`
- `APIX_ADMIN_KAFKA_ENABLED`, `APIX_ADMIN_KAFKA_TIMEOUT_MS`
- `APIX_ADMIN_WEBHOOK_SECRET`, `APIX_ADMIN_WEBHOOK_VERIFY`, `APIX_ADMIN_WEBHOOK_SIGNATURE_HEADER`
- `APIX_ADMIN_WEBHOOK_REPLAY_SKEW_SEC`
- `APIX_ADMIN_API_KEYS`, `APIX_ADMIN_API_KEY_HEADER`
- `APIX_ADMIN_TOPIC_*`, `APIX_ADMIN_RISK_WINDOW_*`, `APIX_ADMIN_RULE_VERSION`

## 6. Intended failure behavior
- DB missing or schema unavailable:
  - `health` = DEGRADED
  - Query APIs return empty/default responses
  - Incoming events are accepted even if DB is absent
- Kafka unavailable:
  - Business logic continues
  - Publishing is skipped
