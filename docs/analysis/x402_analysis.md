# x402 Flow Analysis & Comparison (Current-State Snapshot)

**Date:** 2026-02-21
**Project:** Apix (Pivot Phase)
**Subject:** Current x402 flow against HTTP 402 payment patterns

## 1. Executive Summary

Apix now follows the x402-style challenge-response flow with a compatibility-first HTTP header strategy:
- Protected endpoints return `402 Payment Required` and include standardized payment hints in both body and headers.
- Proof is accepted from `Authorization: Apix <tx_hash>` and `PAYMENT-SIGNATURE` while keeping backward compatibility.
- Verification no longer uses a hard-coded always-valid path by default; on-chain verification path is present with replay and network checks.

## 2. Current Apix x402 Implementation

### 2.1. Flow

1. **Request:** Client calls protected resource (e.g., `GET /apix-product`) without proof.
2. **Challenge:** Server returns `HTTP 402` with:
   - `WWW-Authenticate` header (parser-friendly challenge metadata)
   - `PAYMENT-REQUIRED` header (opaque payment body)
   - JSON body containing `request_id`, chain/network metadata, amount and recipient
3. **Payment:** Client executes an on-chain transaction.
4. **Proof:** Client retries request with:
   - `Authorization: Apix <tx_hash>` (preferred) or
   - `PAYMENT-SIGNATURE` fallback payload (for legacy/payment-compatible clients)
5. **Verification:** Cloud verifies tx metadata against request metadata and chain conditions before issuing a session JWT.

### 2.2. Code Reference
- **Cloud (`apix-cloud/main.go`)**: `POST /v1/verify` validates tx, controls replay + confirmation depth, issues JWT (`kid` aware).
- **SDK (`apix-sdk-node/index.ts`)**: Extracts proof, calls cloud verify endpoint, caches quota-bearing sessions, validates local expiry/quota, and enforces start/commit/rollback semantics.
- **Demo Backend (`demo/backend/index.ts`)**: `extractPaymentProof` supports both `Authorization` and `PAYMENT-SIGNATURE`; issues 402 with required headers.

## 3. Comparison with Industry Standards (x402 / L402)

| Feature | Apix Current Implementation | Standard x402 / L402 | Notes |
| :--- | :--- | :--- | :--- |
| **Status Code** | `402 Payment Required` | `402 Payment Required` | Aligned |
| **Challenge Location** | Body + `WWW-Authenticate` + `PAYMENT-REQUIRED` | Header-based (`WWW-Authenticate`) | Apix now exposes standard headers and retains body for developer readability. |
| **Proof Transport** | `Authorization: Apix <tx_hash>` + `PAYMENT-SIGNATURE` fallback | `Authorization: L402 <credential>` | Compatibility currently prioritizes practical interoperability while moving toward protocol alignment. |
| **State Management** | Stateful session + request quota state + replay guard (`request_id + tx_hash`) | Mostly stateless tokenized models | Stateful control remains by design; tokenization can be hardened further in later phase. |
| **Settlement Layer** | Avalanche L1 RPC verification | L2/LN alternatives (e.g., L402 references) | L1 latency tradeoff accepted for high-value, on-chain auditability scenarios. |

## 4. Current Gap Analysis

### 4.1. Strengths
- `402` challenge metadata now follows parser-friendly headers.
- Real transaction checks are used instead of unconditional mock success.
- Replay and network mismatch checks reduce duplicate proof abuse.

### 4.2. Remaining Gaps
- Standard protocol tokenization (`L402` credential format) is not yet a primary path.
- Session/stateful design is useful for quotas but not fully stateless-native.
- Integration fault-injection coverage (underpayment/recipient mismatch/unconfirmed edge cases) can be strengthened.

### 4.3. Next-Step Recommendations
1. Keep current compatible flow as default while documenting canonical parse precedence.
2. Add token-credential path in parallel to existing `Apix` proof path.
3. Extend test coverage for compatibility and verification edge cases.
4. Add observability fields for verification failure reasons and rollback/commit outcomes.
