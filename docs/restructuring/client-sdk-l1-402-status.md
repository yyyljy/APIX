# APIX Client ↔ SDK ↔ Avalanche L1 Rebuild Status (as of 2026-03-04)

## 1. Overview

Summarizes current progress for the SDK+L1-focused restructuring. The seller backend remains present as before, and the SDK operates within the backend process.
Cloud verification dependencies have been removed, and the SDK now uses a single direct L1 verification path.

## 2. Completed items

- SDK config/type expansion
  - Applied `ApixConfig` updates in `apix-sdk-node/index.ts` (`rpcUrl`, `rpcTimeoutMs`, `rpcMaxRetries`, `defaultMinConfirmations`, `jwtTtlSeconds`, `jwtIssuer`, `jwtKid`).
  - Added direct-L1 verification flags, timeout, retry, and confirmation settings to `ApixMiddleware`.
  - Reconciled `docs/restructuring/client-sdk-l1-402.md` assumptions and flow into an SDK-developer-oriented document.
  - Synchronized `.d.ts` and `index.js` outputs with latest type/build changes.

- Backend integration settings
  - Added new SDK option parsing and forwarding in `demo/backend/index.ts`.
  - Added SDK/L1/token operation variables in `demo/backend/.env.example`.

- Documentation cleanup
  - Updated [docs/restructuring/client-sdk-l1-402.md](/home/jeff/personal/APIX/docs/restructuring/client-sdk-l1-402.md) to match restructuring proposal.
  - Added this status document.

## 3. Current architecture state

- **Client**: retry request with `Authorization: Apix <tx_hash>` after receiving 402 challenge response.
- **Seller backend + SDK**:
  - Existing backend routing for creating 402 challenges, session-start, commit, and rollback remains.
  - `ApixMiddleware.verifyPayment` is consolidated into a single direct-L1 verification path; all external validation service dependencies have been removed.
- **Avalanche L1**:
  - Verifies tx existence, receipt status, recipient, amount, chain, and confirmation count using `eth_getTransactionByHash`, `eth_getTransactionReceipt`, `eth_chainId`, and `eth_blockNumber`.

## 4. Build/test status (latest check)

| Item | Command | Result |
|---|---|---|
| SDK type build | `cd apix-sdk-node && npm run build` | Pass |
| Backend typecheck | `./node_modules/typescript/bin/tsc index.ts index.test.ts ... --outDir .test-dist` | Pass |
| Backend integration test | `cd demo/backend && npm test` | Fail (`supertest` attempted request on a null server) |

Key failure details:

- `TypeError: Cannot read properties of null (reading 'port')`
- Location: `supertest` request layer (`node_modules/supertest/lib/test.js:67`), caller path: `demo/backend/.test-dist/index.test.js:84`

## 5. Open items / cautions

- `demo/backend` test suite still fails because of test server initialization and server binding order/target handling.
- Backend `npm install` initially failed due to DNS (`EAI_AGAIN`) and later recovered on retry; `node_modules` is now present and typecheck succeeds.
- `npm test` must pass before final production release.

## 6. Next actions

- Update test helper to safely bind and pass the app instance to `supertest` before sending requests.
- Re-run `npm test` in the same environment and add missing/critical failure cases if needed.
- Perform end-to-end integration validation of the client path (`demo/frontend`) 402 retry flow after backend verification succeeds.
