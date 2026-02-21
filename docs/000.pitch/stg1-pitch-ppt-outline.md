# APIX 2-Minute Pitch Deck Outline (PPT)

## Slide 1 — Title
**제목**
- APIX
- The Payment Layer for Autonomous APIs on Avalanche

**화면 문구(한 줄)**
- "Paying for digital value should be an API call, not a checkout flow."

**발표 메모**
- Hi judges, we’re [TEAM NAME].
- We built APIX.

---

## Slide 2 — Problem
**제목**
- The Problem: Payment breaks flow

**포인트**
- In-game and API economies are interrupted by redirects, subscriptions, and manual reconciliation.
- AI agents can’t use credit cards.
- Developers still verify payment-to-action linkage manually.

**발표 메모**
- Payments break immersion in games.
- AI agents need per-call, on-demand payment.

---

## Slide 3 — Solution
**제목**
- APIX: Payment as an API Primitive

**포인트**
- x402 middleware on HTTP
- 402 Payment Required -> signed retry flow
- Avalanche L1 receipt for cryptographic proof

**발표 메모**
- Drop-in middleware turns any endpoint into payment-aware API.

---

## Slide 4 — How it works
**제목**
- End-to-End Flow

**포인트(5단계)**
1. Player/Agent requests service (`/buy/sword`)
2. Server returns `402 Payment Required`
3. Client pays and retries with signed payload
4. APIX writes verifiable receipt on Avalanche
5. Backend verifies and unlocks instantly

**발표 메모**
- No response, no charge.
- No ambiguity between payment and action.

---

## Slide 5 — Target & Vision
**제목**
- Who We Serve / Why Now

**포인트**
- Target: Game studios, marketplaces, AI-agent builders
- Value: programmable, trust-minimized, low-friction payments
- Vision: a universal programmable payment rail for the machine economy

**발표 메모**
- Thank you and closing call.

---

## Suggested Design
- 비율: 16:9
- 톤: 다크 네이비 + 파랑 + 하이라이트 오렌지
- 폰트: 제목 `Montserrat`, 본문 `Pretendard`
- 각 슬라이드 12~15초, 총 2분
