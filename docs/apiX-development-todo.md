# APIX Development TODO (Analysis-based)

Generated date: 2026-03-06

This file is derived from the codebase analysis and prioritizes executable development work.

## Priority 0 (Must complete first)

- [ ] Implement operational Admin API service (`cmd/adminapi`) with handlers for `GET /v1/*` and `POST /webhooks/apix-l1`.
  - Current scope is currently focused on demo endpoints only in [demo/backend/index.ts](/home/jylee/omx/APIX/demo/backend/index.ts).
  - Required routes are not present in the current repo implementation.

- [ ] Start PostgreSQL/Kafka implementation backlog for Admin API (`docs/apiX-admin-implementation-todo.md`) as actual code work.
  - DB migration, schema verification, and index/constraint checks are still pending in [docs/apiX-admin-implementation-todo.md](/home/jylee/omx/APIX/docs/apiX-admin-implementation-todo.md).
  - Environment/env var injection list is not implemented.
  - Kafka topic and consumer/reconciliation pipeline are not implemented.

- [ ] Define launch-critical product scope and commercial baseline (ICP, pricing model, onboarding path, minimum API catalog).
  - Source: [docs/apiX-production-go-to-market-todo.md](/home/jylee/omx/APIX/docs/apiX-production-go-to-market-todo.md) section 1.
  - Decide whether to launch on transaction-based fees, fixed subscription, or hybrid model before implementation freeze.

- [ ] Establish security/compliance baseline required for production.
  - Covers secrets handling (rotation), data retention, terms/privacy framing, and sanctions/restriction policy.
  - Source: [docs/apiX-production-go-to-market-todo.md](/home/jylee/omx/APIX/docs/apiX-production-go-to-market-todo.md) section 3.

- [ ] Add BJWT entitlement advertisement for 402 challenge.
  - Implement `PaymentRequired.extensions["entitlement-token"]` with versioned pack catalog, supported chains, TTL, scope, and `ENTITLEMENT-TOKEN` presentation metadata.
  - Support `accepted.extra["entitlement-token"]` as the client pack-selection channel.
- Source: [apiX-402-bjwt-entitlement-token-proposal.md](/home/jylee/omx/APIX/docs/proposals/apiX-402-bjwt-entitlement-token-proposal.md) sections 4, 5.

- [ ] Add BJWT issuance contract in settlement response.
  - Return `SettlementResponse.extensions["entitlement-token"]` with BJWT token, `quota.max`, and `expiresAt`.
  - Keep legacy x402 path available while adding entitlement extension in parallel.
- Source: [apiX-402-bjwt-entitlement-token-proposal.md](/home/jylee/omx/APIX/docs/proposals/apiX-402-bjwt-entitlement-token-proposal.md) sections 6, 13.

## Priority 1 (High)

- [ ] Normalize payment verification error contract between SDK and backend/frontend.
  - `verifyPayment()` returns `verification_failed`, but backend currently maps errors with `apix_verification_failed` in [demo/backend/index.ts](/home/jylee/omx/APIX/demo/backend/index.ts:40).
  - Frontend fallback maps include both styles inconsistently.
  - Files: [apix-sdk-node/index.ts](/home/jylee/omx/APIX/apix-sdk-node/index.ts), [demo/frontend/src/utils/api.js](/home/jylee/omx/APIX/demo/frontend/src/utils/api.js).

- [ ] Finalize 402 protocol contract and client retry matrix.
  - Define and lock status/body/header spec for `PAYMENT-REQUIRED` (including `Apix` proof header) and publish a shared schema.
  - Ensure frontend handles all failure modes (`invalid`, `expired`, `already-used`, `chain-mismatch`) with deterministic UX and metrics.
  - Files: [apix-sdk-node/index.ts](/home/jylee/omx/APIX/apix-sdk-node/index.ts), [demo/backend/index.ts](/home/jylee/omx/APIX/demo/backend/index.ts), [demo/frontend/src/utils/api.js](/home/jylee/omx/APIX/demo/frontend/src/utils/api.js).

- [ ] Harden `FileSessionStore` lock/IO behavior for production.
  - Current implementation uses sync I/O and busy-wait in lock contention.
  - Files: [apix-sdk-node/index.ts](/home/jylee/omx/APIX/apix-sdk-node/index.ts) (`withLock`, `readSnapshot`, `writeSnapshot`).

