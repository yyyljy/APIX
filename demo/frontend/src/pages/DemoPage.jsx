import React, { useState } from "react";
import PaymentModal from "../components/PaymentModal";
import {
  fetchProxyResource,
  fetchStripeProduct,
  verifyPayment,
} from "../utils/api";
import { createTransaction, updateTransaction } from "../utils/transactions";

const DemoPage = () => {
  const [stripeResult, setStripeResult] = useState(null);
  const [apixTrace, setApixTrace] = useState(null);
  const [apixRaw, setApixRaw] = useState(null);
  const [showStripeModal, setShowStripeModal] = useState(false);
  const [isProcessingStripe, setIsProcessingStripe] = useState(false);

  const [showApixModal, setShowApixModal] = useState(false);
  const [isProcessingApix, setIsProcessingApix] = useState(false);
  const [paymentDetails, setPaymentDetails] = useState(null);
  const [pendingApixTxnId, setPendingApixTxnId] = useState(null);

  const summarizePayload = (payload, status) => {
    if (!payload) return "No payload";
    const lines = [];
    if (typeof status === "number") lines.push(`status: ${status}`);
    if (typeof payload.success === "boolean") lines.push(`success: ${payload.success}`);
    if (payload?.error?.code) lines.push(`code: ${payload.error.code}`);
    if (payload?.error?.request_id) lines.push(`request_id: ${payload.error.request_id}`);
    if (payload?.raw?.proof || payload?.proof || payload?.data?.access_token) {
      const token = payload?.raw?.proof || payload?.proof || payload?.data?.access_token;
      lines.push(`proof: ${String(token).slice(0, 24)}...`);
    }
    if (payload?.raw?.method || payload?.method) lines.push(`method: ${payload?.raw?.method || payload?.method}`);
    if (payload?.error?.message) lines.push(`message: ${payload.error.message}`);
    return lines.join("\n") || "No summary fields";
  };

  const handleStripeClick = () => {
    setShowStripeModal(true);
  };

  const confirmStripePayment = async () => {
    setIsProcessingStripe(true);
    await new Promise((resolve) => setTimeout(resolve, 1500));
    setShowStripeModal(false);
    setIsProcessingStripe(false);
    callStripeApi();
  };

  const callStripeApi = async () => {
    try {
      const res = await fetchStripeProduct();
      const data = await res.json();
      createTransaction({
        rail: "stripe",
        status: res.status >= 200 && res.status < 300 ? "success" : "failed",
        requestId: data?.request_id || null,
        message: data?.message || (res.status >= 200 && res.status < 300 ? "Stripe flow completed" : "Stripe flow failed"),
        data: res.status >= 200 && res.status < 300 ? data : null,
      });
      setStripeResult({
        summary: summarizePayload(data, res.status),
        raw: data,
      });
    } catch (err) {
      createTransaction({
        rail: "stripe",
        status: "failed",
        message: err.message || "Stripe request failed",
      });
      setStripeResult({
        summary: "Error: " + err.message,
        raw: null,
      });
    }
  };

  const initiateApixFlow = async () => {
    try {
      setApixRaw(null);
      setApixTrace("1. Requesting protected resource...");
      const res = await fetchProxyResource("listing_001");
      const payload = await res.json();

      if (res.status === 402) {
        const details = payload?.error?.details || payload?.details;
        if (!details) {
          setApixTrace("Payment challenge parse failed.");
          setApixRaw(payload);
          return;
        }

        setPaymentDetails({
          amount: details.payment_info.amount,
          amountWei: details.payment_info.amount_wei,
          currency: details.payment_info.currency,
          recipient: details.payment_info.recipient,
          requestId: details.request_id,
          chainId: details.chain_id,
          network: details.network,
        });
        const pendingTx = createTransaction({
          rail: "apix",
          status: "pending",
          requestId: details.request_id,
          message: "Payment challenge received",
        });
        setPendingApixTxnId(pendingTx.id);

        setApixTrace(
          `2. Received 402 Payment Required\n` +
            `Amount: ${details.payment_info.amount} ${details.payment_info.currency}\n` +
            `Recipient: ${details.payment_info.recipient}\n\n` +
            "3. Awaiting wallet confirmation...",
        );

        setShowApixModal(true);
      } else {
        setApixTrace("Completed without payment challenge.");
        setApixRaw(payload);
      }
    } catch (err) {
      setApixTrace("Error: " + err.message);
      setApixRaw(null);
    }
  };

  const confirmApixPayment = async () => {
    if (!paymentDetails) return;

    setIsProcessingApix(true);
    await new Promise((resolve) => setTimeout(resolve, 2000));

    const mockTxHash =
      "0x" +
      Array(64)
        .fill(0)
        .map(() => Math.floor(Math.random() * 16).toString(16))
        .join("");

    setApixTrace(
      (prev) =>
        `${prev}\n\n4. Payment sent\nTxHash: ${mockTxHash}\n5. Verifying...`,
    );

    try {
      const verifyRes = await verifyPayment(paymentDetails.requestId, mockTxHash);
      const verifyData = await verifyRes.json();
      if (!verifyData?.success || !verifyData?.data?.access_token) {
        if (pendingApixTxnId) {
          updateTransaction(pendingApixTxnId, {
            status: "failed",
            txHash: mockTxHash,
            requestId: paymentDetails.requestId,
            message: verifyData?.error?.message || "Verification failed",
          });
        }
        setApixRaw(verifyData);
        setApixTrace(
          (prev) =>
            `${prev}\n\nVerification failed: ${verifyData?.error?.message || "Unknown error"}`,
        );
        setIsProcessingApix(false);
        return;
      }

      const dataRes = await fetchProxyResource("listing_001", verifyData.data.access_token);
      const data = await dataRes.json();
      if (pendingApixTxnId) {
        updateTransaction(pendingApixTxnId, {
          status: dataRes.status >= 200 && dataRes.status < 300 ? "success" : "failed",
          txHash: mockTxHash,
          requestId: paymentDetails.requestId,
          message: dataRes.status >= 200 && dataRes.status < 300
            ? "Payment and data access completed"
            : "Data access failed after verification",
          data: dataRes.status >= 200 && dataRes.status < 300 ? data : null,
        });
      }

      setShowApixModal(false);
      setIsProcessingApix(false);
      setPendingApixTxnId(null);
      setApixRaw({
        verify: verifyData,
        access: data,
      });
      setApixTrace((prev) => `${prev}\n\n6. Access granted.`);
    } catch (err) {
      if (pendingApixTxnId) {
        updateTransaction(pendingApixTxnId, {
          status: "failed",
          txHash: mockTxHash,
          requestId: paymentDetails?.requestId || null,
          message: err.message || "Verification failed",
        });
      }
      setApixTrace((prev) => `${prev}\n\nVerification failed: ${err.message}`);
      setApixRaw(null);
      setIsProcessingApix(false);
      setPendingApixTxnId(null);
    }
  };

  return (
    <div className="space-y-6">
      {showStripeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm">
          <div className="panel-strong w-full max-w-md overflow-hidden bg-white">
            <div className="border-b border-slate-200 bg-slate-900 px-5 py-4 text-white">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold">Secure Card Checkout</h3>
                <button
                  onClick={() => setShowStripeModal(false)}
                  className="rounded-md p-1 text-white/80 transition hover:bg-white/10 hover:text-white"
                >
                  x
                </button>
              </div>
              <p className="mt-1 text-xs text-slate-300">
                Mock Stripe Session Validation
              </p>
            </div>

            <div className="space-y-4 p-5">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">Product</span>
                  <span className="font-semibold text-slate-900">
                    High-Value Insight
                  </span>
                </div>
                <div className="mt-1 flex items-center justify-between text-sm">
                  <span className="text-slate-500">Total</span>
                  <span className="font-bold text-slate-900">$10.00</span>
                </div>
              </div>

              <div className="space-y-3 text-sm">
                <input
                  type="email"
                  placeholder="user@company.com"
                  className="w-full rounded-xl border border-slate-300 px-3 py-2.5 outline-none ring-0 transition focus:border-slate-500"
                />
                <input
                  type="text"
                  placeholder="4242 4242 4242 4242"
                  className="w-full rounded-xl border border-slate-300 px-3 py-2.5 outline-none ring-0 transition focus:border-slate-500"
                />
                <div className="grid grid-cols-2 gap-3">
                  <input
                    type="text"
                    placeholder="MM / YY"
                    className="rounded-xl border border-slate-300 px-3 py-2.5 outline-none ring-0 transition focus:border-slate-500"
                  />
                  <input
                    type="text"
                    placeholder="CVC"
                    className="rounded-xl border border-slate-300 px-3 py-2.5 outline-none ring-0 transition focus:border-slate-500"
                  />
                </div>
              </div>

              <button
                onClick={confirmStripePayment}
                disabled={isProcessingStripe}
                className="btn btn-secondary w-full disabled:opacity-70"
              >
                {isProcessingStripe ? "Processing..." : "Pay $10.00"}
              </button>
            </div>
          </div>
        </div>
      )}

      <PaymentModal
        isOpen={showApixModal}
        onClose={() => setShowApixModal(false)}
        onConfirm={confirmApixPayment}
        paymentDetails={paymentDetails}
        isProcessing={isProcessingApix}
      />

      <section className="panel p-5 reveal md:p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="mt-3 text-2xl font-extrabold tracking-tight text-slate-900 md:text-3xl">
              Compare Payment Authentication Rails
            </h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-600 md:text-base">
              Both endpoints return the exact same premium resource. Only the
              payment proof and verification middleware differ.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-slate-500">Network</p>
              <p className="font-bold text-slate-900">Avalanche C-Chain</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-slate-500">Pricing Unit</p>
              <p className="font-bold text-slate-900">$10 / 10 AVAX</p>
            </div>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <article className="panel-strong reveal reveal-delay-1 p-5 md:p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-extrabold text-slate-900">
                Traditional Payment
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Card session token validation (Web2)
              </p>
            </div>
            <span className="badge">Stripe-like</span>
          </div>

          <ol className="mt-4 space-y-2 text-sm text-slate-700">
            <li>1. User completes card checkout.</li>
            <li>2. Client sends bearer session token.</li>
            <li>3. Backend validates token and returns resource.</li>
          </ol>

          <button
            onClick={handleStripeClick}
            className="btn btn-secondary mt-5 w-full"
          >
            Buy with Card ($10)
          </button>

          <div className="mt-5">
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
              Summary
            </p>
            <pre className="response-box">
              {stripeResult?.summary || "Waiting for transaction..."}
            </pre>
            <p className="mb-2 mt-3 text-xs font-bold uppercase tracking-wide text-slate-500">
              Raw Payload
            </p>
            <pre className="response-box">
              {stripeResult?.raw
                ? JSON.stringify(stripeResult.raw, null, 2)
                : "Raw payload will appear here."}
            </pre>
          </div>
        </article>

        <article className="panel-strong reveal reveal-delay-2 p-5 md:p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-extrabold text-slate-900">
                Web3 x402 Payment
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                402 challenge-response with tx proof
              </p>
            </div>
            <span className="badge badge-success">APIX SDK</span>
          </div>

          <ol className="mt-4 space-y-2 text-sm text-slate-700">
            <li>1. Resource request returns HTTP 402 challenge.</li>
            <li>2. Wallet sends payment and receives tx hash.</li>
            <li>3. Backend verifies proof and issues access.</li>
          </ol>

          <button
            onClick={initiateApixFlow}
            className="btn btn-primary mt-5 w-full"
          >
            Buy with Crypto (10 AVAX)
          </button>

          <div className="mt-5">
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
              Flow Trace
            </p>
            <pre className="response-box">
              {apixTrace || "Waiting for transaction..."}
            </pre>
            <p className="mb-2 mt-3 text-xs font-bold uppercase tracking-wide text-slate-500">
              Raw Payload
            </p>
            <pre className="response-box">
              {apixRaw ? JSON.stringify(apixRaw, null, 2) : "Raw payload will appear here."}
            </pre>
          </div>
        </article>
      </section>
    </div>
  );
};

export default DemoPage;


