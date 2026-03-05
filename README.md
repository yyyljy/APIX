# APIX

APIX is a **Decentralized Payment Middleware SDK** acting as a "Stripe for AI Agents." It enables any API provider to monetize their data smoothly over the **Avalanche L1** using the **x402 protocol**.

The project merges the **speed of Web2** with the **trust of Web3** to provide:
- **For Sellers:** Monetize any API with just 3 lines of code. No platform lock-in.
- **For Buyers (AI Agents):** Millisecond-latency access to global data without KYC or credit cards.

## Core Concept: Verifiable Atomic Session (VAS)

To solve the friction between blockchain latency and high-frequency API performance, APIX introduces the **Verifiable Atomic Session (VAS)**:

1. **Fast Entry (Performance) - On-chain Verification:** The SDK verifies payment tx hash directly on Avalanche L1 and caches a short-lived session JWT to process subsequent requests with low latency.
2. **Safe Exit (Trust) - Conditional Deduction:** Buyers pay upfront, but the session quota is only committed on a successful HTTP 200 OK response. If the server fails (e.g., 500), the quota rolls back, guaranteeing a "No Data, No Pay" atomic escrow.

## Architecture: "SDK + L1 (3단계)"

- **Apix SDK**: A thin traffic interceptor and policy enforcer installed on the seller's server (Node.js/Go/Python).
- **Apix SDK**: Directly validates tx hash against Avalanche L1 RPC and issues session JWT.
- **Smart Contracts**: Handles settlement and on-chain event logging on Avalanche L1 (`ApixPaymentRouter`).

## Repository Structure

- `apix-sdk-node/`
  - Node SDK used by backend services.
  - Responsibilities:
    - Verify payment via direct L1 RPC
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
    - `run_demo.py`: start backend + frontend
    - `build_sdk.py`: install/build SDK

- `directives/`, `docs/`
  - SOP and planning/analysis documentation for project decisions and roadmap.

## End-to-End Flow (Apix)

1. Client calls protected endpoint without proof.
2. Backend returns `402 Payment Required` with standard HTTP headers (`WWW-Authenticate: Apix realm="Apix Protected", request_id="<uuid>", ...`).
3. Client performs payment (mocked wallet interaction in demo) and obtains tx hash.
4. Client retries request with payment proof via header (`Authorization: Apix <tx_hash>`).
5. SDK verifies the tx hash directly on L1 and issues signed session token with idempotency/replay checks.
6. SDK validates expiry/quota, and marks session as `PENDING`.
7. Protected resource is returned. If successful (200 OK), quota is visually committed; if failed (5xx), quota safely rolls back.

## Error Envelope

Backend error responses expose shared machine-readable fields:

- `code`
- `message`
- `retryable`
- `request_id`

Backend responses additionally include an `error` summary string for UI-friendly handling.

Use `X-Request-ID` to correlate logs between client and backend during troubleshooting.
Backend emits structured JSON logs with `request_id`, `status`, `code`, `outcome`, and `latency_ms`.

## Why This Matters

This POC validates a key product thesis:
- APIs can be monetized per request without user accounts/subscriptions.
- Payment proof can become a reusable auth primitive.
- Developers can integrate this via middleware with minimal business logic change.

## Local Run

### Prerequisites
- Node.js + npm
- Python 3

Optional (for `execution/verification_test.py`):
```bash
pip install -r execution/requirements.txt
```

### Option A: Run all services with orchestrator

```bash
python execution/run_demo.py --rpc-url https://your-rpc-endpoint
```

This starts:
- Demo backend on `http://localhost:3000`
- Demo frontend (Vite dev server)
- Readiness checks on each service before reporting success.

Defaults now point to Avalanche C-Chain (`chain_id: 43114`, `network: eip155:43114`) in project env templates.

### Option B: Run manually

1. SDK build (if needed)
```bash
cd apix-sdk-node
npm install
npm run build
```

2. Backend
```bash
cd demo/backend
# optional: copy .env.example to .env and edit values
set APIX_JWT_SECRET=change-this-secret
set APIX_RPC_URL=https://your-rpc-endpoint
set APIX_SESSION_STORE_PATH=.tmp/apix-session-store.json
set APIX_CHAIN_ID=43114
set APIX_NETWORK=eip155:43114
# recommended: set explicit metrics token for stable access control
set APIX_METRICS_TOKEN=<strong-random-token>
npm install
npm start
```

3. Frontend
```bash
cd demo/frontend
# optional: copy .env.example to .env and edit values
set VITE_API_BASE_URL=http://localhost:3000
set VITE_AVALANCHE_CHAIN_ID=43114
set VITE_AVALANCHE_NETWORK_NAME=Avalanche C-Chain
set VITE_AVALANCHE_RPC_URL=https://api.avax.network/ext/bc/C/rpc
set VITE_AVALANCHE_BLOCK_EXPLORER=https://snowtrace.io
npm install
npm run dev
```

## Current MVP Constraints

- Orchestrator requires `--rpc-url` (or `APIX_RPC_URL`) because verification is always direct on L1.
- Quota/session and verification state are persisted to local files for single-instance durability.
- Multi-instance deployments require a shared, lock-safe session store path (`APIX_SESSION_STORE_PATH`).
- In `APIX_ENV=production`, wildcard CORS is rejected at startup.
- `/metrics` always requires Bearer auth; if `APIX_METRICS_TOKEN` is missing/placeholder, backend auto-generates an ephemeral token for that process.

## Next Product Steps

1. **Quota Safety Hardening:** Keep strict rollback/commit boundaries and add explicit middleware timeout/retry contract between SDK and upstream handlers.
2. **Environment Separation:** Finalize secure multi-instance session storage (Redis) and restrict CORS/policies based on dev/prod environments (`APIX_ALLOWED_ORIGINS`).
3. **Protocol Extension:** Add `L402`-style token credential path while preserving current `Authorization/PAYMENT-*` compatibility.
4. **Observability:** Centralize structured logging and metric reporting (latency, failure reasons, rollback ratio) via unified correlation IDs and standardized request IDs.
