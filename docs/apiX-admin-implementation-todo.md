# APIX Admin API TODO (PostgreSQL + Kafka Integration)

Status code legend: `1=Done`, `2=In progress`, `3=Backlog`

## 1. DB migration
- [3] Create PostgreSQL connection account and grants
- [3] Apply DDL (`docs/apiX-admin-postgresql-ddl.sql`)
- [3] Verify service schema
  - [3] Validate indices and constraints for `l1_events_raw`
  - [3] Validate indices and constraints for `l1_events_normalized`
  - [3] Confirm creation of `risk_alerts`, `risk_scores`, `webhook_mismatch`, `replay_jobs`
- [3] Decide on partitioning/retention strategy (optional)
  - [3] Set retention rules for raw/normalized events
  - [3] Add cleanup policy for aged risk scores/alerts

## 2. adminapi server environment variables
- [3] Inject `.env` or deployment environment variables
- [3] Set `APIX_ADMIN_DATABASE_URL`
- [3] Set `APIX_ADMIN_KAFKA_BROKERS`
- [3] Set `APIX_ADMIN_KAFKA_ENABLED`
- [3] Set `APIX_ADMIN_WEBHOOK_SECRET`
- [3] Set `APIX_ADMIN_WEBHOOK_VERIFY` policy (`true/false`)
- [3] Set `APIX_ADMIN_WEBHOOK_SIGNATURE_HEADER` (default: `X-Webhook-Signature`)
- [3] Set `APIX_ADMIN_API_KEYS`, `APIX_ADMIN_API_KEY_HEADER`
- [3] Validate topic names `APIX_ADMIN_TOPIC_*`

## 3. Kafka topics/operations
- [3] Create topics
  - [3] `apix.l1.events.raw.v1`
  - [3] `apix.l1.events.normalized.v1`
  - [3] `apix.risk.score.v1`
  - [3] `apix.risk.alert.v1`
  - [3] `apix.l1.events.mismatch.v1`
  - [3] `apix.l1.events.deadletter.v1`
- [3] Design consumer/reconciliation pipeline
  - [3] Connect raw -> normalized transformer
  - [3] Monitor risk score/alert consumers

## 4. Webhook operations checks
- [3] Register AvaCloud Webhook URL
  - [3] Confirm route binding for `POST /webhooks/apix-l1`
- [3] Finalize HMAC signature policy
  - [3] Document key/header rules
  - [3] Validate timestamp skew
- [3] Verify replay and dedup behavior
  - [3] Validate `dedupe_key`
  - [3] Reproduce delayed/duplicate requests

## 5. Operations API validation
- [3] Authentication / authorization
  - [3] Ensure `/v1/*` requires API key
  - [3] Verify unauthenticated calls return `401`
- [3] Health checks
  - [3] Validate `/v1/health` response and `DEGRADED` transition rules
- [3] Query APIs
  - [3] Validate `/v1/events` filter and pagination
  - [3] Validate `/v1/risk/alerts` filter/sorting
  - [3] Validate `/v1/risk/score/{wallet}` normal and missing-wallet cases
- [3] Ops APIs
  - [3] Validate `/v1/ops/replay`
  - [3] Validate `/v1/ops/lag` metrics
  - [3] Validate `/v1/risk/alerts/{id}/ack` state update
  - [3] Validate `/v1/ops/rules/reload` policy refresh

## 6. Reliability / operations hardening
- [3] Handle DB mismatch or missing configuration
  - [3] Validate `DEGRADED` + fallback output when DB is unavailable
- [3] Handle missing Kafka/producer failures
  - [3] Apply publish failure logs and alert policy
- [3] Logging/monitoring
  - [3] Build dashboard for event ingestion rate, webhook mismatch count, and risk-alert trend
