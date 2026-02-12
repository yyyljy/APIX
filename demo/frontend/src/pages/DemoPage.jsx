import React, { useState } from "react";
import PaymentModal from "../components/PaymentModal";

const parsePaymentRequired = (encodedHeader, bodyDetails) => {
  if (bodyDetails) return bodyDetails;
  if (!encodedHeader) return null;
  try {
    const decoded = atob(encodedHeader);
    const parsed = JSON.parse(decoded);
    return {
      request_id: parsed.request_id,
      chain_id: parsed.chain_id,
      network: parsed.network,
      payment_info: parsed.payment_info,
    };
  } catch (_err) {
    return null;
  }
};

const DemoPage = () => {
  const [stripeResult, setStripeResult] = useState(null);
  const [apixResult, setApixResult] = useState(null);
  const [showStripeModal, setShowStripeModal] = useState(false);
  const [isProcessingStripe, setIsProcessingStripe] = useState(false);

  const [showApixModal, setShowApixModal] = useState(false);
  const [isProcessingApix, setIsProcessingApix] = useState(false);
  const [paymentDetails, setPaymentDetails] = useState(null);

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
      const mockStripeToken = "Bearer stripe_session_abc123";
      const res = await fetch("http://localhost:3000/stripe-product", {
        headers: {
          Authorization: mockStripeToken,
        },
      });
      const data = await res.json();
      setStripeResult(JSON.stringify(data, null, 2));
    } catch (err) {
      setStripeResult("Error: " + err.message);
    }
  };

  const initiateApixFlow = async () => {
    try {
      setApixResult("1. Requesting protected resource...");
      const res = await fetch("http://localhost:3000/apix-product");

      if (res.status === 402) {
        const errorData = await res.json();
        const paymentRequiredHeader =
          res.headers.get("PAYMENT-REQUIRED") ||
          res.headers.get("payment-required");
        const details = parsePaymentRequired(
          paymentRequiredHeader,
          errorData?.details,
        );
        if (!details) {
          setApixResult("Payment challenge parse failed.");
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

        setApixResult(
          `2. Received 402 Payment Required\n` +
            `Amount: ${details.payment_info.amount} ${details.payment_info.currency}\n` +
            `Recipient: ${details.payment_info.recipient}\n\n` +
            "3. Awaiting wallet confirmation...",
        );

        setShowApixModal(true);
      } else {
        const data = await res.json();
        setApixResult(JSON.stringify(data, null, 2));
      }
    } catch (err) {
      setApixResult("Error: " + err.message);
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

    setApixResult(
      (prev) =>
        `${prev}\n\n4. Payment sent\nTxHash: ${mockTxHash}\n5. Verifying...`,
    );

    try {
      const res = await fetch("http://localhost:3000/apix-product", {
        headers: {
          "PAYMENT-SIGNATURE": `tx_hash=${mockTxHash}`,
          Authorization: `Apix ${mockTxHash}`,
        },
      });

      const data = await res.json();
      setShowApixModal(false);
      setIsProcessingApix(false);
      setApixResult(JSON.stringify(data, null, 2));
    } catch (err) {
      setApixResult((prev) => `${prev}\n\nVerification failed: ${err.message}`);
      setIsProcessingApix(false);
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
              API Response
            </p>
            <pre className="response-box">
              {stripeResult || "Waiting for transaction..."}
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
              API Response
            </p>
            <pre className="response-box">
              {apixResult || "Waiting for transaction..."}
            </pre>
          </div>
        </article>
      </section>
    </div>
  );
};

export default DemoPage;
