# Apix: Project Master Plan (PRD & Technical Specification)

**Version:** 1.0.0
**Date:** 2026-01-20
**Status:** DRAFT
**Target Infrastructure:** Avalanche L1 Blockchain

---

## 1. Executive Summary

**The Vision: The "Pay-per-Call" Economy**
The digital economy is shifting from human-centric monthly subscriptions (SaaS) to machine-centric, on-demand interactions. AI Agents, the new economic actors, require permissionless, instant access to data and utilities without the friction of credit cards or recurring contracts.

**The Solution: Apix**
**Apix** is a decentralized API marketplace designed for this micropayment era. By tokenizing API calls on the **Avalanche L1 blockchain**, Apix enables a true "Pay-per-Call" model.
*   **Granular Access:** Purchase exactly what is needed—from 1 call to 1,000,000—without lock-ins.
*   **Autonomous Commerce:** AI Agents can programmatically discover, negotiate, and purchase API access using the **x402 Protocol** (inspired by HTTP 402).
*   **Secondary Liquidity:** A market where bulk API tokens can be resold, creating dynamic pricing and efficiency.

**Value Proposition:**
*   **For Sellers:** Instant settlement, global reach, and direct access to the booming AI agent economy.
*   **For Buyers (Human & AI):** Zero friction, infinite granularity, and automated purchasing.

---

## 2. User Experience (UX) Strategy

### 2.1 User Journey: The Developer (Seller)
**Goal:** Monetize a high-value API with zero friction.

1.  **Onboarding:** Connect Avalanche Wallet (Core/MetaMask) to the Apix Dashboard.
2.  **Listing:**
    *   Input API Base URL and OpenAPI (Swagger) spec.
    *   **Define Economics:** Set price per call (e.g., 0.01 AVAX) and "Bulk Tiers" (e.g., 1,000 calls for 8 AVAX).
    *   **AI Optimization:** Add capability tags (e.g., `#sentiment-analysis`, `#crypto-data`) for AI indexing.
3.  **Deployment:** A smart contract representing the API inventory is deployed on Avalanche.
4.  **Earnings:** Real-time settlement of crypto into the seller's wallet as calls occur.

### 2.2 User Journey: The AI Agent (Autonomous Buyer)
**Goal:** Fulfill a user request (e.g., "Analyze market sentiment") without human intervention.

1.  **Discovery:** Agent queries the Apix Registry Protocol (ARP) via SDK: `find(tag="sentiment", price<=0.01 AVAX)`.
2.  **Negotiation:** Agent selects the best-fit API based on reputation and price.
3.  **Purchase (x402):**
    *   Agent requests the resource.
    *   Receives `402 Payment Required` challenge.
    *   Signs and broadcasts the payment transaction on-chain.
4.  **Consumption:** Agent receives the access token/redirect immediately after block confirmation and consumes the data.

---

## 3. Detailed Feature Specifications

### 3.1 Marketplace Platform
The "App Store" for APIs, optimized for both functionality and trading.

*   **Smart Asset Listing:** Tokenize standard HTTP and GraphQL APIs.
*   **Token Factory:** Auto-generation of access tokens (ERC-1155 or custom standard) representing API credits.
*   **Dynamic Pricing Engine:** Sellers can set linear pricing, bulk discounts, or surge pricing based on demand.
*   **AI Registry (SEO):** A metadata layer (JSON-LD) mapping API capabilities to vector embeddings for semantic search by AI agents.
*   **Reseller Market:** A secondary market allowing users to resell unused bulk tokens to on-demand users.

### 3.2 Dashboard & Analytics
*   **Traffic Inspector:** Real-time logs of requests, success rates, and latency metrics (p95, p99).
*   **Revenue Hub:** Real-time earnings tracking, withdrawal management, and tax export tools (CSV).
*   **Key Management:** Granular control to revoke keys or block specific wallet addresses.

---

## 4. Technical Architecture

### 4.1 High-Level System Design
Apix operates as a hybrid Web2/Web3 architecture to ensure speed and security.

