# APIX

APIX is a **Decentralized Payment Middleware SDK** acting as a "Stripe for AI Agents." It enables any API provider to monetize their data smoothly over the **Avalanche L1** using the **x402 protocol**.

The project merges the **speed of Web2** with the **trust of Web3** to provide:
- **For Sellers:** Monetize any API with just 3 lines of code. No platform lock-in.
- **For Buyers (AI Agents):** Millisecond-latency access to global data without KYC or credit cards.

## Core Concept: Verifiable Atomic Session (VAS)

To solve the friction between blockchain latency and high-frequency API performance, APIX introduces the **Verifiable Atomic Session (VAS)**:

1. **Fast Entry (Performance) - Delegated Verification:** The SDK delegates blockchain verification to a stateless intermediary (Apix Cloud). Once verified, the SDK caches a short-lived session JWT to process subsequent requests with microsecond latency.
2. **Safe Exit (Trust) - Conditional Deduction:** Buyers pay upfront, but the session quota is only committed on a successful HTTP 200 OK response. If the server fails (e.g., 500), the quota rolls back, guaranteeing a "No Data, No Pay" atomic escrow.

## Architecture: "Thin SDK, Fat Cloud"

- **Apix SDK**: A thin traffic interceptor and policy enforcer installed on the seller's server (Node.js/Go/Python).
- **Apix Cloud**: A stateless validator that handles blockchain interaction, manages nonces, and prevents replay attacks (Go).
- **Smart Contracts**: Handles settlement and on-chain event logging on Avalanche L1 (`ApixPaymentRouter`).

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
2. Backend returns `402 Payment Required` with standard HTTP headers (`WWW-Authenticate: Apix realm="Apix Protected", request_id="<uuid>", ...`).
3. Client performs payment (mocked wallet interaction in demo) and obtains tx hash.
4. Client retries request with payment proof via header (`Authorization: Apix <tx_hash>`).
5. SDK delegates verification by asking Apix Cloud to verify the tx hash.
6. Cloud returns signed JWT session token and enforces idempotency (`request_id + tx_hash`) and replay protection.
7. SDK caches session, validates expiry/quota, and marks session as `PENDING`.
8. Protected resource is returned. If successful (200 OK), quota is visually committed; if failed (5xx), quota safely rolls back.

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

1. **Robust Quota Safety:** Enforce strict rollback/commit states internally in SDK to properly handle aborted or 5xx requests.
2. **Environment Separation:** Finalize secure multi-instance session storage (Redis) and restrict CORS/policies based on dev/prod environments (`APIX_ALLOWED_ORIGINS`).
3. **Production Verification:** Replace mock tx validation with real chain RPC/indexer verification for mainnet usage.
4. **Observability:** Centralize structured logging and metric reporting (latency, failure reasons) via unified correlation IDs.
