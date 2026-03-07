import React, { useEffect, useRef, useState } from "react";
import PaymentModal from "../components/PaymentModal";
import { ethers } from "ethers";
import {
  fetchProxyResource,
  fetchStripeProduct,
  getErrorSnapshot,
  verifyPayment,
} from "../utils/api";
import { ensureWalletChain, getPaymentNetwork, getPreferredWalletProvider } from "../utils/chain";
import { createTransaction, updateTransaction } from "../utils/transactions";

// Demo page controller for Stripe and APIX payment demonstration flows.
// DemoPage: helper function.
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
  const [clientType, setClientType] = useState("human");
  const [agentTxHash, setAgentTxHash] = useState("");
  const [toastMessage, setToastMessage] = useState("");
  const [toastType, setToastType] = useState("info");
  const toastTimerRef = useRef(null);
  const paymentFlowRef = useRef(0);
  const paymentPriceLabel = paymentDetails
    ? `${paymentDetails.amount} ${paymentDetails.currency}`
    : "0.1 APIX";

// showToast: helper function.
  const showToast = (message, type = "info") => {
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }
    setToastMessage(message);
    setToastType(type);
    toastTimerRef.current = setTimeout(() => {
      setToastMessage("");
      toastTimerRef.current = null;
    }, 5000);
  };

  // Parse a timeout-safe positive integer with fallback when parsing fails.
// normalizePositiveInt: helper function.
const normalizePositiveInt = (value, fallback) => {
    const parsed = Number.parseInt(String(value).trim(), 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return fallback;
    }
    return parsed;
  };

  // Wrap async work with a timeout so popup dismissals cannot hang the payment flow.
// runWithTimeout: helper function.
const runWithTimeout = (promise, timeoutMs, timeoutMessage) => {
    const ms = normalizePositiveInt(timeoutMs, 30000);
    return new Promise((resolve, reject) => {
      const timerId = setTimeout(() => {
        reject(new Error(timeoutMessage || `Wallet request timed out after ${ms}ms`));
      }, ms);
      promise
        .then((value) => {
          clearTimeout(timerId);
          resolve(value);
        })
        .catch((error) => {
          clearTimeout(timerId);
          reject(error);
        });
    });
  };

  // Mark flow failure and finalize UI + transaction state in one place.
// markFlowFailed: helper function.
const markFlowFailed = (flowId, message = "Payment failed") => {
    if (flowId !== paymentFlowRef.current) {
      return;
    }
    if (pendingApixTxnId) {
      updateTransaction(pendingApixTxnId, {
        status: "failed",
        txHash: null,
        requestId: paymentDetails?.requestId || null,
        message,
      });
    }
    setApixTrace((prev) => `${prev}\n\nWallet payment failed: ${message}`);
    showToast(`Wallet payment failed: ${message}`, "error");
    setApixRaw(null);
    setIsProcessingApix(false);
    setPendingApixTxnId(null);
    setShowApixModal(false);
  };

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

// summarizePayload: helper function.
  const summarizePayload = (payload, status) => {
    if (!payload) return "No payload";
    const lines = [];
    if (typeof status === "number") lines.push(`status: ${status}`);
    if (typeof payload.success === "boolean") lines.push(`success: ${payload.success}`);
    const error = payload?.error || {};
    if (payload?.error?.code) lines.push(`code: ${payload.error.code}`);
    if (payload?.error?.request_id) lines.push(`request_id: ${payload.error.request_id}`);
    if (payload?.raw?.proof || payload?.proof || payload?.data?.access_token) {
      const token = payload?.raw?.proof || payload?.proof || payload?.data?.access_token;
      lines.push(`proof: ${String(token).slice(0, 24)}...`);
    }
    if (payload?.raw?.method || payload?.method) lines.push(`method: ${payload?.raw?.method || payload?.method}`);
    if (typeof error.retryable === "boolean") lines.push(`retryable: ${error.retryable}`);
    if (payload?.error?.message) lines.push(`message: ${payload.error.message}`);
    return lines.join("\n") || "No summary fields";
  };

  // Open Stripe mock modal.
// handleStripeClick: helper function.
const handleStripeClick = () => {
    setShowStripeModal(true);
  };

  // Simulate Stripe completion and then fetch protected data via Stripe route.
