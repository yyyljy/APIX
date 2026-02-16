# APIX

APIX is a proof-of-concept for **pay-per-request API access** that compares:
- Traditional Web2 payment flow (Stripe-like session token)
- Web3 payment flow (x402/L402-style challenge + on-chain proof)

The goal is to show that both payment rails can unlock the **same premium API resource**, while using different authentication and settlement logic.

## What This Project Is Trying To Build

You are building a marketplace-style API access model where:
1. A client requests a protected resource.
2. The server can respond with `402 Payment Required` and payment instructions.
3. The client pays and submits proof.
4. The backend verifies proof, issues a short-lived session token, and enforces request quota.

In short: **"Payment as API authentication"** for Web3-native usage, with a direct comparison to standard Web2 payment middleware.

## Repository Structure

- `apix-cloud/`
  - Go facilitator service.
  - Verifies transaction hash (mock mode or RPC mode) and issues JWT.
  - Main endpoint: `POST /v1/verify`

- `apix-sdk-node/`
  - Node SDK used by backend services.
  - Responsibilities:
    - Verify payment via Apix Cloud
    - Validate session JWT
    - Track/consume per-session quota
    - Produce standardized `402` payment challenge response (`WWW-Authenticate`, `PAYMENT-REQUIRED`)

- `demo/backend/`
  - Express demo server exposing two protected endpoints:
    - `/stripe-product` (traditional token auth flow)
    - `/apix-product` (x402-like payment challenge flow)
  - Ops endpoints:
    - `/health` (liveness/status)
    - `/metrics` (in-memory request/error/latency stats)
  - Uses local `apix-sdk-node` package.

- `demo/frontend/`
  - React + Vite demo UI.
  - Shows side-by-side purchase flows:
    - Mock Stripe modal flow
    - Apix crypto payment flow (402 -> mock tx hash -> verification)

- `execution/`
  - Python scripts to orchestrate common tasks:
    - `run_demo.py`: start cloud + backend + frontend
    - `build_sdk.py`: install/build SDK

- `directives/`, `docs/`
  - SOP and planning/analysis documentation for project decisions and roadmap.

## End-to-End Flow (Apix)

1. Client calls protected endpoint without proof.
2. Backend returns `402 Payment Required` with payment metadata.
3. Client performs payment (mocked wallet interaction in demo) and obtains tx hash.
4. Client retries request with payment proof (`PAYMENT-SIGNATURE` and/or `Authorization: Apix <txHash>`).
5. SDK asks Apix Cloud to verify tx hash.
6. Cloud returns signed JWT session token.
7. Cloud enforces idempotency (`request_id + tx_hash`) and replay protection for reused tx hash.
8. SDK caches session, validates expiry/quota, and applies atomic deduction logic.
9. Protected resource is returned with proof token.

## Error Envelope

Cloud and backend error responses expose shared machine-readable fields:

- `code`
- `message`
- `retryable`
- `request_id`

Backend responses additionally include an `error` summary string for UI-friendly handling.

Use `X-Request-ID` to correlate logs between client, backend, and cloud during troubleshooting.
Cloud and backend emit structured JSON logs with `request_id`, `status`, `code`, `outcome`, and `latency_ms`.

## Why This Matters

This POC validates a key product thesis:
- APIs can be monetized per request without user accounts/subscriptions.
- Payment proof can become a reusable auth primitive.
- Developers can integrate this via middleware with minimal business logic change.

## Local Run

### Prerequisites
- Go (compatible with `go 1.23.x` in `apix-cloud/go.mod`)
- Node.js + npm
- Python 3

Optional (for `execution/verification_test.py`):
```bash
pip install -r execution/requirements.txt
```

### Option A: Run all services with orchestrator

```bash
python execution/run_demo.py --mock-verify
```

This starts:
- Apix Cloud on `http://localhost:8080`
- Demo backend on `http://localhost:3000`
- Demo frontend (Vite dev server)
- Readiness checks on each service before reporting success.

For real RPC verification (non-mock), provide an RPC URL:

```bash
python execution/run_demo.py --rpc-url https://your-rpc-endpoint
```

### Option B: Run manually

1. Cloud
```bash
cd apix-cloud
# optional: copy .env.example to .env and edit values
set APIX_JWT_SECRET=change-this-secret
set APIX_ENABLE_MOCK_VERIFY=true
set APIX_VERIFICATION_STORE_PATH=.tmp/apix-verification-store.json
set APIX_ALLOWED_ORIGINS=http://localhost:5173
go run main.go
```

2. SDK build (if needed)
```bash
cd apix-sdk-node
npm install
npm run build
```

3. Backend
```bash
cd demo/backend
# optional: copy .env.example to .env and edit values
set APIX_JWT_SECRET=change-this-secret
set APIX_FACILITATOR_URL=http://localhost:8080
set APIX_SESSION_STORE_PATH=.tmp/apix-session-store.json
set APIX_USE_CLOUD_SESSION_STATE=true
set APIX_SESSION_AUTHORITY_URL=http://localhost:8080
# recommended: set explicit metrics token for stable access control
set APIX_METRICS_TOKEN=<strong-random-token>
npm install
npm start
```

4. Frontend
```bash
cd demo/frontend
# optional: copy .env.example to .env and edit values
set VITE_API_BASE_URL=http://localhost:3000
npm install
npm run dev
```

## Current MVP Constraints

- Orchestrator defaults to real verification mode and requires `--rpc-url`; mock mode is explicit via `--mock-verify`.
- Quota/session and verification state can be persisted to local files for single-instance durability.
- Multi-instance deployments require a shared, lock-safe verification store path (`APIX_VERIFICATION_STORE_PATH`) across cloud replicas.
- In `APIX_ENV=production`, mock verification and wildcard CORS are rejected at startup.
- In `APIX_ENV=production`, backend session state must use Cloud authority (`APIX_USE_CLOUD_SESSION_STATE=true`).
- `/metrics` always requires Bearer auth; if `APIX_METRICS_TOKEN` is missing/placeholder, backend auto-generates an ephemeral token for that process.

## Next Product Steps

1. Replace mock tx validation with real chain RPC/indexer verification.
2. Externalize secrets and add key rotation.
3. Move session/quota tracking to Redis or durable store.
4. Add robust failure semantics for commit/rollback and idempotency.
5. Define protocol-level compatibility for x402/L402 clients.
