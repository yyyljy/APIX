// Frontend API helpers aligned with current demo backend routes.

const BACKEND_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:3000";

const makeResponse = (status, payload) => ({
  status,
  ok: status >= 200 && status < 300,
  json: async () => payload,
});

const networkErrorResponse = (message) =>
  makeResponse(500, {
    success: false,
    error: { message },
    code: "network_error",
    retryable: true,
  });

export const loginUser = async (_walletAddress) => {
  // Legacy dashboard expects `json().success`; use health as lightweight liveness/auth placeholder.
  try {
    const res = await fetch(`${BACKEND_URL}/health`);
    const data = await res.json();
    return makeResponse(res.status, {
      success: res.status === 200 && data?.status === "ok",
      data,
    });
  } catch (error) {
    console.error("Network Error:", error);
    return networkErrorResponse("Backend connection failed");
  }
};

export const fetchProxyResource = async (_listingId, token = null) => {
  const headers = {};
  if (token) {
    headers.Authorization = token.startsWith("Apix ") ? token : `Apix ${token}`;
  }

  try {
    const res = await fetch(`${BACKEND_URL}/apix-product`, {
      method: "GET",
      headers,
    });

    const body = await res.json();

    if (res.status === 200) {
      return makeResponse(res.status, {
        success: true,
        data: {
          value: body?.id || "premium-access",
          message: body?.content || "Protected resource unlocked.",
        },
        proof: body?.proof,
        raw: body,
      });
    }

    if (res.status === 402) {
      return makeResponse(res.status, {
        success: false,
        error: {
          code: body?.code || "payment_required",
          message: body?.message || "Payment required",
          details: body?.details,
        },
      });
    }

    return makeResponse(res.status, {
      success: false,
      error: {
        code: body?.code || "request_failed",
        message: body?.message || `Request failed with status ${res.status}`,
        details: body,
      },
    });
  } catch (error) {
    console.error("Network Error:", error);
    return networkErrorResponse("Backend connection failed");
  }
};

export const verifyPayment = async (requestId, txHash) => {
  try {
    const res = await fetch(`${BACKEND_URL}/apix-product`, {
      method: "GET",
      headers: {
        Authorization: `Apix ${txHash}`,
        "PAYMENT-SIGNATURE": `tx_hash=${txHash}`,
        "X-Request-ID": requestId,
      },
    });

    const body = await res.json();

    if (res.status === 200) {
      return makeResponse(res.status, {
        success: true,
        data: {
          access_token: body?.proof,
        },
        raw: body,
      });
    }

    return makeResponse(res.status, {
      success: false,
      error: {
        code: body?.code || "verification_failed",
        message: body?.message || "Verification failed",
        retryable: body?.retryable ?? false,
        request_id: body?.request_id || requestId,
      },
    });
  } catch (error) {
    console.error("Network Error:", error);
    return networkErrorResponse("Backend verification failed");
  }
};

export const fetchHealth = async () => {
  return fetch(`${BACKEND_URL}/health`);
};

export const fetchMetrics = async () => {
  return fetch(`${BACKEND_URL}/metrics`);
};

export const fetchStripeProduct = async () => {
  try {
    const res = await fetch(`${BACKEND_URL}/stripe-product`, {
      headers: {
        Authorization: "Bearer stripe_session_abc123",
      },
    });
    const body = await res.json();
    return makeResponse(res.status, body);
  } catch (error) {
    console.error("Network Error:", error);
    return networkErrorResponse("Backend stripe request failed");
  }
};