// confirmStripePayment: helper function.
const confirmStripePayment = async () => {
    setIsProcessingStripe(true);
    await new Promise((resolve) => setTimeout(resolve, 1500));
    setShowStripeModal(false);
    setIsProcessingStripe(false);
    callStripeApi();
  };

  // Call Stripe-like sample API and persist transaction status.
// callStripeApi: helper function.
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

  // Start APIX flow and handle 402 challenge by showing the selected mode.
// initiateApixFlow: helper function.
const initiateApixFlow = async () => {
    try {
      setApixRaw(null);
      setApixTrace("1. Requesting protected resource...");
      const res = await fetchProxyResource("listing_001", null, clientType);
      const payload = await res.json();



      if (res.status === 402) {
        const details = payload?.error?.details || payload?.details;
        if (!details) {
          const snapshot = getErrorSnapshot("payment_required", {
            status: res.status,
            request_id: payload?.error?.request_id || null,
          });
          const normalized = { ...payload, error: { ...snapshot, ...(payload?.error || {}) } };
          setShowApixModal(false);
          showToast(`Payment required (402) received for ${clientType} mode.`, "warning");
          setApixTrace(
            `2. Received 402 Payment Required\n${summarizePayload(normalized, res.status)}`
          );
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

        const hint = details.payment_hint?.required_action || "";
        const modeLabel = clientType === "agent" ? "agent" : "human";
        const fallbackModeMsg = details.payment_hint?.verification_hint || "Awaiting confirmation...";

        setApixTrace(
          `2. Received 402 Payment Required\n` +
            `Amount: ${details.payment_info.amount} ${details.payment_info.currency}\n` +
            `Recipient: ${details.payment_info.recipient}\n\n` +
            `3. Selected client mode: ${modeLabel}\n` +
            `${hint ? `Hint: ${hint}` : "Awaiting confirmation..."}`,
        );



        if (clientType === "human") {
          setShowApixModal(true);
          showToast("Human mode: wallet modal opened for on-chain payment.", "info");
        } else {
          setShowApixModal(false);
          showToast(`Agent mode: ${fallbackModeMsg}`, "warning");
        }
      } else {
        setApixTrace("Completed without payment challenge.");
        setApixRaw(payload);
        setShowApixModal(false);
      }
    } catch (err) {
      setApixTrace("Error: " + err.message);
      setApixRaw(null);
    }
  };

  // Execute wallet chain setup + send tx for human payment flow.
// confirmApixPayment: helper function.
const confirmApixPayment = async () => {
    if (!paymentDetails) return;
    if (isProcessingApix) return;

    const flowId = paymentFlowRef.current + 1;
    paymentFlowRef.current = flowId;

    try {
      setIsProcessingApix(true);
      await new Promise((resolve) => setTimeout(resolve, 2000));
      const networkLabel = getPaymentNetwork(paymentDetails);
      setApixTrace((prev) => `${prev}\n\n4. Ensuring wallet network: ${networkLabel}`);
      const { provider, source } = getPreferredWalletProvider();
      setApixTrace((prev) => `${prev}\n\n4-1. Using wallet provider: ${source}`);
      await runWithTimeout(
        ensureWalletChain(paymentDetails, provider),
        import.meta.env.VITE_APIX_WALLET_SETUP_TIMEOUT_MS,
        "Wallet setup timed out. The popup may have been dismissed."
      );
      if (flowId !== paymentFlowRef.current) return;

      const browserProvider = new ethers.BrowserProvider(provider);
      const signer = await browserProvider.getSigner();
      const txResponse = await runWithTimeout(
        signer.sendTransaction({
          to: paymentDetails.recipient,
          value: paymentDetails.amountWei,
        }),
        import.meta.env.VITE_APIX_WALLET_SIGN_TIMEOUT_MS,
        "Wallet transaction confirmation timed out. The popup may have been closed."
      );
      if (flowId !== paymentFlowRef.current) return;
      await verifyApixTransaction(txResponse.hash, flowId);
      if (flowId !== paymentFlowRef.current) return;
    } catch (err) {
      if (flowId !== paymentFlowRef.current) {
        return;
      }
      markFlowFailed(flowId, err?.message || "Payment failed");
    } finally {
      if (flowId === paymentFlowRef.current) {
        setIsProcessingApix(false);
      }
    }
  };


  // Verify tx hash or existing hash payload to obtain APIX access token.
  // verifyApixTransaction: helper function.
  const verifyApixTransaction = async (txHash, flowId = paymentFlowRef.current) => {
    if (!paymentDetails || flowId !== paymentFlowRef.current) return;

    const delayMsList = [0, 1000, 2000, 4000];
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const shouldRetry = (error, attemptIndex) => {
      if (attemptIndex >= delayMsList.length - 1) {
        return false;
      }

      if (error?.retryable === true || error?.status === 409) {
        return true;
      }

      const code = String(error?.code || "").toLowerCase();
      const message = String(error?.message || "").toLowerCase();
      return code === "verification_failed" && message.includes("latest block is behind transaction block");
    };

    let lastFailure = {
      code: "verification_failed",
      message: "Verification failed",
      retryable: false,
      request_id: null,
      status: 403,
    };

    setIsProcessingApix(true);
    setApixTrace((prev) =>
      `${prev}\n\n4. Payment hash: ${txHash}\n5. Verifying...`,
    );

    try {
      for (let attemptIndex = 0; attemptIndex < delayMsList.length; attemptIndex++) {
        if (attemptIndex > 0) {
          const delayMs = delayMsList[attemptIndex];
          setApixTrace((prev) => `${prev}\n\n5. Retrying in ${delayMs / 1000}s ...`);
          await wait(delayMs);
        }

        if (flowId !== paymentFlowRef.current) return;

        const verifyRes = await verifyPayment(paymentDetails.requestId, txHash, clientType);
        const verifyData = await verifyRes.json();
        if (flowId !== paymentFlowRef.current) return;

        if (verifyRes.status === 200 && verifyData?.success && verifyData?.data?.access_token) {
          const dataRes = await fetchProxyResource("listing_001", verifyData.data.access_token, clientType);
          const data = await dataRes.json();
          if (flowId !== paymentFlowRef.current) return;

          if (pendingApixTxnId) {
            updateTransaction(pendingApixTxnId, {
              status: dataRes.status >= 200 && dataRes.status < 300 ? "success" : "failed",
              txHash,
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
          showToast("Payment verified and access granted.", "success");
          setAgentTxHash("");
          return;
        }

        const errorPayload = verifyData?.error || {};
        lastFailure = {
          code: errorPayload?.code || verifyData?.code || "verification_failed",
          message: errorPayload?.message || verifyData?.message || "Verification failed",
          retryable: Boolean(errorPayload?.retryable),
          request_id: verifyData?.request_id || verifyData?.requestId || paymentDetails.requestId,
          status: verifyData?.status || verifyRes.status || 403,
        };

        setApixRaw({
          success: false,
          error: {
            code: lastFailure.code,
            message: lastFailure.message,
            retryable: lastFailure.retryable,
            request_id: lastFailure.request_id,
            status: lastFailure.status,
            details: verifyData?.details || errorPayload?.details || null,
          },
        });

        if (!shouldRetry(errorPayload, attemptIndex)) {
          break;
        }
      }

      if (pendingApixTxnId) {
        updateTransaction(pendingApixTxnId, {
          status: "failed",
          txHash,
          requestId: paymentDetails.requestId,
          message: `${lastFailure.code}: ${lastFailure.message}` + (lastFailure.retryable ? " (retryable)" : ""),
        });
      }

      setApixTrace(
        (prev) =>
          `${prev}\n\nVerification failed: ${lastFailure.code}\n${lastFailure.message}`
          + (lastFailure.retryable ? "\nRetry with a new tx hash." : "")
      );
      showToast(`Verification failed: ${lastFailure.code}`, "error");
      setPendingApixTxnId(null);
      return;
    } catch (err) {
      if (pendingApixTxnId) {
        updateTransaction(pendingApixTxnId, {
          status: "failed",
          txHash: null,
          requestId: paymentDetails?.requestId || null,
          message: err.message || "Verification failed",
        });
      }
      setApixTrace((prev) => `${prev}\n\nVerification failed: ${err.message}`);
      setApixRaw(null);
      setIsProcessingApix(false);
      setPendingApixTxnId(null);
      showToast(`Verification failed: ${err.message}`, "error");
    } finally {
      if (flowId === paymentFlowRef.current) {
        setIsProcessingApix(false);
      }
    }
  };

  // Cancel current payment flow and update status immediately.

  // Cancel current payment flow and update status immediately.
// cancelApixPayment: helper function.
const cancelApixPayment = () => {
    paymentFlowRef.current += 1;
    const currentTxnId = pendingApixTxnId;

    setShowApixModal(false);
    setIsProcessingApix(false);
    setPendingApixTxnId(null);
    if (currentTxnId) {
      updateTransaction(currentTxnId, {
        status: "failed",
        txHash: null,
        requestId: paymentDetails?.requestId || null,
        message: "Payment flow canceled by user.",
      });
    }

    setApixTrace((prev) => `${prev}\n\n4-2. Payment flow was canceled by user.`);
    showToast("Wallet payment flow canceled.", "warning");
  };

  const toastClassName = toastType === "success"
    ? "bg-green-600"
    : toastType === "warning"
      ? "bg-amber-500"
      : toastType === "error"
        ? "bg-red-600"
        : "bg-slate-900";

// verifyTxFromAgent: helper function.
  const verifyTxFromAgent = async () => {
    // Verify tx hash submitted manually in agent mode.
    if (!paymentDetails || !agentTxHash) return;
    await verifyApixTransaction(agentTxHash);
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
        onClose={cancelApixPayment}
        onConfirm={confirmApixPayment}
        paymentDetails={paymentDetails}
        isProcessing={isProcessingApix}
      />

      {toastMessage ? (
        <div className={`fixed right-5 top-5 z-50 rounded-lg px-4 py-3 text-sm font-medium text-white shadow-lg transition-all duration-300 ${toastClassName}`}>
          <div className="flex items-start gap-3">
            <span>{toastMessage}</span>
            <button
              type="button"
              className="text-white/80 transition hover:text-white"
              onClick={() => {
                setToastMessage("");
                if (toastTimerRef.current) {
                  clearTimeout(toastTimerRef.current);
                  toastTimerRef.current = null;
                }
              }}
            >
              ×
            </button>
          </div>
        </div>
      ) : null}

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
          <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1">
            <button
              type="button"
              onClick={() => setClientType("human")}
              className={`rounded-md px-3 py-2 text-sm font-semibold transition ${clientType === "human"
                ? "bg-slate-900 text-white"
                : "text-slate-600 hover:bg-slate-100"
                }`}
            >
              Human Wallet
            </button>
            <button
              type="button"
              onClick={() => setClientType("agent")}
              className={`rounded-md px-3 py-2 text-sm font-semibold transition ${clientType === "agent"
                ? "bg-slate-900 text-white"
                : "text-slate-600 hover:bg-slate-100"
                }`}
            >
              Agent
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-slate-500">Client Type</p>
              <p className="font-bold text-slate-900">{clientType}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-slate-500">Network</p>
              <p className="font-bold text-slate-900">Avalanche C-Chain</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-slate-500">Pricing Unit</p>
              <p className="font-bold text-slate-900">{paymentPriceLabel}</p>
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
            {`Buy with Crypto (${paymentPriceLabel})`}
          </button>

          <div className="mt-5">
            {clientType === "agent" && paymentDetails ? (
              <div className="space-y-2">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                  Agent Path
                </p>
                <p className="mb-2 text-xs text-slate-600">
                  Submit an external agent tx hash and call verify.
                </p>
                <div className="flex items-center gap-2">
                  <input
                    value={agentTxHash}
                    onChange={(event) => setAgentTxHash(event.target.value)}
                    placeholder="0x...tx_hash"
                    className="flex-1 rounded-xl border border-slate-300 px-3 py-2.5 outline-none ring-0 transition focus:border-slate-500"
                  />
                  <button
                    onClick={verifyTxFromAgent}
                    disabled={!agentTxHash || isProcessingApix}
                    className="btn btn-secondary disabled:opacity-70"
                  >
                    Verify Tx Hash
                  </button>
                </div>
              </div>
            ) : null}

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
