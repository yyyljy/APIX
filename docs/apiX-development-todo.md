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

## Priority 1 (High)

- [ ] Normalize payment verification error contract between SDK and backend/frontend.
  - `verifyPayment()` returns `verification_failed`, but backend currently maps errors with `apix_verification_failed` in [demo/backend/index.ts](/home/jylee/omx/APIX/demo/backend/index.ts:40).
  - Frontend fallback maps include both styles inconsistently.
  - Files: [apix-sdk-node/index.ts](/home/jylee/omx/APIX/apix-sdk-node/index.ts), [demo/frontend/src/utils/api.js](/home/jylee/omx/APIX/demo/frontend/src/utils/api.js).

- [ ] Harden `FileSessionStore` lock/IO behavior for production.
  - Current implementation uses sync I/O and busy-wait in lock contention.
  - Files: [apix-sdk-node/index.ts](/home/jylee/omx/APIX/apix-sdk-node/index.ts) (`withLock`, `readSnapshot`, `writeSnapshot`).

- [ ] Strengthen payment proof extraction and validation.
  - TxHash/JWT heuristic currently relies on format heuristics (`0x` + length check), with permissive parsing in `parsePaymentSignature`.
  - Files: [demo/backend/index.ts](/home/jylee/omx/APIX/demo/backend/index.ts:398), [demo/backend/index.ts](/home/jylee/omx/APIX/demo/backend/index.ts:470).

- [ ] Improve demo orchestrator lifecycle robustness.
  - Runtime currently terminates only top-level npm processes and may leave child process trees behind in some environments.
  - File: [execution/run_demo.py](/home/jylee/omx/APIX/execution/run_demo.py).

## Priority 2 (Important)

- [ ] Expand test coverage for negative and degraded paths.
  - Backend test file currently covers only happy path and a small set of errors.
  - SDK tests cover only local/session unit logic; no on-chain verification failure cases are asserted.
  - Files: [demo/backend/index.test.ts](/home/jylee/omx/APIX/demo/backend/index.test.ts), [apix-sdk-node/index.test.js](/home/jylee/omx/APIX/apix-sdk-node/index.test.js).

## Acceptance checklist for each major ticket

- API route exists and returns expected HTTP/status/error contract.
- Environment variables are consumed from `.env` or deployment env.
- Failure paths (RPC down, malformed token, DB down, Kafka down) return safe default responses.
- Test coverage includes at least one negative case for each branch.
- Log/observability fields include request id and operation state.

## Immediate next step (recommended)

1. Start with the Priority 0 tasks in this order:
   1) `cmd/adminapi` scaffold + `/v1/*` auth guard,  
   2) DB/Kafka setup work according to [docs/apiX-admin-implementation-todo.md](/home/jylee/omx/APIX/docs/apiX-admin-implementation-todo.md),  
   3) Webhook and `/webhooks/apix-l1` binding.
2. After that, align verification error contract in SDK/backend/frontend before touching further feature work.
