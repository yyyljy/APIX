# Apix Pivot Task Checklist

Based on `docs/003.pivot/plan.md`, this checklist outlines the concrete steps required to pivot Apix into a Middleware SDK.

## Phase 1: Delegated Verification (Weeks 1-2)
*Goal: Remove blockchain latency for API access.*

- [ ] **SDK Core Setup**
    - [ ] Initialize `apix-sdk-node` project (TypeScript/Node.js).
    - [ ] Define `ApixMiddleware` class structure.
    - [ ] Implement `init(config)` method (API Key, Facilitator URL).
- [ ] **Apix Cloud (Facilitator) Mock**
    - [ ] Create a simple mock server (Golang) for `Apix Cloud`.
    - [ ] Implement `POST /v1/verify` endpoint.
    - [ ] Stub Ethers.js logic to verify `tx_hash` (initially always returns true).
- [ ] **Delegated Verification Core**
    - [ ] Implement `verifyPayment(tx_hash)` in SDK.
    - [ ] Make HTTP request from SDK to Apix Cloud Mock.
    - [ ] Handle verification response and errors.

## Phase 2: Session Caching & Engine (Weeks 3-4)
*Goal: Enable millisecond-level repeated access.*

- [ ] **JWT Implementation**
    - [ ] Apix Cloud: Issue signed JWTs upon successful `verify`.
    - [ ] SDK: Implement `verifyJWT(token)` using public key.
- [ ] **In-Memory Caching**
    - [ ] Integrate a caching layer in SDK (Map for MVP, Redis interface for Prod).
    - [ ] Store active JWTs with quota/expiry.
    - [ ] Implement "Fast Path" to bypass Cloud check if valid JWT exists.
- [ ] **Atomic Deduction Logic**
    - [ ] Implement per-request quota tracking in SDK Cache.
    - [ ] Create `ResponseInterceptor` to monitor HTTP Status Codes.
    - [ ] **Commit Logic:** If 200 OK -> Decrement Quota.
    - [ ] **Rollback Logic:** If 5xx -> Do nothing (or revert decrement).

## Phase 3: L1 Integration & Security (Weeks 5-6)
*Goal: Connect to real Avalanche L1 and secure the system.*

- [ ] **Smart Contract (Avalanche C-Chain)**
    - [ ] Deploy `ApixPaymentRouter` to Testnet.
    - [ ] Define events: `PaymentDeposited(bytes32 indexed txHash, uint256 amount)`.
- [ ] **Real Verification Logic**
    - [ ] Apix Cloud: Listen to `ApixPaymentRouter` events via RPC (WebSocket).
    - [ ] Update `verify` endpoint to check real on-chain data.
- [ ] **Security Hardening**
    - [ ] **Replay Protection:** Add `nonce` and `request_id` to verification payload.
    - [ ] **Signatures:** Implement EIP-712 signing for response bodies.
- [ ] **Integration Testing**
    - [ ] End-to-End flow: Pay AVAX -> Get Hash -> Call API -> Verify Cache -> Get Data.

## Phase 4: Documentation & Polish
- [ ] Write `README.md` for SDK quick start.
- [ ] Create an example "Seller Server" (simple Express app using the Middleware).
- [ ] Create an example "Buyer Script" (ethers.js script to pay and call API).
