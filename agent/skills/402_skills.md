---
name: x402-payment-apix-evm
version: 1.0.0
description: "Pay for x402-protected APIX endpoints on unloc.kr via APIX native coin on EVM (chain 402)."
author: open-aibank
homepage: https://x402.org
metadata:
  clawdbot:
    emoji: "💳"
    env: ["APIX_PRIVATE_KEY", "APIX_RPC_URL"]
tags: [crypto, payments, x402, agents, api, apix, native-coin, evm]
requires_tools: [x402_evm_invoke]
arguments:
  url:
    description: "Full URL for the protected endpoint (e.g. https://unloc.kr/apix-product for human mode or https://unloc.kr/agent-apix-product for agent mode)"
    required: true
  method:
    description: "HTTP method for the initial call. Allowed: GET, POST."
    required: false
  body:
    description: "JSON body for POST requests"
    required: false
  payer_private_key:
    description: "Wallet private key used to sign/send the payment transaction"
    required: false
  chain_id:
    description: "CAIP-2 chain id for fixed chain validation. Default: eip155:402"
    required: false
  network:
    description: "CAIP-2 chain fallback for validation. Default: eip155:402"
    required: false
  rpc_url:
    description: "RPC endpoint for tx signing/broadcast. Falls back to APIX_RPC_URL"
    required: false
  payment_signature_header:
    description: "Header name to send payment proof, default PAYMENT-SIGNATURE"
    required: false
  timeout_ms:
    description: "HTTP timeout in milliseconds"
    required: false
  max_retries:
    description: "Number of post-payment retry attempts after tx submission"
    required: false
---

# x402 Payment Protocol (EVM / APIX)

Invoke x402-enabled endpoints on unloc.kr with automated APIX micropayments.

## Purpose

The demo endpoint verifies payment by checking a submitted transaction hash on-chain,
so this flow uses **native coin transfers** (no ERC-20 approval flow).

## Quick Start

Use tool: `x402_evm_invoke`.

## Workflow

1) Call endpoint.
2) If response is `402 Payment Required`, parse `PAYMENT-REQUIRED` challenge and extract:
   - `request_id`
   - `payment_info.recipient`
   - `payment_info.amount_wei`
3) Create and broadcast a native coin transfer tx on EVM to `recipient` with `value = amount_wei`.
4) Retry endpoint with headers:
   - `Authorization: Apix <tx_hash>`
   - `X-Request-ID: <request_id>`
   - `PAYMENT-SIGNATURE: tx_hash=<tx_hash>` (if supported)
5) On retry success (`200`), return payload.
6) If retry still returns `402`, verify tx proof against challenge and retry once.

## Chain & Verification rules

- Chain id is fixed to `eip155:402` unless explicitly set with `chain_id`/`network`.
- The tool checks that signed transaction matches:
  - recipient exactly equal to `payment_info.recipient`
  - amount >= `payment_info.amount_wei`
  - chain/network equals requested chain

## Requirements

- `payer_private_key` (required unless loaded from env):
  - `APIX_PRIVATE_KEY`
- `rpc_url` (required unless loaded from env):
  - `APIX_RPC_URL`
- Wallet must hold APIX (native coin) and enough gas on same chain.
- Target endpoint must be CAIP-2 aware (default `eip155:402`).

## Tool Reference

### x402_evm_invoke

Executes an HTTP request and handles x402 payment proof automatically.

**Tool path**: `agent/skills/dist/index.js`

#### Input

| Parameter | Type | Required | Default |
|-----------|------|----------|---------|
| `url` | string | Yes | - |
| `method` | string | No | `GET` |
| `body` | object | No | `{}` |
| `payer_private_key` | string | No* | env `APIX_PRIVATE_KEY` |
| `chain_id` | string | No | `eip155:402` |
| `network` | string | No | `eip155:402` |
| `rpc_url` | string | No | env `APIX_RPC_URL` |
| `payment_signature_header` | string | No | `PAYMENT-SIGNATURE` |
| `timeout_ms` | number | No | `30000` |
| `max_retries` | number | No | `1` |

* `payer_private_key` may be provided directly for one-off execution; otherwise it is read from env.

#### Output

| Field | Type | Meaning |
|-------|------|---------|
| `success` | boolean | Tool-level success flag |
| `status` | number | Final HTTP status |
| `request_id` | string | Challenge request id |
| `tx_hash` | string | Payment tx hash |
| `url` | string | Final URL used |
| `method` | string | HTTP method used |
| `response` | object | Final success payload |
| `error` | object | Failure details when `success` is false |

### Error contract

- `missing_challenge`: `PAYMENT-REQUIRED` absent or malformed
- `payment_send_failed`: signing/sending transaction failed
- `invalid_payment`: mismatch recipient / amount / chain
- `retry_exhausted`: 402 remained after retry budget
- `invalid_target`: unsupported invocation target or bad method

## Security Rules

- Never print or log `APIX_PRIVATE_KEY`.
- Never echo/export keys in shell output.
- Logs should avoid exposing tx hashes and private data when possible.
- Do not reuse a payment tx hash across a different `request_id`.
