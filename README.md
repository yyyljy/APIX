# APIX

**APIX turns APIs into paid digital products in minutes, not months.**

**Deployment**
- Avalanche Testnet (AvaCloud): [explorer-test.avax.network/apix](https://explorer-test.avax.network/apix)
- Demo deployment : [unloc.kr](https://unloc.kr)

## TL;DR

- **APIX is a payment middleware for APIs**, built for AI agents and API providers.
- **Pay-per-call monetization** is enforced with **Avalanche L1** using an **x402-style flow**.
- **Fast for users, trustable for providers**: quick sessions, on-chain verification, and safe rollback when a request fails.
- **Proposal planned**: We will submit ACP-402, a BJWT + ENTITLEMENT-TOKEN quota-access proposal (post-payment entitlement token) as part of the production hardening package: [apiX-402-bjwt-entitlement-token-proposal.md](/home/jylee/omx/APIX/docs/proposals/apiX-402-bjwt-entitlement-token-proposal.md).

## Why teams choose APIX

- **Monetize immediately**: Add payment gating to any API endpoint with minimal middleware changes.
- **No account churn**: APIx is built for machine-to-machine flows and AI-native integrations.
- **Fair payment logic**: `200 OK` commits usage; failed responses roll back quota (`No Data, No Pay`).
- **Single architecture**: One SDK, one protocol pattern, and one dashboard-ready session flow.

## How it works (simple view)

1. Client hits a protected endpoint.
2. APIX returns `402 Payment Required`.
3. Client submits payment on Avalanche network.
4. Client retries with a payment proof (`tx hash`).
5. SDK verifies on-chain, issues a short session token, and request is served.

This gives you the speed of API-first design with verifiable crypto settlement.

## What is inside APIX

- `apix-sdk-node/`  
  Runtime SDK for verification, quota/session checks, and standardized payment challenge responses.
- `demo/backend/`  
  API sidecar reference implementation (`/health`, `/metrics`, protected routes).
- `demo/frontend/`  
  React + Vite UI showing the payment flow end-to-end.
- `execution/`  
  Scripts to run/build the demo quickly.

## Run locally in minutes

### Option 1: All-in-one

```bash
python execution/run_demo.py --verification-rpc-file /path/to/secure-verification-rpc.txt
# or for env-based setups:
# APIX_VERIFICATION_RPC_URL=https://your-rpc-endpoint python execution/run_demo.py
#
# Demo backend can also get the provider token for API-key style tenancy controls:
# APIX_PROVIDER_TOKEN=company-a-token python execution/run_demo.py
```

Starts backend (`http://localhost:3000`) and frontend, with readiness checks.

For remote hosts (bind frontend publicly), add:

```bash
python execution/run_demo.py \
  --backend-host 0.0.0.0 \
  --frontend-host 0.0.0.0 \
  --api-base-url http://PUBLIC_IP:3000 \
  --verification-rpc-file /path/to/secure-verification-rpc.txt
```

If browser and API are on different hosts (or behind a domain), set `--api-base-url` explicitly and configure `APIX_ALLOWED_ORIGINS` to the frontend origin.

### Fast local verify

```bash
cp demo/backend/.env.example demo/backend/.env
cp demo/frontend/.env.example demo/frontend/.env

# 1) Set verification RPC and provider token (backend-only)
sed -i '' -e 's#^APIX_VERIFICATION_RPC_URL=.*#APIX_VERIFICATION_RPC_URL=https://subnets.avax.network/apix/testnet/rpc#' demo/backend/.env
sed -i '' -e 's#^APIX_PROVIDER_TOKEN=.*#APIX_PROVIDER_TOKEN=provider-token-placeholder#' demo/backend/.env

# 2) Set public RPC (frontend)
sed -i '' -e 's#^VITE_AVALANCHE_RPC_URL=.*#VITE_AVALANCHE_RPC_URL=https://api.avax.network/ext/bc/C/rpc#' demo/frontend/.env

python execution/run_demo.py
```

If your shell doesn't support `sed -i ''` (Linux/Git Bash), use normal `sed -i`.

### Option 2: Step-by-step

```bash
cd apix-sdk-node
npm install
npm run build

cd ../demo/backend
cp .env.example .env
npm install
npm run start:compiled

cd ../demo/frontend
cp .env.example .env
npm install
npm run dev
```

## Error handling and visibility

- Standard response fields include `code`, `message`, `retryable`, and `request_id`.
- `X-Request-ID` enables easy frontend ↔ backend traceability.
- Logs are structured with `request_id`, `status`, `outcome`, and `latency_ms`.

## Current MVP limits

- On-chain verification is required (`APIX_VERIFICATION_RPC_URL`).
- Session persistence defaults to local file storage.
- `/metrics` is secured by Bearer token; production mode disables wildcard CORS.

## Future roadmap

- Shared distributed session storage for multi-instance deployment.
- Expanded protocol compatibility (`L402`-style flow while maintaining current headers).
- Deeper observability: latency budgets, rollback ratio, and failure reason analytics.
