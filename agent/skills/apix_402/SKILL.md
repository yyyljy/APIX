# APIX x402 Payment (EVM) — MCP Server + Skill Usage

This README explains how to run the MCP server for `x402_evm_invoke` and how to use the `x402-payment-apix-evm` skill to pay for x402 endpoints on the APIX Avalanche subnet.

---

## 1) Requirements

- **Node.js** (v18+ recommended)
- **APIX private key** (local only)
- **RPC URL**
  - `https://subnets.avax.network/apix/testnet/rpc`
- **x402 endpoint**
  - `https://unloc.kr/apix-product`

> ⚠️ Never commit or share private keys. Keep them in environment variables only.

---

## 2) Environment Variables

```bash
export APIX_PRIVATE_KEY=<YOUR_PRIVATE_KEY>
export APIX_RPC_URL=https://subnets.avax.network/apix/testnet/rpc
```

---

## 3) Run the MCP Server (stdio)

```bash
node /home/mini/.openclaw/workspace/skills/apix_402/scripts/x402_evm_mcp_stdio.mjs
```

Leave it running (use tmux/nohup if needed).

---

## 4) Register MCP Server in mcporter

```bash
npx mcporter config add x402-evm \
  --stdio /home/mini/.nvm/versions/node/v25.6.0/bin/node \
  --arg /home/mini/.openclaw/workspace/skills/apix_402/scripts/x402_evm_mcp_stdio.mjs \
  --scope home
```

Verify:
```bash
npx mcporter list
```

---

## 5) Call the x402 Endpoint

```bash
npx mcporter call x402-evm.x402_evm_invoke \
  url:https://unloc.kr/apix-product \
  method:GET
```

The tool will:
1. Call the endpoint
2. If 402 is returned, sign & submit the payment tx
3. Retry the endpoint with the payment proof

---

## 6) Transaction Explorer

Use this format to inspect the payment transaction hash:

```
https://explorer-test.avax.network/apix/tx/{txhash}
```

---

## 7) Skill Reference

Skill name: `x402-payment-apix-evm`

The skill uses `x402_evm_invoke` (MCP tool) to perform the payment flow automatically.

---

## 8) Notes

- `APIX` is a native coin on the APIX Avalanche subnet.
- No ERC-20 approval is required.
- Ensure the wallet has enough APIX for **payment + gas**.

---

If you want this documented in a different structure (install script, Docker, etc.), let me know.