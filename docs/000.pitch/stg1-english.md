# APIX 2-Minute Pitch Script (English)

## 2-Minute Pitch Script

**[0:00–0:15]**
Hi judges, we’re **[TEAM NAME]**.
We built **APIX**.

**APIX** is a payment SDK on **Avalanche L1** that makes APIs accept stablecoin payments directly over HTTP using the **x402 standard**, with a verifiable receipt trail.
Our idea is simple:
"Payments should be API calls, and proof should be on-chain."

**[0:15–0:40]**
Today, payments still break digital flows.
In games, players get interrupted by redirects and platform-dependent checkouts.
AI agents also can’t use credit cards or subscriptions, so they’re forced into rigid access models.
Teams end up manually reconciling whether each payment truly maps to the delivered action.

**[0:40–1:10]**
**APIX fixes this.**
Developers add middleware to their server and their APIs become x402-ready.
When a client calls `/buy/sword`, the server returns **402 Payment Required**.
The client pays, then retries with a signed payload.
APIX writes a receipt on Avalanche that includes payer, amount, item, and nonce.

**[1:10–1:40]**
Our backend verifies this deterministically and unlocks the item instantly.
If the response fails, no charge is made.
There is no mismatch between on-chain transfer and real delivery.
No separate manual settlement system is required.

**[1:40–2:00]**
Our targets are game studios, digital asset marketplaces, and AI-agent builders.
In games, payment and in-game delivery stay aligned.
In AI, value can be consumed per call, in real time.
APIX redefines payment as a first-class programmable service unit, not just movement of funds.
Thank you.
