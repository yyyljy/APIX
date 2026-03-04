import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { ApixMiddleware } from 'apix-sdk-node';
import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const port = 3000;
const facilitatorUrl = process.env.APIX_FACILITATOR_URL || 'http://localhost:8080';
const startedAtMs = Date.now();
let metricsToken = (process.env.APIX_METRICS_TOKEN || '').trim();
const allowedOriginsRaw = process.env.APIX_ALLOWED_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173';
const allowAnyOrigin = allowedOriginsRaw.split(',').map((value) => value.trim()).includes('*');
const allowedOrigins = new Set(
    allowedOriginsRaw
        .split(',')
        .map((value) => value.trim())
        .filter((value) => value && value !== '*')
);

if (!metricsToken || metricsToken.toLowerCase() === 'change-this-token') {
    metricsToken = crypto.randomBytes(24).toString('hex');
    console.warn('APIX_METRICS_TOKEN was missing or placeholder. Generated an ephemeral token for this process.');
}

type RouteMetric = {
    count: number;
    errorCount: number;
    totalLatencyMs: number;
    maxLatencyMs: number;
};

type ApiErrorDefinition = {
    status: number;
    message: string;
    retryable: boolean;
};

const API_ERROR_DEFINITIONS: Record<string, ApiErrorDefinition> = {
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
    invalid_cloud_token: {
        status: 403,
        message: "Invalid token from Cloud.",
        retryable: false
    },
    signing_error: {
        status: 500,
        message: "Internal server error.",
        retryable: true
    },
    facilitator_unreachable: {
        status: 503,
        message: "Failed to connect to Apix Cloud.",
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
    statusCounts: new Map<string, number>(),
    routeStats: new Map<string, RouteMetric>()
};

app.use(cors({
    origin: (origin, callback) => {
        if (!origin || allowAnyOrigin || allowedOrigins.has(origin)) {
            callback(null, true);
            return;
        }
        callback(new Error('Origin not allowed by CORS policy'));
    }
}));
app.use(express.json());

// Initialize Apix SDK
const apixConfig: {
    facilitatorUrl: string;
    jwtSecret?: string;
    sessionAuthorityUrl?: string;
    rpcUrl?: string;
    useCloudVerification?: boolean;
    rpcTimeoutMs?: number;
    rpcMaxRetries?: number;
    defaultMinConfirmations?: number;
    jwtTtlSeconds?: number;
    jwtIssuer?: string;
    jwtKid?: string;
    useCloudSessionState?: boolean;
} = {
    facilitatorUrl
};
if (process.env.APIX_JWT_SECRET) {
    apixConfig.jwtSecret = process.env.APIX_JWT_SECRET;
}
if (process.env.APIX_SESSION_AUTHORITY_URL) {
    apixConfig.sessionAuthorityUrl = process.env.APIX_SESSION_AUTHORITY_URL;
}
if (process.env.APIX_RPC_URL) {
    apixConfig.rpcUrl = process.env.APIX_RPC_URL;
}
if (typeof process.env.APIX_USE_CLOUD_VERIFICATION === 'string') {
    apixConfig.useCloudVerification = process.env.APIX_USE_CLOUD_VERIFICATION.trim().toLowerCase() === 'true';
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
if (typeof process.env.APIX_USE_CLOUD_SESSION_STATE === 'string') {
    apixConfig.useCloudSessionState = process.env.APIX_USE_CLOUD_SESSION_STATE.trim().toLowerCase() === 'true';
}
const apix = new ApixMiddleware(apixConfig);

const parsePositiveInt = (value: string | undefined, fallback: number): number => {
    const trimmed = (value || '').trim();
    const parsed = Number.parseInt(trimmed, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        return fallback;
    }
    return parsed;
};

const normalizeChainId = (value: string | number | undefined, fallback: number): number => {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
        return Math.floor(value);
    }
    return parsePositiveInt(typeof value === 'string' ? value : '', fallback);
};

const parseAmountWei = (value: string | undefined, fallback: string): string => {
    const trimmed = (value || '').trim();
    return /^\d+$/.test(trimmed) ? trimmed : fallback;
};

const normalizeNetwork = (rawNetwork: string | undefined, chainId: number): string => {
    const trimmed = (rawNetwork || '').trim();
    if (!trimmed) {
        return `eip155:${chainId}`;
    }
    if (/^eip155:\d+$/.test(trimmed)) {
        return trimmed;
    }
    if (/^\d+$/.test(trimmed)) {
        return `eip155:${normalizeChainId(trimmed, chainId)}`;
    }
    if (trimmed.startsWith('eip')) {
        console.warn(`Invalid network format "${trimmed}", falling back to eip155:${chainId}.`);
    }
    return `eip155:${chainId}`;
};

const parseNetworkChainId = (network: string): number => {
    const match = /^eip155:(\d+)$/.exec((network || '').trim());
    if (!match) return 0;
    return normalizeChainId(match[1], 0);
};

const configuredChainId = parsePositiveInt(process.env.APIX_CHAIN_ID, 43114);
const configuredNetwork = normalizeNetwork(process.env.APIX_NETWORK, configuredChainId);
const paymentChainId = parseNetworkChainId(configuredNetwork) || configuredChainId;
if (paymentChainId !== configuredChainId) {
    console.warn(`APIX_CHAIN_ID=${configuredChainId} and APIX_NETWORK=${configuredNetwork} mismatch; deriving chain_id from network as ${paymentChainId}.`);
}

const PAYMENT_PROFILE = {
    chainId: paymentChainId,
    network: configuredNetwork,
    currency: (process.env.APIX_PAYMENT_CURRENCY || 'AVAX').trim(),
    amount: (process.env.APIX_PAYMENT_AMOUNT || '0.100000000000000000').trim(),
    amountWei: parseAmountWei(process.env.APIX_PAYMENT_AMOUNT_WEI, '100000000000000000'),
    recipient: (process.env.APIX_PAYMENT_RECIPIENT || '0x71C7656EC7ab88b098defB751B7401B5f6d8976F').trim(),
    minConfirmations: parsePositiveInt(process.env.APIX_MIN_CONFIRMATIONS, 1)
};

const sendError = (
    res: Response,
    code: string,
    options?: { status?: number; message?: string; retryable?: boolean; requestId?: string; }
) => {
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
const getOrCreateRequestId = (req: Request): string => {
    const fromHeader = req.header('X-Request-ID');
    if (fromHeader && fromHeader.trim()) return fromHeader.trim();
    return `req_${crypto.randomUUID()}`;
};

const logEvent = (event: string, fields: Record<string, unknown>) => {
    console.log(JSON.stringify({
        ts: new Date().toISOString(),
        event,
        ...fields
    }));
};

app.use((req: Request, res: Response, next: NextFunction) => {
    const requestId = getOrCreateRequestId(req);
    (req as any).requestId = requestId;
    res.setHeader('X-Request-ID', requestId);
    next();
});

app.use((req: Request, res: Response, next: NextFunction) => {
    const startedAt = Date.now();
    res.on('finish', () => {
        const latencyMs = Date.now() - startedAt;
        const statusKey = String(res.statusCode);
        const routeKey = `${req.method} ${req.path}`;
        const isError = res.statusCode >= 400;

        metrics.totalRequests += 1;
        if (isError) metrics.totalErrors += 1;
        metrics.statusCounts.set(statusKey, (metrics.statusCounts.get(statusKey) || 0) + 1);

        const existingRouteStats = metrics.routeStats.get(routeKey) || {
            count: 0,
            errorCount: 0,
            totalLatencyMs: 0,
            maxLatencyMs: 0
        };
        existingRouteStats.count += 1;
        if (isError) existingRouteStats.errorCount += 1;
        existingRouteStats.totalLatencyMs += latencyMs;
        existingRouteStats.maxLatencyMs = Math.max(existingRouteStats.maxLatencyMs, latencyMs);
        metrics.routeStats.set(routeKey, existingRouteStats);

        logEvent("http.request_completed", {
            request_id: (req as any).requestId,
            method: req.method,
            path: req.path,
            status: res.statusCode,
            latency_ms: latencyMs
        });
    });
    next();
});

app.get('/health', (_req: Request, res: Response) => {
    res.json({
        status: "ok",
        service: "demo-backend",
        uptime_seconds: Math.floor((Date.now() - startedAtMs) / 1000),
        timestamp: new Date().toISOString()
    });
});

app.get('/metrics', (_req: Request, res: Response) => {
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

const parsePaymentSignature = (value: string): string => {
    const raw = value.trim();
    if (!raw) return '';
    if (raw.startsWith('0x')) return raw;

    const txHashMatch = raw.match(/tx_hash=([0-9a-zA-Zx]+)/i);
    if (txHashMatch?.[1]) return txHashMatch[1];

    try {
        const parsed = JSON.parse(raw);
        if (typeof parsed?.txHash === 'string') return parsed.txHash;
        if (typeof parsed?.tx_hash === 'string') return parsed.tx_hash;
    } catch (_err) {
        // Keep parsing fallbacks only.
    }
    return '';
};

const extractPaymentProof = (req: Request): string => {
    const normalizeHeaderValue = (value: string | string[] | undefined): string => {
        if (typeof value === 'string') {
            return value.trim();
        }
        if (!Array.isArray(value)) {
            return '';
        }
        for (const item of value) {
            if (typeof item === 'string' && item.trim()) {
                return item.trim();
            }
        }
        return '';
    };

    const authHeader = normalizeHeaderValue(req.headers['authorization']);
    if (authHeader && authHeader.toLowerCase().startsWith('apix ')) {
        const token = authHeader.substring(authHeader.indexOf(' ') + 1);
        if (token) return token.trim();
    }

    const paymentSignature = normalizeHeaderValue(req.headers['payment-signature']);
    if (typeof paymentSignature === 'string') {
        return parsePaymentSignature(paymentSignature);
    }
    return '';
};

// --- CORE BUSINESS LOGIC ---
const getPremiumData = () => {
    return {
        id: "premium-item-unique-id",
        name: "High-Value Market Insight",
        price: "$10.00 / 10 AVAX",
        content: "This is the exclusive data payload. It is the SAME content regardless of payment method.",
        timestamp: new Date().toISOString()
    };
};

// --- MIDDLEWARES ---

// Mock Stripe Middleware
const stripeMiddleware = (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers['authorization'];

    // Simulate typical Bearer token check
    if (!authHeader || !authHeader.startsWith('Bearer stripe_')) {
        sendError(res, "invalid_stripe_session", { requestId: (req as any).requestId });
        return;
    }

    // Mock validation success
    console.log("Stripe Middleware: Payment Verified via Session Token");
    next();
};

// Apix Middleware Wrapper
const apixMiddlewareWrapper = async (req: Request, res: Response, next: NextFunction) => {
    const token = extractPaymentProof(req);
    const requestId = (req as any).requestId || getOrCreateRequestId(req);
    const paymentDetails = {
        requestId,
        chainId: PAYMENT_PROFILE.chainId,
        network: PAYMENT_PROFILE.network,
        currency: PAYMENT_PROFILE.currency,
        amount: PAYMENT_PROFILE.amount,
        amountWei: PAYMENT_PROFILE.amountWei,
        recipient: PAYMENT_PROFILE.recipient,
        minConfirmations: PAYMENT_PROFILE.minConfirmations
    };

    if (!token) {
        // Standard x402/L402 Pattern: Return WWW-Authenticate header
        const paymentResponse = apix.createPaymentRequest(paymentDetails);
        const paymentBody = {
            ...paymentResponse.body,
            code: paymentResponse.body.code || "payment_required",
            message: paymentResponse.body.message || "Payment required to access premium resource.",
            retryable: paymentResponse.body.retryable ?? false
        };

        res.set(paymentResponse.headers);
        res.status(402).json(paymentBody);
        return;
    }

    let validToken = '';

    // Heuristic: If token starts with 0x, treat as TxHash (Delegated Verification)
    // Otherwise treat as JWT (Session Validation)
    if (token.startsWith('0x') && token.length < 100) {
        logEvent("apix.verify_started", { request_id: requestId, tx_hash: token });
        const result = await apix.verifyPayment(token, paymentDetails);

        if (!result.success || !result.token) {
            logEvent("apix.verify_failed", {
                request_id: requestId,
                tx_hash: token,
                code: result.code || "apix_verification_failed",
                retryable: result.retryable ?? false,
                message: result.message || "Apix verification failed."
            });
            sendError(
                res,
                result.code || "apix_verification_failed",
                {
                    retryable: result.retryable ?? undefined,
                    requestId: result.requestId || paymentDetails.requestId,
                    message: result.message
                }
            );
            return;
        }
        validToken = result.token;
    } else {
        // JWT Validation
        if (await apix.validateSessionState(token)) {
            validToken = token;
        } else {
            sendError(res, "invalid_apix_session", { requestId: paymentDetails.requestId });
            return;
        }
    }

    // Atomic Deduction Logic: Start Request
    const sessionStart = await apix.startRequestStateWithResult(validToken);
    if (!sessionStart.started) {
        const code = sessionStart.code || 'session_start_failed';
        const message = sessionStart.message || 'Session start failed.';
        switch (code) {
            case 'session_request_in_progress':
                sendError(res, "session_request_in_progress", { message, retryable: true, requestId: paymentDetails.requestId });
                break;
            case 'session_not_found':
                sendError(res, "invalid_apix_session", { message, requestId: paymentDetails.requestId });
                break;
            case 'session_quota_exceeded':
                sendError(res, "session_quota_exceeded", { message, requestId: paymentDetails.requestId });
                break;
            default:
                sendError(res, code, { message, retryable: true, requestId: paymentDetails.requestId });
                break;
        }
        return;
    }

    // Hook into response finish to commit/rollback
    let quotaFinalized = false;
    const finalizeQuota = () => {
        if (quotaFinalized) return;
        quotaFinalized = true;

        if (res.statusCode >= 200 && res.statusCode < 300) {
            void apix.commitRequestState(validToken).catch((error: any) => {
                logEvent("apix.quota_commit_failed", {
                    request_id: requestId,
                    message: String(error?.message || error || 'unknown_error')
                });
            });
            return;
        }
        void apix.rollbackRequestState(validToken).catch((error: any) => {
            logEvent("apix.quota_rollback_failed", {
                request_id: requestId,
                message: String(error?.message || error || 'unknown_error')
            });
        });
        if (res.statusCode >= 500) {
            console.log("Apix: Request Rolled Back (Quota Refunded)");
        }
    };

    res.on('finish', finalizeQuota);
    res.on('close', finalizeQuota);

    // Inject proof (JWT) so controller can return it to client
    (req as any).apixProof = validToken;
    next();
};

// --- ENDPOINTS ---

// 1. Stripe Endpoint
app.get('/stripe-product', stripeMiddleware, (req: Request, res: Response) => {
    logEvent("stripe.request", { request_id: (req as any).requestId, path: req.path });
    const data = getPremiumData();
    res.json({
        method: "Stripe",
        ...data
    });
});

// 2. Apix Endpoint
app.get('/apix-product', apixMiddlewareWrapper, (req: Request, res: Response) => {
    logEvent("apix.request_success", { request_id: (req as any).requestId, path: req.path });
    const data = getPremiumData();
    res.json({
        method: "Apix",
        proof: (req as any).apixProof,
        ...data
    });
});

export { app };

if (process.env.NODE_ENV !== 'test') {
    app.listen(port, () => {
        console.log(`Demo Server running at http://localhost:${port}`);
    });
}
