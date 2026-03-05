# Apix Pivot Demo: Running Instructions

Follow these steps to run the complete Apix Pivot demonstration. You will need 2 separate terminal windows.

## 1. Start Demo Server (Node.js/Express)
This acts as the "Seller" API that uses the Apix SDK.
*Note: Ensure `apix-sdk-node` is built and installed if you have made changes to the SDK.*

**Terminal 1:**
```bash
cd demo/backend
npm install
npm run start
```
*Expected Output:* `Demo Server running at http://localhost:3000`

## 2. Start Frontend (React)
This is the demo UI to compare Free vs Paid usage.

**Terminal 2:**
```bash
cd demo/frontend
npm install
npm run dev
```
*Open your browser to:* `http://localhost:5173`

## 3. How to Test
1.  Open the frontend in your browser.
2.  **Stripe Payment (Left):** Click "Buy with Stripe".
    *   Simulates a Web2 payment flow.
    *   Sends a mock Stripe Token to `/stripe-product`.
    *   Returns the premium data.
3.  **Apix Payment (Right):** Click "Buy with Crypto".
    *   Simulates a Web3 payment flow.
    *   Sends a mock Tx Hash to `/apix-product`.
    *   Apix SDK verifies it directly against L1.
    *   Returns the **same** premium data via the middleware.
