"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.app = void 0;
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const apix_sdk_node_1 = require("apix-sdk-node");
const crypto_1 = __importDefault(require("crypto"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const app = (0, express_1.default)();
exports.app = app;
const port = 3000;
const bindHost = (process.env.APIX_HOST || 'localhost').trim() || 'localhost';
const startedAtMs = Date.now();
let metricsToken = (process.env.APIX_METRICS_TOKEN || '').trim();
const allowedOriginsRaw = process.env.APIX_ALLOWED_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173';
const allowAnyOrigin = allowedOriginsRaw.split(',').map((value) => value.trim()).includes('*');
const allowedOrigins = new Set(allowedOriginsRaw
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value && value !== '*'));
if (!metricsToken || metricsToken.toLowerCase() === 'change-this-token') {
    metricsToken = crypto_1.default.randomBytes(24).toString('hex');
    console.warn('APIX_METRICS_TOKEN was missing or placeholder. Generated an ephemeral token for this process.');
}
const API_ERROR_DEFINITIONS = {
    cors_origin_not_allowed: {
        status: 403,
        message: "Origin is not allowed by CORS policy.",
        retryable: false
    },
    method_not_allowed: {
        status: 405,
        message: "Method not allowed.",
        retryable: false
    },
    invalid_request: {
        status: 400,
        message: "Invalid request.",
        retryable: false
    },
    invalid_request_body: {
        status: 400,
        message: "Invalid request body.",
        retryable: false
    },
    missing_tx_hash: {
        status: 400,
        message: "Transaction hash is missing.",
        retryable: false
    },
    tx_hash_already_used: {
        status: 403,
        message: "Transaction hash already used by another request.",
        retryable: false
    },
    signing_error: {
        status: 500,
        message: "Internal server error.",
        retryable: true
    },
    metrics_unauthorized: {
        status: 401,
        message: "Metrics endpoint requires a valid bearer token.",
        retryable: false
    },
    invalid_stripe_session: {
        status: 401,
        message: "Missing or invalid Stripe session token.",
        retryable: false
    },
    invalid_apix_session: {
        status: 403,
        message: "Invalid or expired Apix session.",
        retryable: false
    },
    apix_verification_failed: {
        status: 403,
        message: "Apix verification failed.",
        retryable: false
    },
    session_not_found: {
        status: 403,
        message: "Session token not found or expired.",
        retryable: false
    },
    session_request_in_progress: {
        status: 409,
        message: "Session request is already in progress.",
        retryable: true
    },
    session_quota_exceeded: {
        status: 402,
        message: "Session quota exceeded.",
        retryable: false
    },
    session_start_failed: {
        status: 403,
        message: "Session start failed.",
        retryable: false
    },
    session_state_unavailable: {
        status: 503,
        message: "Session state service is unavailable.",
        retryable: true
    },
    payment_required: {
        status: 402,
        message: "Payment required.",
        retryable: false
    },
    request_failed: {
        status: 400,
        message: "Request failed.",
        retryable: false
    },
    internal_error: {
        status: 500,
        message: "Internal error.",
        retryable: true
    }
};
const metrics = {
    totalRequests: 0,
    totalErrors: 0,
    statusCounts: new Map(),
    routeStats: new Map()
};
app.use((0, cors_1.default)({
    origin: (origin, callback) => {
        if (!origin || allowAnyOrigin || allowedOrigins.has(origin)) {
            callback(null, true);
            return;
        }
        callback(new Error('Origin not allowed by CORS policy'));
    }
}));
app.use(express_1.default.json());
// Initialize Apix SDK
const apixConfig = {};
if (process.env.APIX_JWT_SECRET) {
    apixConfig.jwtSecret = process.env.APIX_JWT_SECRET;
}
if (process.env.APIX_VERIFICATION_RPC_URL) {
    apixConfig.rpcUrl = process.env.APIX_VERIFICATION_RPC_URL;
}
if (process.env.APIX_PROVIDER_TOKEN) {
    apixConfig.apiKey = process.env.APIX_PROVIDER_TOKEN;
}
if (process.env.APIX_RPC_TIMEOUT_MS) {
    const parsed = Number.parseInt(process.env.APIX_RPC_TIMEOUT_MS, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
        apixConfig.rpcTimeoutMs = parsed;
    }
}
if (process.env.APIX_RPC_MAX_RETRIES) {
    const parsed = Number.parseInt(process.env.APIX_RPC_MAX_RETRIES, 10);
    if (Number.isFinite(parsed) && parsed >= 0) {
        apixConfig.rpcMaxRetries = parsed;
    }
}
if (process.env.APIX_MIN_CONFIRMATIONS) {
    const parsed = Number.parseInt(process.env.APIX_MIN_CONFIRMATIONS, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
        apixConfig.defaultMinConfirmations = parsed;
    }
}
if (process.env.APIX_JWT_TTL_SECONDS) {
    const parsed = Number.parseInt(process.env.APIX_JWT_TTL_SECONDS, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
        apixConfig.jwtTtlSeconds = parsed;
    }
}
if (process.env.APIX_JWT_ISSUER) {
    apixConfig.jwtIssuer = process.env.APIX_JWT_ISSUER;
}
if (process.env.APIX_JWT_KID) {
    apixConfig.jwtKid = process.env.APIX_JWT_KID;
}
const apix = new apix_sdk_node_1.ApixMiddleware(apixConfig);
const PAYMENT_DISPLAY = {
    amount: (process.env.APIX_PAYMENT_AMOUNT || '0.1').trim() || '0.1',
    currency: (process.env.APIX_PAYMENT_CURRENCY || 'AVAX').trim() || 'AVAX'
};
const parsePaymentProofValue = (rawValue) => {
    const value = rawValue.trim();
    if (!value)
        return '';
    if (value.startsWith('0x')) {
        return value;
    }
    const txHashMatch = value.match(/tx_hash=([0-9a-zA-Zx]+)/i);
    if (txHashMatch?.[1]) {
        return txHashMatch[1];
    }
    try {
        const parsed = JSON.parse(value);
        if (typeof parsed?.txHash === 'string')
            return parsed.txHash;
        if (typeof parsed?.tx_hash === 'string')
            return parsed.tx_hash;
    }
    catch (_error) {
        // Keep parser intentionally permissive for compatibility.
    }
    return '';
};
const extractPaymentProof = (req) => {
    const authHeader = req.header('authorization') || '';
    if (authHeader.toLowerCase().startsWith('apix ')) {
        const token = authHeader.substring(authHeader.indexOf(' ') + 1);
        if (token)
            return token.trim();
    }
    const paymentSignature = req.header('payment-signature') || '';
    return parsePaymentProofValue(paymentSignature);
};
const apixProductMiddleware = (clientType) => async (req, res, next) => {
    const requestId = req.requestId;
    const paymentHandled = await apix.handlePaymentContext({
        ...(requestId ? { requestId } : {}),
        paymentProof: extractPaymentProof(req),
        clientType,
        paymentDetails: {}
    }, res, next, {
        onVerified: (proof) => {
            req.apixProof = proof;
        }
    });
    if (paymentHandled) {
        return;
    }
};
const sendError = (res, code, options) => {
    const definition = API_ERROR_DEFINITIONS[code];
    const status = options?.status ?? definition?.status ?? 500;
    const message = options?.message ?? definition?.message ?? code;
    const retryable = options?.retryable ?? definition?.retryable ?? false;
    const requestId = options?.requestId;
    res.status(status).json({
        error: status >= 500 ? "Internal Error" : "Request Failed",
        code,
        message,
        retryable,
        request_id: requestId
    });
};
// getOrCreateRequestId: helper function.
const getOrCreateRequestId = (req) => {
    const fromHeader = req.header('X-Request-ID');
    if (fromHeader && fromHeader.trim())
        return fromHeader.trim();
    return `req_${crypto_1.default.randomUUID()}`;
};
// logEvent: helper function.
const logEvent = (event, fields) => {
    console.log(JSON.stringify({
        ts: new Date().toISOString(),
        event,
        ...fields
    }));
};
app.use((req, res, next) => {
    const requestId = getOrCreateRequestId(req);
    req.requestId = requestId;
    res.setHeader('X-Request-ID', requestId);
    next();
});
app.use((req, res, next) => {
    const startedAt = Date.now();
    res.on('finish', () => {
        const latencyMs = Date.now() - startedAt;
        const statusKey = String(res.statusCode);
        const routeKey = `${req.method} ${req.path}`;
        const isError = res.statusCode >= 400;
        metrics.totalRequests += 1;
        if (isError)
            metrics.totalErrors += 1;
        metrics.statusCounts.set(statusKey, (metrics.statusCounts.get(statusKey) || 0) + 1);
        const existingRouteStats = metrics.routeStats.get(routeKey) || {
            count: 0,
            errorCount: 0,
            totalLatencyMs: 0,
            maxLatencyMs: 0
        };
        existingRouteStats.count += 1;
        if (isError)
            existingRouteStats.errorCount += 1;
        existingRouteStats.totalLatencyMs += latencyMs;
        existingRouteStats.maxLatencyMs = Math.max(existingRouteStats.maxLatencyMs, latencyMs);
        metrics.routeStats.set(routeKey, existingRouteStats);
        logEvent("http.request_completed", {
            request_id: req.requestId,
            method: req.method,
            path: req.path,
            status: res.statusCode,
            latency_ms: latencyMs
        });
    });
    next();
});
app.get('/health', (_req, res) => {
    res.json({
        status: "ok",
        service: "demo-backend",
        uptime_seconds: Math.floor((Date.now() - startedAtMs) / 1000),
        timestamp: new Date().toISOString()
    });
});
app.get('/metrics', (_req, res) => {
    const authHeader = String(_req.headers['authorization'] || '');
    if (authHeader !== `Bearer ${metricsToken}`) {
        sendError(res, "metrics_unauthorized", { requestId: getOrCreateRequestId(_req) });
        return;
    }
    const routeMetrics = Array.from(metrics.routeStats.entries()).map(([route, values]) => ({
        route,
        count: values.count,
        error_count: values.errorCount,
        avg_latency_ms: values.count > 0 ? Math.round(values.totalLatencyMs / values.count) : 0,
        max_latency_ms: values.maxLatencyMs
    }));
    res.json({
        service: "demo-backend",
        uptime_seconds: Math.floor((Date.now() - startedAtMs) / 1000),
        totals: {
            requests: metrics.totalRequests,
            errors: metrics.totalErrors,
            error_rate: metrics.totalRequests > 0
                ? Number((metrics.totalErrors / metrics.totalRequests).toFixed(4))
                : 0
        },
        status_counts: Object.fromEntries(metrics.statusCounts.entries()),
        routes: routeMetrics
    });
});
// --- CORE BUSINESS LOGIC ---
// getPremiumData: helper function.
const getPremiumData = () => {
    const amountLabel = `${PAYMENT_DISPLAY.amount} ${PAYMENT_DISPLAY.currency}`;
    return {
        id: "premium-item-unique-id",
        name: "High-Value Market Insight",
        price: `Pay ${amountLabel}`,
        content: "This is the exclusive data payload. It is the SAME content regardless of payment method.",
        timestamp: new Date().toISOString()
    };
};
// --- MIDDLEWARES ---
// Mock Stripe Middleware
// stripeMiddleware: helper function.
const stripeMiddleware = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    // Simulate typical Bearer token check
    if (!authHeader || !authHeader.startsWith('Bearer stripe_')) {
        sendError(res, "invalid_stripe_session", { requestId: req.requestId });
        return;
    }
    // Mock validation success
    console.log("Stripe Middleware: Payment Verified via Session Token");
    next();
};
// --- ENDPOINTS ---
// 1. Stripe Endpoint
app.get('/stripe-product', stripeMiddleware, (req, res) => {
    logEvent("stripe.request", { request_id: req.requestId, path: req.path });
    const data = getPremiumData();
    res.json({
        method: "Stripe",
        ...data
    });
});
// 2. Apix Endpoint
app.get('/apix-product', apixProductMiddleware('human'), (req, res) => {
    logEvent("apix.request_success", { request_id: req.requestId, path: req.path });
    const data = getPremiumData();
    res.json({
        method: "Apix",
        proof: req.apixProof,
        ...data
    });
});
app.get('/agent-apix-product', apixProductMiddleware('agent'), (req, res) => {
    logEvent("apix_agent.request_success", { request_id: req.requestId, path: req.path });
    const data = getPremiumData();
    res.json({
        method: "Apix",
        proof: req.apixProof,
        ...data
    });
});
if (process.env.NODE_ENV !== 'test') {
    const server = app.listen(port, bindHost, () => {
        console.log(`Demo Server running at http://${bindHost}:${port}`);
    });
    server.on('error', (error) => {
        console.error('Demo Server startup error:', {
            code: error.code,
            syscall: error.syscall,
            address: error.address,
            port: error.port,
            message: error.message
        });
        process.exit(1);
    });
    // Keep process alive in constrained runtime environments where an
    // otherwise-unreferenced server handle can be garbage-collected.
    process.stdin.resume();
    const shutdown = (signal) => {
        console.log(`Demo Server shutting down via ${signal}`);
        server.close(() => {
            process.exit(0);
        });
    };
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
}
