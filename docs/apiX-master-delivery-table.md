# APIX Master Delivery Table (De-duplicated)

Generated date: 2026-03-06

Last updated: 2026-03-06

Scope: merged execution output of [apiX-development-todo.md](/home/jylee/omx/APIX/docs/apiX-development-todo.md) and [apiX-production-go-to-market-todo.md](/home/jylee/omx/APIX/docs/apiX-production-go-to-market-todo.md), with overlap removed.


| #   | Priority | Task                                                                                                                                    | Owner                 | Deadline   | Status |
| --- | -------- | --------------------------------------------------------------------------------------------------------------------------------------- | --------------------- | ---------- | ------ |
| 1   | P0       | Freeze 402/PAYMENT-REQUIRED contract (request/response/error schema, shared error codes, protocol version)                              | Backend + SDK         | 2026-03-13 | 미정     |
| 2   | P0       | Implement Admin API (`cmd/adminapi`) with `GET /v1/*` and `POST /webhooks/apix-l1` routing                                              | Backend               | 2026-03-20 | 미정     |
| 3   | P0       | Add durable proof/session persistence (PostgreSQL + Kafka reconciliation pipeline) for proof lifecycle and settlement                   | Platform/Backend      | 2026-04-03 | 미정     |
| 4   | P0       | Add replay/double-spend protection for `Apix` proofs (tx hash + service + route + expiry/state management)                              | Backend               | 2026-03-27 | 미정     |
| 5   | P0       | Define security/compliance launch baseline (PoC threat model, privacy retention, legal terms, sanctions review)                         | Security/Legal        | 2026-03-27 | 미정     |
| 6   | P0       | Define secret-management and runtime security controls (KMS, secret rotation, WAF/ACL baseline)                                         | Security/DevOps       | 2026-03-27 | 미정     |
| 7   | P0       | Prepare incident readiness package (security review complete + launch gate checklist)                                                   | PM + Security         | 2026-04-10 | 미정     |
| 8   | P1       | Add proof extraction/validation hardening and strict parsing of payment proof formats                                                   | Backend               | 2026-03-27 | 미정     |
| 9   | P1       | Harden session state and commit/rollback consistency under crash/timeout/disconnect paths                                               | SDK + Backend         | 2026-03-27 | 미정     |
| 10  | P1       | Strengthen FileSessionStore IO/locking and remove synchronous contention hotspots                                                       | SDK                   | 2026-03-27 | 미정     |
| 11  | P1       | Add 402 negative-path and end-to-end integration tests (backend + frontend retry flow)                                                  | QA + Backend/Frontend | 2026-03-27 | 미정     |
| 12  | P1       | Add production observability and reliability controls (p95/p99 SLO targets, circuit breakers, alerting thresholds, RPC fallback policy) | SRE/Platform          | 2026-04-03 | 미정     |
| 13  | P1       | Publish runbooks: RPC outage, settlement stuck, chain reorg recovery                                                                    | SRE                   | 2026-04-03 | 미정     |
| 14  | P2       | Establish release policy: API/SDK compatibility, semantic versioning, changelog, migration/deprecation policy                           | PM + Release          | 2026-04-10 | 미정     |
| 15  | P2       | Complete launch communications: value proposition, ICP/pricing model, onboarding docs, pricing documentation                            | PM + Marketing        | 2026-04-10 | 미정     |
| 16  | P2       | Publish developer enablement artifacts (quickstarts, examples, Terraform/Helm, sandbox troubleshooting)                                 | DevRel                | 2026-04-17 | 미정     |
| 17  | P2       | Launch support model (channels, triage flow, SLA tiers, bug bounty path)                                                                | Support/Operations    | 2026-04-17 | 미정     |
| 18  | P2       | Build public launch assets (landing page, walkthrough video, launch checklist, one-pager)                                               | Marketing             | 2026-04-17 | 미정     |
| 19  | P0       | Finalize x402 BJWT entitlement token protocol contract (`apiX-402-bjwt-entitlement-token-proposal.md`) and shared error-code mapping                 | Backend + SDK         | 2026-03-13 | 미정     |
| 20  | P0       | Add BJWT issuance for settlement response (`SettlementResponse.extensions["entitlement-token"]`) with EIP-191 signatures                      | SDK                  | 2026-03-20 | 미정     |
| 21  | P1       | Implement `ENTITLEMENT-TOKEN` parser and PoP proof verification (`htm`, `htu`, `ath`, `(token.jti, proof.jti)` uniqueness)                  | Backend               | 2026-03-27 | 미정     |
| 22  | P1       | Add settlement binding and atomic quota enforcement for entitlement claims (tx hash, payment requirements hash, used_count, exhaustion behavior) | Backend + DB          | 2026-04-03 | 미정     |
| 23  | P2       | Add BJWT negative-path and end-to-end integration tests + failure diagnostics (`invalid_token`, `invalid_proof`, `replay_detected`)         | QA + Backend/Frontend | 2026-04-10 | 미정     |


## 실행 가이드

- P0는 `apiX-development-todo.md`의 실행 항목과 1:1로 연결되어 있으며, 동시에 병행 가능한 항목은 병렬 수행.
- P1은 성능/안정성/검증 보강 항목.
- P2는 공개 런칭을 위한 제품/운영 UX 자산과 커뮤니케이션 항목.
- 상태는 `미정 -> 진행중 -> 완료` 순환.
