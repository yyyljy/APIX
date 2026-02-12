# x402 Refactor Plan (x402 리팩토링 계획)

**Date:** 2026-02-11
**Objective:** Align Apix x402 implementation with HTTP standards by adopting header-based authentication and challenges.

## User Review Required
> [!IMPORTANT]
> This is a breaking change for the API. Analyzing the codebase, only the internal `demo/frontend` consumes this API, so the impact is contained.

## Proposed Changes

### 1. Backend (`demo/backend/index.ts`)

**Goal:** Move from custom headers/body to standard HTTP Authentication headers.

*   **Challenge (402):**
    *   Add `WWW-Authenticate` header to the 402 response.
    *   Format: `WWW-Authenticate: Apix realm="Apix Protected", request_id="<uuid>", price="<amount>", currency="AVAX", pay_to="<address>"`
    *   *Note:* We will retain the JSON body for ease of frontend parsing in this phase, but the Header is the "Standard" way.

*   **Verification (Auth):**
    *   Stop checking `x-apix-auth`.
    *   Start checking `Authorization` header.
    *   Expected Format: `Authorization: Apix <tx_hash>`

### 2. Frontend (`demo/frontend/src/pages/DemoPage.jsx`)

**Goal:** Update client to comply with new Authentication scheme.

*   **Payment Request:**
    *   Update `callApixApi` to send `Authorization: Apix <tx_hash>` instead of `x-apix-auth`.

### 3. Future "Stateless" Considerations (Brainstorming)

*   **Current:** `request_id` is stored in DB to verify payment later.
*   **Proposed (Future):**
    *   Server signs the payment details (Macaroon/JWT) and sends them in the 402 response (e.g., `payment_token`).
    *   Client includes this `payment_token` + `tx_hash` in the retry.
    *   Server validates the token signature (stateless) and checks L1 for the tx (stateless).
    *   *Decision:* Out of scope for this immediate refactor but documented for Phase 2.

## Verification Plan

### Automated Tests
*   We will run the demo locally and verify distinct flows.

### Manual Verification
1.  **Start Services:**
    *   `apix-cloud` (Go)
    *   `demo/backend` (Node)
    *   `demo/frontend` (React)
2.  **Browser Test:**
    *   Open `http://localhost:5173`.
    *   Click "Buy with Crypto".
    *   **Verify 402:** Check Network tab for `WWW-Authenticate` header.
    *   **Verify Success:** Complete flow and check Network tab for `Authorization: Apix ...` request header.
