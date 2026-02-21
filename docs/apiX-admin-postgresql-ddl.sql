-- APIX Admin API / PostgreSQL schema (current service 기준)
-- - Service target: apix-cloud/internal/adminapi/service.go
-- - Engine: PostgreSQL

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS l1_events_raw (
    id BIGSERIAL PRIMARY KEY,
    dedupe_key TEXT NOT NULL,
    chain_id BIGINT NOT NULL,
    block_number BIGINT NOT NULL DEFAULT 0,
    block_hash TEXT,
    tx_hash TEXT NOT NULL DEFAULT '',
    log_index BIGINT NOT NULL DEFAULT 0,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    source TEXT NOT NULL DEFAULT 'webhook',
    status TEXT NOT NULL DEFAULT 'RECEIVED',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_l1_events_raw_dedupe_key UNIQUE (dedupe_key)
);

CREATE INDEX IF NOT EXISTS idx_l1_events_raw_created_at
    ON l1_events_raw (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_l1_events_raw_tx_hash
    ON l1_events_raw (tx_hash);
CREATE INDEX IF NOT EXISTS idx_l1_events_raw_wallet
    ON l1_events_raw ((payload ->> 'wallet'));
CREATE INDEX IF NOT EXISTS idx_l1_events_raw_status
    ON l1_events_raw ((payload ->> 'status'));
CREATE INDEX IF NOT EXISTS idx_l1_events_raw_api_id
    ON l1_events_raw ((payload ->> 'api_id'));
CREATE INDEX IF NOT EXISTS idx_l1_events_raw_payload_gin
    ON l1_events_raw USING GIN (payload);

CREATE TABLE IF NOT EXISTS l1_events_normalized (
    id BIGSERIAL PRIMARY KEY,
    event_id TEXT NOT NULL,
    dedupe_key TEXT,
    chain_id BIGINT NOT NULL,
    block_number BIGINT NOT NULL DEFAULT 0,
    block_hash TEXT,
    tx_hash TEXT NOT NULL DEFAULT '',
    log_index BIGINT NOT NULL DEFAULT 0,
    contract_address TEXT NOT NULL DEFAULT '',
    event_type TEXT NOT NULL DEFAULT '',
    wallet TEXT NOT NULL DEFAULT '',
    api_id TEXT NOT NULL DEFAULT '',
    plan_id TEXT NOT NULL DEFAULT '',
    amount NUMERIC(48, 18) NOT NULL DEFAULT 0,
    token_symbol TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'RECEIVED',
    source TEXT NOT NULL DEFAULT 'websocket',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_l1_events_normalized_event_id UNIQUE (event_id),
    CONSTRAINT uq_l1_events_normalized_tx_log UNIQUE (tx_hash, log_index)
);

CREATE INDEX IF NOT EXISTS idx_l1_events_normalized_created_at
    ON l1_events_normalized (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_l1_events_normalized_block
    ON l1_events_normalized (block_number DESC);
CREATE INDEX IF NOT EXISTS idx_l1_events_normalized_wallet
    ON l1_events_normalized (wallet);
CREATE INDEX IF NOT EXISTS idx_l1_events_normalized_event_type
    ON l1_events_normalized (event_type);
CREATE INDEX IF NOT EXISTS idx_l1_events_normalized_api_id
    ON l1_events_normalized (api_id);
CREATE INDEX IF NOT EXISTS idx_l1_events_normalized_status
    ON l1_events_normalized (status);

CREATE TABLE IF NOT EXISTS risk_alerts (
    alert_id TEXT PRIMARY KEY,
    wallet TEXT NOT NULL DEFAULT '',
    risk_score DOUBLE PRECISION NOT NULL DEFAULT 0,
    risk_grade TEXT NOT NULL DEFAULT 'NORMAL',
    status TEXT NOT NULL DEFAULT 'OPEN',
    rule_ids TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    reasons TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    assigned_to TEXT,
    ttl_sec INTEGER NOT NULL DEFAULT 300
);

CREATE INDEX IF NOT EXISTS idx_risk_alerts_wallet
    ON risk_alerts (wallet);
CREATE INDEX IF NOT EXISTS idx_risk_alerts_status
    ON risk_alerts (status);

CREATE TABLE IF NOT EXISTS risk_scores (
    id BIGSERIAL PRIMARY KEY,
    wallet TEXT NOT NULL DEFAULT '',
    risk_score DOUBLE PRECISION NOT NULL DEFAULT 0,
    risk_grade TEXT NOT NULL DEFAULT 'NORMAL',
    signals JSONB NOT NULL DEFAULT '{}'::jsonb,
    window TEXT NOT NULL DEFAULT 'rolling_5m',
    ttl_sec INTEGER NOT NULL DEFAULT 300,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_risk_scores_wallet_created
    ON risk_scores (wallet, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_risk_scores_signals_gin
    ON risk_scores USING GIN (signals);

CREATE TABLE IF NOT EXISTS webhook_mismatch (
    id BIGSERIAL PRIMARY KEY,
    tx_hash TEXT NOT NULL DEFAULT '',
    webhook_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    mismatch_type TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_webhook_mismatch_tx_mismatch UNIQUE (tx_hash, mismatch_type)
);

CREATE INDEX IF NOT EXISTS idx_webhook_mismatch_created_at
    ON webhook_mismatch (created_at DESC);

CREATE TABLE IF NOT EXISTS replay_jobs (
    job_id TEXT PRIMARY KEY,
    from_block BIGINT NOT NULL DEFAULT 0,
    to_block BIGINT NOT NULL DEFAULT 0,
    reason TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'queued',
    retry_count INTEGER NOT NULL DEFAULT 0,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    CONSTRAINT ck_replay_jobs_block_range CHECK (to_block >= from_block)
);

CREATE INDEX IF NOT EXISTS idx_replay_jobs_status
    ON replay_jobs (status, created_at DESC);

COMMIT;
