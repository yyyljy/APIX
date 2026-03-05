# APIX L1 Operations Admin API Plan (adminapi, Gin)

## 1. Objectives
- Keep backend and operational runtime independent of mutable state, while Admin API only handles operations, audit, and risk-related functions.
- Receive events from AvaCloud/node/WS via webhook and RPC, and provide visibility, traceability, and anomaly detection through DB + Kafka.
- SDK continues to handle TX creation/validation on L1 with SDK logic, while the operations API focuses only on server operations such as event collection, risk-score lookup/alerts, and replay triggers.

## 2. Scope
- Target API: new server `cmd/adminapi` (`/v1/...`)
- Storage: PostgreSQL (optional, degraded mode when not installed)
- Messaging: Kafka topic publishing (optional, degraded mode when not installed)
- Alerting/detection: rule-based risk score calculation using API frequency, failure rate, and multi-use API signals

## 3. User scenarios
1. Operator (web / operations console) views recent L1 events via `GET /v1/events`.
2. Operator checks wallet-specific score via `GET /v1/risk/score/{wallet}`.
3. When suspicious wallet activity is detected, operator reads alert list via `GET /v1/risk/alerts` and acknowledges with `POST /v1/risk/alerts/{id}/ack`.
4. Webhook provider/node sends event to `/webhooks/apix-l1` -> validation -> persistence -> risk update.
5. In environments without DB/schema, system status becomes degraded; core APIs return safe defaults (empty list/default values).

## 4. Non-functional requirements
- Security: API key authentication for `/v1` routes (operator key).
- Webhook integrity: signature verification (HMAC-SHA256) + bounded timestamp skew.
- Fault tolerance: maintain minimum API functionality in degraded mode when DB/Kafka are unavailable.
- Observability: propagate request trace IDs; publish persisted events to Kafka.

## 5. API and operational requirements
- `GET /v1/health`: reports system health, Kafka connectivity, and chain ID (402)
- `GET /v1/events`: wallet/type/status/time-window based paginated search
- `GET /v1/risk/alerts`: list anomaly alerts
- `GET /v1/risk/score/{wallet}`: latest risk score for wallet
- `POST /v1/risk/alerts/{alert_id}/ack`: update alert status/assignee/note
- `GET /v1/ops/lag`: block/mismatch lag metrics
- `POST /v1/ops/replay`: register replay job
- `POST /v1/ops/rules/reload`: reload detection rules
- `POST /webhooks/apix-l1`: receive webhook events

## 6. Milestones
1. Phase 1: authentication, health, event list, webhook verification, and raw persistence
2. Phase 2: risk score API, alert ack/reload/lag/replay
3. Phase 3: production integration (ops tables/topics/dashboard)
