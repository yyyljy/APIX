# APIX 402 프로토콜 / 에러 계약 (Canonical)

Generated date: 2026-03-16

이 문서는 현재 APIX SDK(`apix-sdk-node`), 데모 백엔드(`demo/backend`), 프런트엔드(`demo/frontend`)가 공통으로 따르는 **402 결제 챌린지 및 에러 계약의 기준 문서**다.

## 1. 목표

- SDK / backend / frontend가 동일한 status / header / body / error code를 사용한다.
- 402 결제 챌린지와 검증 실패 응답의 의미를 고정한다.
- 신규 구현은 이 문서를 기준으로 하고, 기존 legacy 코드는 이 문서의 canonical code로 정규화한다.

## 2. Canonical public error codes

아래 코드를 public contract 기준으로 사용한다.

| code | status | retryable | 의미 |
|---|---:|---:|---|
| `payment_required` | 402 | false | 결제 proof가 없어서 결제 챌린지를 반환 |
| `missing_tx_hash` | 400 | false | tx hash가 비어 있음 |
| `invalid_request` | 400 | false | 요청 형식 또는 payment context가 잘못됨 |
| `tx_hash_already_used` | 403 | false | 동일 tx hash가 다른 request에 이미 사용됨 |
| `verification_failed` | 403 | 상황별 | on-chain verification 실패 |
| `invalid_apix_session` | 403 | false | 세션 토큰이 없거나 만료/무효 |
| `session_request_in_progress` | 409 | true | 동일 세션에서 이미 처리 중인 요청 존재 |
| `session_quota_exceeded` | 402 | false | 세션 quota 소진 |
| `session_start_failed` | 403 | true | 세션 상태 전이 실패 |
| `internal_error` | 500 | true | 서버 내부 오류 |

## 3. Legacy alias 정규화 규칙

하위 호환을 위해 아래 legacy code는 canonical code로 정규화한다.

| legacy code | canonical code |
|---|---|
| `apix_verification_failed` | `verification_failed` |
| `session_not_found` | `invalid_apix_session` |

신규 코드/문서/테스트에서는 legacy code를 사용하지 않는다.

## 4. 402 Payment Required 응답 계약

### 4-1. HTTP status

- `402 Payment Required`

### 4-2. 필수 헤더

- `WWW-Authenticate`
- `PAYMENT-REQUIRED`
- `X-Request-ID`

### 4-3. `WWW-Authenticate` 형식

```text
Apix realm="Apix Protected", request_id="<request_id>", price="<amount>", currency="<currency>", pay_to="<recipient>"
```

### 4-4. `PAYMENT-REQUIRED` 형식

- JSON을 UTF-8로 직렬화한 뒤 base64 인코딩
- 현재 version:
  - `x402-draft`

디코딩 후 JSON 예시:

```json
{
  "version": "x402-draft",
  "request_id": "req_123",
  "chain_id": 402,
  "network": "eip155:402",
  "payment_info": {
    "currency": "APIX",
    "amount": "0.1",
    "amount_wei": "100000000000000000",
    "recipient": "0xRecipient..."
  }
}
```

### 4-5. 402 JSON body 형식

```json
{
  "error": "Payment Required",
  "code": "payment_required",
  "message": "Payment required to access premium resource.",
  "retryable": false,
  "request_id": "req_123",
  "details": {
    "request_id": "req_123",
    "chain_id": 402,
    "network": "eip155:402",
    "payment_info": {
      "currency": "APIX",
      "amount": "0.1",
      "amount_wei": "100000000000000000",
      "recipient": "0xRecipient..."
    },
    "payment_flow": "wallet_submit",
    "payment_hint": {
      "mode": "human",
      "required_action": "Open wallet and pay on-chain",
      "wallet_hint": "MetaMask is required for demo.",
      "verification_hint": "SDK/API retries automatically after transaction hash is submitted."
    },
    "payment_channels": ["evm_wallet"],
    "channels": ["evm_wallet"]
  }
}
```

## 5. 공통 에러 응답 형식

`payment_required`를 제외한 실패 응답은 아래 JSON 형태를 따른다.

```json
{
  "error": "Request Failed",
  "code": "verification_failed",
  "message": "Verification failed.",
  "retryable": false,
  "request_id": "req_123"
}
```

서버 내부 오류는 `error: "Internal Error"`를 사용한다.

## 6. 검증 성공 후 access token 응답

데모 구현 기준으로 protected route 재요청이 성공하면:

```json
{
  "id": "apix_paid_resource",
  "proof": "<access_token>",
  "content": "..."
}
```

프런트는 `proof`를 access token으로 사용한다.

## 7. 계약 운영 규칙

- `request_id`는 body와 `X-Request-ID` 헤더에서 동일해야 한다.
- `chain_id`와 `network`는 항상 일치해야 한다.
- frontend는 수신한 raw code를 그대로 신뢰하지 말고 legacy alias를 canonical code로 정규화해야 한다.
- 신규 테스트는 canonical code 기준으로 작성한다.

## 8. 현재 구현 반영 범위

- SDK:
  - `verification_failed`를 canonical verification failure code로 사용
  - `payment_required` challenge body/header 생성
- Backend:
  - `X-Request-ID` 헤더 주입
  - SDK 응답을 그대로 노출하는 protected route 유지
- Frontend:
  - `apix_verification_failed -> verification_failed`
  - `session_not_found -> invalid_apix_session`
  - 로컬 에러 tone/snapshot도 canonical code 기준으로 정렬

## 9. 관련 파일

- `apix-sdk-node/index.ts`
- `apix-sdk-node/index.test.js`
- `demo/backend/index.ts`
- `demo/backend/index.test.ts`
- `demo/frontend/src/utils/api.js`
- `demo/frontend/src/pages/DocsPage.jsx`
