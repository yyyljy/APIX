# Apix Pivot Task Checklist

Based on `docs/003.pivot/plan.md`, this checklist outlines the concrete steps required to pivot Apix into a Middleware SDK.
Status (2026-02-21): Updated against current code state.

## Phase 1: Delegated Verification (Weeks 1-2)
*Goal: Remove blockchain latency for API access.*

- [x] **SDK Core Setup**
    - [x] Initialize `apix-sdk-node` project (TypeScript/Node.js).
    - [x] Define `ApixMiddleware` class structure.
    - [ ] Implement explicit `init(config)` bootstrap API (constructor-based bootstrap is currently used).
- [x] **Apix Cloud (Facilitator) Mock**
    - [x] Create a simple `Apix Cloud` server in Go.
    - [x] Implement `POST /v1/verify` endpoint.
    - [x] Replace tx-hash stubbing with real or hybrid verifier pipeline (RPC-first with optional mock mode).
- [ ] **Delegated Verification Core**
    - [x] Implement `verifyPayment(tx_hash)` in SDK.
    - [x] Make HTTP request from SDK to Apix Cloud.
    - [x] Handle verification response and errors.

## Phase 2: Session Caching & Engine (Weeks 3-4)
*Goal: Enable millisecond-level repeated access.*

- [ ] **JWT Implementation**
    - [x] Apix Cloud: Issue signed JWTs upon successful `verify`.
    - [ ] SDK: Implement explicit `verifyJWT(token)` API using public-key verification (current implementation uses shared secret verification).
- [x] **In-Memory Caching**
    - [x] Integrate a caching layer in SDK (`Map` for MVP, optional persistent file store).
    - [x] Store active JWTs with quota/expiry.
    - [x] Implement "Fast Path" to bypass Cloud check if valid JWT exists.
- [x] **Atomic Deduction Logic**
    - [x] Implement per-request quota tracking in SDK cache.
    - [x] Create middleware hook to monitor HTTP status codes.
    - [x] **Commit Logic:** If 200 OK -> commit consumption.
    - [x] **Rollback Logic:** If non-2xx -> rollback pending deduction.

## Phase 3: L1 Integration & Security (Weeks 5-6)
*Goal: Connect to real Avalanche L1 and secure the system.*

- [ ] **Smart Contract (Avalanche C-Chain)**
    - [ ] Deploy `ApixPaymentRouter` to Testnet.
    - [ ] Define events: `PaymentDeposited(bytes32 indexed txHash, uint256 amount)`.
- [x] **Real Verification Logic**
    - [ ] Apix Cloud: Listen to `ApixPaymentRouter` events via RPC/WebSocket (polling path is operational).
    - [x] Update `verify` endpoint to check on-chain data (recipient/amount/confirmations and request metadata).
- [ ] **Security Hardening**
    - [x] **Replay Protection:** Add `request_id` + `tx_hash` anti-replay controls.
    - [ ] **Signatures:** Implement EIP-712 signing for response bodies.
- [ ] **Integration Testing**
    - [ ] End-to-End flow: Pay AVAX -> Get Hash -> Call API -> Verify Cache -> Get Data.

## Phase 4: Documentation & Polish
- [x] Write `README.md` for SDK quick start.
- [ ] Create an example "Seller Server" (simple Express app using the Middleware).
- [ ] Create an example "Buyer Script" (ethers.js script to pay and call API).

## Phase 0: Protocol Parity Sprint (P0, 2 Weeks)
*Goal: Close the minimum credibility gap vs. production x402 services before broader feature work.*

- [x] **Header Compatibility Layer (`PAYMENT-*`)**
    - [x] Backend returns `PAYMENT-REQUIRED` header in 402 responses in addition to existing fields.
    - [x] Backend accepts `PAYMENT-SIGNATURE` flow while preserving current `Authorization: Apix ...` fallback.
    - [ ] Define and document canonical header parsing/validation order.
    - [ ] Add compatibility tests: legacy Apix header, mixed header, and standard header cases.
- [x] **Real On-Chain Verification (Single Chain MVP)**
    - [x] Replace mock verifier path with real RPC verification.
    - [x] Validate recipient, amount, and confirmation depth against request metadata.
    - [x] Add timeout/retry policy for RPC failures and map to stable error codes.
    - [ ] Add integration tests for success, underpayment, wrong recipient, and unconfirmed tx.
- [x] **Secret Management & Key Rotation Baseline**
    - [x] Move JWT secret from source code to environment variables.
    - [ ] Add startup guard: fail fast when required secrets are missing (runtime-level hardening still evolving).
    - [x] Implement key versioning field (`kid`) in JWT header claims.
    - [ ] Document local/dev/prod secret provisioning.
- [x] **Protocol-Native Network Identity**
    - [x] Introduce CAIP-2-style network identifier in payment request metadata.
    - [x] Normalize chain config handling (network id, native token, decimals).
    - [x] Add validation to prevent network mismatch replay attempts.
- [x] **Definition of Done (P0 Exit Criteria)**
    - [x] 402 challenge is consumable by both APIX legacy and PAYMENT-* compatible clients.
    - [ ] Mock verification path is removed from default runtime (still available as opt-in mode).
    - [x] Security review confirms no hardcoded signing secrets in active runtime.
    - [x] Demo flow still passes end-to-end with backward compatibility enabled.