- [ ] Strengthen payment proof extraction and validation.
  - TxHash/JWT heuristic currently relies on format heuristics (`0x` + length check), with permissive parsing in `parsePaymentSignature`.
  - Files: [demo/backend/index.ts](/home/jylee/omx/APIX/demo/backend/index.ts:398), [demo/backend/index.ts](/home/jylee/omx/APIX/demo/backend/index.ts:470).

- [ ] Add replay/ double-spend protection for `Apix` proof usage.
  - Persist proof usage state (tx hash + service ID + path + expiry) and reject reused or stale proofs.
  - Validate nonce/timestamp or block-depth constraints at verify time before granting access.
  - File: [demo/backend/index.ts](/home/jylee/omx/APIX/demo/backend/index.ts), plus session/payment persistence layer.

- [ ] Improve demo orchestrator lifecycle robustness.
  - Runtime currently terminates only top-level npm processes and may leave child process trees behind in some environments.
  - File: [execution/run_demo.py](/home/jylee/omx/APIX/execution/run_demo.py).

- [ ] Add production reliability controls and rollback safety.
  - Define SLO/SLA targets, circuit breakers, RPC outage fallback policy, and structured observability thresholds.
  - Source: [docs/apiX-production-go-to-market-todo.md](/home/jylee/omx/APIX/docs/apiX-production-go-to-market-todo.md) section 4.

- [ ] Add production runbooks and operational playbooks.
  - Create runbooks for RPC outage, settlement stuck, and chain reorg recovery.
  - Define alerting thresholds and incident escalation flow.
  - Source: [docs/apiX-production-go-to-market-todo.md](/home/jylee/omx/APIX/docs/apiX-production-go-to-market-todo.md) section 4.

- [ ] Implement ENTITLEMENT-TOKEN request-time verifier in backend and SDK.
  - Parse `ENTITLEMENT-TOKEN` payload with token+proof wrapper.
  - Validate BJWT fields (`iss/sub/aud/exp/scope/quota`), proof type, signature, and request-bound claims (`htm`, `htu`, `ath`, `proof.jti`).
  - Enforce `x402-entitlement+bjwt` `typ` and optional `kid` format rules.
- Source: [apiX-402-bjwt-entitlement-token-proposal.md](/home/jylee/omx/APIX/docs/proposals/apiX-402-bjwt-entitlement-token-proposal.md) sections 7, 8, 9.

- [ ] Implement replay and quota enforcement for entitlement proof claims.
  - Prevent duplicate `proof.jti` and enforce unique `(token.jti, proof.jti)` handling.
  - Enforce `used_count < quota.max` atomically; return 402 with fresh challenge on exhaustion.
- Source: [apiX-402-bjwt-entitlement-token-proposal.md](/home/jylee/omx/APIX/docs/proposals/apiX-402-bjwt-entitlement-token-proposal.md) section 9.

- [ ] Bind entitlement token to payment settlement context.
  - Validate `x402.transaction`, payer/payTo/asset/amount alignment, chainId/network match, and optional `paymentRequirementsHash` consistency.
  - Treat mismatches as invalid entitlement and classify as `invalid_token`/`scope_violation`.
- Source: [apiX-402-bjwt-entitlement-token-proposal.md](/home/jylee/omx/APIX/docs/proposals/apiX-402-bjwt-entitlement-token-proposal.md) section 7.

## Priority 2 (Important)

- [ ] Expand test coverage for negative and degraded paths.
  - Backend test file currently covers only happy path and a small set of errors.
  - SDK tests cover only local/session unit logic; no on-chain verification failure cases are asserted.
  - Files: [demo/backend/index.test.ts](/home/jylee/omx/APIX/demo/backend/index.test.ts), [apix-sdk-node/index.test.js](/home/jylee/omx/APIX/apix-sdk-node/index.test.js).

- [ ] Add integration tests for 402 end-to-end path.
  - Include scenarios: no token (challenge), malformed `Apix` proof, expired/invalid chain id proof, already-used proof, and on-chain revert/refund states.
  - Add test coverage for frontend retry path with mocked payment gateway responses.
  - Files: [demo/backend/index.test.ts](/home/jylee/omx/APIX/demo/backend/index.test.ts), [demo/frontend/src/utils/api.js], [demo/frontend/src/pages](/home/jylee/omx/APIX/demo/frontend/src/pages).