1.  **Client (SDK):** Handles the x402 handshake and wallet signing (JS/TS, Python, Go).
2.  **Apix Gateway:** A high-performance reverse proxy (Go/Node.js). It intercepts requests, validates on-chain payments, and routes traffic.
3.  **Avalanche L1:** The high-speed settlement layer for value transfer.
4.  **Verification Service:** An indexing layer (The Graph/Custom Node) that confirms on-chain transactions instantly.

### 4.2 The "x402" Protocol Flow
A strict verification flow ensures secure, permissionless access.

1.  **Request:** Client requests `GET /api/v1/resource`.
2.  **Challenge (402):** Gateway checks for valid token. If missing, returns `HTTP 402 Payment Required` with `price`, `request_id`, and `receiver_address`.
3.  **Payment:** Client SDK signs and broadcasts the transaction (TX) to Avalanche.
4.  **Verification:** Client sends `{tx_hash, request_id}` to the Apix Verification Endpoint.
5.  **Validation:** Apix Indexer verifies the TX on-chain (1-confirmation or 0-conf for low value).
6.  **Access:** Gateway issues a temporary `Redirect URL` or signed ephemeral token for access.

### 4.3 Technology Stack Recommendations

*   **Blockchain:**
    *   **Network:** Avalanche C-Chain (MVP) -> Dedicated Subnet (Production).
    *   **Smart Contracts:** Solidity (Hardhat/Foundry).
*   **Backend:**
    *   **Gateway:** **Go (Golang)** or **Node.js** for high-concurrency proxying.
    *   **Database:** PostgreSQL (Metadata), Redis (Rate limiting/Nonce).
    *   **Indexer:** The Graph or custom P-Chain indexer.
*   **Frontend:**
    *   **Framework:** Next.js 14 (React) for SEO and performance.
    *   **Wallet:** RainbowKit + Wagmi.
*   **AI Integration:**
    *   **SDK:** Python SDK optimized for LangChain integration.

---

## 5. Monetization & Tokenomics

**Protocol Fee Model:**
1.  **Transaction Fee:** A flat **2.5% fee** on every API call/token sale.
2.  **Listing Fee:** Nominal fee in AVAX to prevent spam and ensure quality.
3.  **Secondary Royalty:** Standard **5% royalty** for original creators on secondary market resales.

**Token Utility ($APIX - Future):**
*   **Staking:** Sellers stake to boost search visibility.
*   **Governance:** DAO voting on protocol parameters.
*   **Incentives:** Rewards for early adopters and high-uptime providers.

---

## 6. Risk Assessment

| Risk Category | Challenge | Mitigation Strategy |
| :--- | :--- | :--- |
| **Latency** | Blockchain settlement (1-2s) adds latency. | **Optimistic Verification:** Grant access on 0-confirmation (mempool) for low-value payments (<$0.10). |
| **Price Volatility** | AVAX price fluctuations affect API costs. | **Stablecoin Native:** Price in USD (via Oracles), settle in USDC/USDT or AVAX equivalent. |
| **Spam/DDoS** | Verification endpoint flooding. | Rate limiting, PoW challenges for free tiers, and requiring signed requests. |
| **Regulatory** | Micropayment compliance (MiCA, etc.). | Non-custodial definitions; Sellers responsible for tax (Apix provides tools). |

---

## 7. Implementation Timeline

### Phase 1: MVP (Months 1-2)
*   **Core:** Develop x402 Gateway (Go) and Smart Contracts (Avalanche Fuji).
*   **SDK:** Release basic JS/TS Client SDK for header-based auth.
*   **UI:** Simple Seller Dashboard for URL registration and pricing.

### Phase 2: Beta (Months 3-4)
*   **Marketplace:** Launch Buyer Discovery UI with keyword search.
*   **Features:** Bulk token minting and secondary listing capability.
*   **Milestone:** First end-to-end crypto-paid API call.

### Phase 3: AI & Optimization (Months 5-6)
*   **AI SDK:** Release Python SDK for LangChain agents.
*   **Optimization:** Implement "Optimistic Verification" for <200ms latency.
*   **Audit:** Security audit of smart contracts.
*   **Launch:** Mainnet Public Launch.

### Phase 4: Decentralization (Months 7+)
*   **Infrastructure:** Migrate to dedicated Apix Subnet for gas optimization.
*   **UX:** Enable Account Abstraction (Gasless transactions) for smoother onboarding.
