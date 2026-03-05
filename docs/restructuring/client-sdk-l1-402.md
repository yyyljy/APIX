# APIX 402 Architecture Restructuring Proposal (Seller Backend + SDK + Avalanche L1)

## 1) Purpose

Rework the system into a direct, lightweight path that does not depend on any relay service.

- Assumption: The API seller backend exists, and the SDK is embedded/integrated within that backend.
- From the SDK developer perspective, the correct design goal is: "the backend exists and the SDK runs inside it."

- Current pattern: client -> backend -> SDK -> L1
- Target pattern: client -> **seller backend + SDK** -> L1

This document reflects the current structure as observed in the codebase.

This is written for SDK developers and assumes that a seller backend is required.

- Core alignment: request routing/commit/rollback are handled by the backend, while `verifyPayment` is executed by the SDK via direct Avalanche L1 verification.
- The SDK no longer calls `/v1/verify` or `/v1/session/*` and now owns session state directly inside the backend process.
- The backend still performs the existing 402 challenge / session-start / commit / rollback flow through SDK delegation.

---

## 2) Target architecture state

- **Client**
  - Protected API call -> receives 402 -> submits tx with wallet -> retries with tx hash
- **Seller backend + SDK integration layer**
  - Generates 402 challenge, verifies tx, issues/validates JWT, manages session state
- **Avalanche L1**
  - Provides transaction evidence: receipt, chain, recipient, and amount verification

---

## 3) Design principles

1. Remove mandatory cloud paths to reduce failure points.
2. The SDK owns authentication, session, quota, and replay protection.
3. L1 verification is limited to payment truth verification.
4. Introduce persistent state storage to prevent state races in multi-instance deployments.

---

## 4) Core flow after restructuring

1. Client calls protected resource.
2. If no payment proof is attached, internal backend SDK returns `WWW-Authenticate`, `PAYMENT-REQUIRED` (preserving existing 402 flow).
3. Client retries with `Authorization: Apix <tx_hash>` after submitting tx.
4. Backend SDK verifies tx hash against L1 criteria.
5. On verification success, a JWT session is issued and session state is recorded.
6. Before serving resource, `start` is executed to mark pending quota by the provider backend.
7. `commit` on 2xx responses, `rollback` on 5xx/failures.

---

## 5) Detailed change plan

### 5.1 SDK (`apix-sdk-node`) changes

- Normalize `verifyPayment` to a single path that always performs direct L1 verification.
- Use direct verification configuration values:
  - `APIX_RPC_URL`
  - `APIX_RPC_TIMEOUT_MS`
  - `APIX_RPC_MAX_RETRIES`
  - `APIX_MIN_CONFIRMATIONS`
- SDK options for direct verification
  - `rpcUrl` (`APIX_RPC_URL`)
  - `rpcTimeoutMs` (`APIX_RPC_TIMEOUT_MS`)
  - `rpcMaxRetries` (`APIX_RPC_MAX_RETRIES`)
  - `defaultMinConfirmations` (`APIX_MIN_CONFIRMATIONS`)
- Remove external session-management dependency and internalize session ownership
  - `SessionStore` directly performs `validateSession`, `startRequestState`, `commitRequestState`, `rollbackRequestState` via local storage.
- SDK directly issues and validates JWTs.

### 5.2 Backend (`demo/backend`) changes

- Keep the existing middleware entry point (`/apix-product`).
- Keep the existing 402 return / session start / commit / rollback calls.
- Reflect direct L1 validation parameters in `ApixMiddleware` settings:
  - `rpcUrl`, `rpcTimeoutMs`, `rpcMaxRetries`, `defaultMinConfirmations`
- Recommend configuring `APIX_SESSION_STORE_PATH` for multi-instance-safe operation.

### 5.3 Store and concurrency

- Minimum viable implementation: PoC possible with existing file/memory stores.
- Production recommendation: Redis or DB-backed store.
  - Prevent tx hash reuse.
  - Support idempotency by `request_id + tx_hash`.
  - Concurrency control for pending state.
  - TTL cleanup.

---

## 6) Recommended data models

### Verification / Replay Record
- `request_id`
- `tx_hash`
- `request_id + tx_hash` as canonical key
- `expires_at`
- `request_state`

### Session Record
- `token`
- `remaining_quota`
- `request_state` (`idle` / `pending`)
- `expires_at`

---

## 7) Migration phases

### Phase 1: Establish direct L1 verification
- Both SDK and backend operate only through the direct L1 verification path.
- Verification and session-state handling are done internally by SDK without calling external verification services.

---

## 8) Compatibility / operations checklist

- Preserve 402 format (`WWW-Authenticate`, `PAYMENT-REQUIRED`).
- Keep handling `Authorization: Apix <credential>` (front-end compatibility).
- Keep error code meanings: `session_request_in_progress`, `session_quota_exceeded`, `invalid_apix_session`.
- Ensure precise commit/rollback behavior for 200 vs non-200 responses.
- Guarantee replay and quota concurrency safety in multi-instance environments.

---

## 9) Known risks

- Single RPC failure mode: fallback RPC and timeout/retry strategy required.
- Shared-state contention: file locking alone is insufficient for multi-instance scale.
- Chain reorg consistency: formalize policies for reorgs and unconfirmed transactions.

---

## 10) Conclusion

The requested "client-SDK-L1 only" architecture is implemented in the current codebase.

The essence of "removing cloud" is not just clearing URLs. It means the embedded backend SDK owns verification and session-state responsibilities end-to-end. Concretely, the SDK handles all of:

- tx hash verification
- session validation/obtain/commit/rollback
- replay prevention
- JWT and quota policy

So the implementation must adopt all of the above directly.

## 11) SDK developer clarifications (addendum)

- Incorrect wording: "client -> SDK -> L1"
  - Correct interpretation: seller resource access decisions are made in the backend, so backend is mandatory.
- Recommended wording: "client -> seller backend(with SDK) -> L1"
- SDK responsibilities:
  - Issue 402 challenge
  - Verify payment tx
  - Control session, quota, replay
- Backend responsibilities:
  - Route protected resources (e.g., `/apix-product`) and enforce policies
  - Execute commit/rollback hooks at response boundaries (current code reference: `finalizeQuota`)

Current code evidence:
- Middleware in backend route triggers 402/session/verification: [demo/backend/index.ts:454](/home/jeff/personal/APIX/demo/backend/index.ts:454)
- Session/quota commit and rollback are applied based on response state: [demo/backend/index.ts:420](/home/jeff/personal/APIX/demo/backend/index.ts:420)
