// Frontend API helpers aligned with current demo backend routes.

const BACKEND_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:3000";

const ERROR_TONE_FALLBACK = {
  cors_origin_not_allowed: {
    status: 403,
    message: "Origin is not allowed by CORS policy.",
    retryable: false,
  },
  method_not_allowed: {
    status: 405,
    message: "Method not allowed.",
    retryable: false,
  },
  invalid_request: {
    status: 400,
    message: "Invalid request.",
    retryable: false,
  },
  invalid_request_body: {
    status: 400,
    message: "Invalid request body.",
    retryable: false,
  },
  missing_tx_hash: {
    status: 400,
    message: "Transaction hash is missing.",
    retryable: false,
  },
  tx_hash_already_used: {
    status: 403,
    message: "Transaction hash already used by another request.",
    retryable: false,
  },
  verification_failed: {
    status: 403,
    message: "Verification failed.",
    retryable: true,
  },
  signing_error: {
    status: 500,
    message: "Internal server error.",
    retryable: true,
  },
  facilitator_unreachable: {
    status: 503,
    message: "Failed to connect to Apix Cloud.",
    retryable: true,
  },
  invalid_cloud_token: {
    status: 403,
    message: "Invalid token from Cloud.",
    retryable: false,
  },
  payment_required: {
    status: 402,
    message: "Payment required to access this resource.",
    retryable: false,
  },
  invalid_apix_session: {
    status: 403,
    message: "Invalid or expired payment session.",
    retryable: false,
  },
  session_not_found: {
    status: 403,
    message: "Session token not found or expired.",
    retryable: false,
  },
  apix_verification_failed: {
    status: 403,
    message: "Apix verification failed.",
    retryable: false,
  },
  session_request_in_progress: {
    status: 409,
    message: "Session request is already being processed. Retry after a short delay.",
    retryable: true,
  },
  session_quota_exceeded: {
    status: 402,
    message: "Session quota exceeded.",
    retryable: false,
  },
  session_start_failed: {
    status: 403,
    message: "Failed to start the session request.",
    retryable: false,
  },
  session_state_unavailable: {
    status: 503,
    message: "Session state service is temporarily unavailable.",
    retryable: true,
  },
  request_failed: {
    status: 400,
    message: "Request failed.",
    retryable: false,
  },
};

const normalizeErrorPayload = (raw, status, override = {}) => {
  const code = override.code || raw?.code || (status === 402 ? "payment_required" : "request_failed");
  const tone = ERROR_TONE_FALLBACK[code] || {
    status,
    message: "Request failed.",
    retryable: status >= 500,
  };
  return {
    code,
    message: override.message || raw?.message || tone.message,
    retryable: override.retryable ?? raw?.retryable ?? tone.retryable ?? false,
    request_id: raw?.request_id || raw?.requestId || override.requestId || null,
    status: tone.status,
    details: raw?.details || raw?.error?.details || null,
  };
};

export const ERROR_RESPONSE_SNAPSHOTS = {
  payment_required: {
    status: 402,
    code: "payment_required",
    message: ERROR_TONE_FALLBACK.payment_required.message,
    retryable: false,
  },
  session_request_in_progress: {
    status: 409,
    code: "session_request_in_progress",
    message: ERROR_TONE_FALLBACK.session_request_in_progress.message,
    retryable: true,
  },
  session_not_found: {
    status: 403,
    code: "session_not_found",
    message: ERROR_TONE_FALLBACK.session_not_found.message,
    retryable: false,
  },
  session_quota_exceeded: {
    status: 402,
    code: "session_quota_exceeded",
    message: ERROR_TONE_FALLBACK.session_quota_exceeded.message,
    retryable: false,
  },
  session_state_unavailable: {
    status: 503,
    code: "session_state_unavailable",
    message: ERROR_TONE_FALLBACK.session_state_unavailable.message,
    retryable: true,
  },
  apix_verification_failed: {
    status: 403,
    code: "apix_verification_failed",
    message: ERROR_TONE_FALLBACK.apix_verification_failed.message,
    retryable: false,
  },
  invalid_cloud_token: {
    status: 403,
    code: "invalid_cloud_token",
    message: ERROR_TONE_FALLBACK.invalid_cloud_token.message,
    retryable: false,
  },
};

export const getErrorSnapshot = (code, extras = {}) => {
  const base = ERROR_RESPONSE_SNAPSHOTS[code] || ERROR_RESPONSE_SNAPSHOTS.payment_required;
  return {
    ...base,
    ...extras,
  };
};

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

    const normalized = normalizeErrorPayload(body, res.status);

    return makeResponse(res.status, {
      success: false,
      error: normalized,
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

    const normalized = normalizeErrorPayload(body, res.status, { requestId });

    return makeResponse(res.status, {
      success: false,
      error: normalized,
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