- [ ] Build launch assets and developer enablement bundle.
  - Create one-pager/landing page/story script, public walkthrough, and first-100-user onboarding docs.
  - Add quickstarts, framework sample repos, Terraform/Helm manifests, and sandbox troubleshooting matrix.
  - Source: [docs/apiX-production-go-to-market-todo.md](/home/jylee/omx/APIX/docs/apiX-production-go-to-market-todo.md) sections 6 and 7.

- [ ] Set up support and release governance.
  - Define release policy (versioning/changelog/migration), public support channels, triage & SLA, and bug-bounty workflow.
  - Source: [docs/apiX-production-go-to-market-todo.md](/home/jylee/omx/APIX/docs/apiX-production-go-to-market-todo.md) sections 5, 6, and 7.

- [ ] Add BJWT-specific negative-path and contract tests.
  - Add unit/integration coverage for invalid token, expired token, invalid PoP, scope violation, replay, and quota exhaustion.
  - Add end-to-end test where `ENTITLEMENT-TOKEN` is presented with request method/path changes.
- Source: [apiX-402-bjwt-entitlement-token-proposal.md](/home/jylee/omx/APIX/docs/proposals/apiX-402-bjwt-entitlement-token-proposal.md) sections 8, 9, 10.

- [ ] Add BJWT rollout diagnostics and developer docs.
  - Document token schema examples, proof signing procedure, migration notes from legacy Apix token, and troubleshooting matrix.
  - Add operational metrics for entitlement validation failures by reason code.
- Source: [apiX-402-bjwt-entitlement-token-proposal.md](/home/jylee/omx/APIX/docs/proposals/apiX-402-bjwt-entitlement-token-proposal.md) sections 10, 12, 13.

## Acceptance checklist for each major ticket

- API route exists and returns expected HTTP/status/error contract.
- Environment variables are consumed from `.env` or deployment env.
- Failure paths (RPC down, malformed token, DB down, Kafka down) return safe default responses.
- Test coverage includes at least one negative case for each branch.
- Log/observability fields include request id and operation state.

## Linkage with production Go-to-market checklist

### Overlap (do not duplicate)

- [Production: 2) Protocol / product hardening](/home/jylee/omx/APIX/docs/apiX-production-go-to-market-todo.md#2-protocol--product-hardening-must-have-before-launch)
  - Covers protocol contract and replay controls already covered by:
    - Normalize payment verification error contract.
    - Finalize 402 protocol contract and client retry matrix.
    - Add replay/ double-spend protection for `Apix` proof usage.
    - Strengthen payment proof extraction and validation.

- [Production: 2-3 Session and settlement robustness](/home/jylee/omx/APIX/docs/apiX-production-go-to-market-todo.md#2-protocol--product-hardening-must-have-before-launch)
  - Covered by commit/rollback and session-path improvements in:
    - Expand test coverage for negative and degraded paths.
    - Add integration tests for 402 end-to-end path.

- [Production: 2-4 Admin and reconciliation operations](/home/jylee/omx/APIX/docs/apiX-production-go-to-market-todo.md#2-protocol--product-hardening-must-have-before-launch)
  - Covered by:
    - Implement operational Admin API service (`cmd/adminapi`)...
    - Start PostgreSQL/Kafka implementation backlog for Admin API...

### Gap (needs to be mirrored into dev execution plan)

- Product/Go-to-market planning items have been migrated into Priority 0~2 for execution tracking in this file.
- Remaining work is ownership/timeboxing on each row (not a missing-topic gap).

- Suggested cross-doc flow:
  - Use this file for implementation tasks.
  - Use [Production + Go-to-market checklist](/home/jylee/omx/APIX/docs/apiX-production-go-to-market-todo.md) for launch-readiness and commercial readiness tasks.

## Immediate next step (recommended)

1. Start with the Priority 0 tasks in this order:
   1) `cmd/adminapi` scaffold + `/v1/*` auth guard,  
   2) DB/Kafka setup work according to [docs/apiX-admin-implementation-todo.md](/home/jylee/omx/APIX/docs/apiX-admin-implementation-todo.md),  
   3) Webhook and `/webhooks/apix-l1` binding.
2. After that, align verification error contract in SDK/backend/frontend before touching further feature work.
