import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { ApixMiddleware } from 'apix-sdk-node';
import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const port = 3000;
const bindHost = (process.env.APIX_HOST || 'localhost').trim() || 'localhost';
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
    jwtSecret?: string;
    apiKey?: string;
    rpcUrl?: string;
    rpcTimeoutMs?: number;
    rpcMaxRetries?: number;
    defaultMinConfirmations?: number;
    jwtTtlSeconds?: number;
    jwtIssuer?: string;
    jwtKid?: string;
} = {};
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
const apix = new ApixMiddleware(apixConfig);

const PAYMENT_DISPLAY = {
    amount: (process.env.APIX_PAYMENT_AMOUNT || '0.1').trim() || '0.1',
    currency: (process.env.APIX_PAYMENT_CURRENCY || 'AVAX').trim() || 'AVAX'
};

const parsePaymentProofValue = (rawValue: string): string => {
    const value = rawValue.trim();
    if (!value) return '';

    if (value.startsWith('0x')) {
        return value;
    }

    const txHashMatch = value.match(/tx_hash=([0-9a-zA-Zx]+)/i);
    if (txHashMatch?.[1]) {
        return txHashMatch[1];
    }

    try {
        const parsed = JSON.parse(value);
        if (typeof parsed?.txHash === 'string') return parsed.txHash;
        if (typeof parsed?.tx_hash === 'string') return parsed.tx_hash;
    } catch (_error) {
        // Keep parser intentionally permissive for compatibility.
    }
    return '';
};

const extractPaymentProof = (req: Request): string => {
    const authHeader = req.header('authorization') || '';
    if (authHeader.toLowerCase().startsWith('apix ')) {
        const token = authHeader.substring(authHeader.indexOf(' ') + 1);
        if (token) return token.trim();
    }

    const paymentSignature = req.header('payment-signature') || '';
    return parsePaymentProofValue(paymentSignature);
};

const apixProductMiddleware = (clientType: 'human' | 'agent') => async (req: Request, res: Response, next: NextFunction) => {
    const requestId = (req as any).requestId as string | undefined;
    const paymentHandled = await apix.handlePaymentContext(
        {
            ...(requestId ? { requestId } : {}),
            paymentProof: extractPaymentProof(req),
            clientType,
            paymentDetails: {}
        },
        res,
        next,
        {
            onVerified: (proof: string) => {
                (req as any).apixProof = proof;
            }
        }
    );

    if (paymentHandled) {
        return;
    }
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
// getOrCreateRequestId: helper function.
const getOrCreateRequestId = (req: Request): string => {
    const fromHeader = req.header('X-Request-ID');
    if (fromHeader && fromHeader.trim()) return fromHeader.trim();
    return `req_${crypto.randomUUID()}`;
};

// logEvent: helper function.
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
app.get('/apix-product', apixProductMiddleware('human'), (req: Request, res: Response) => {
    logEvent("apix.request_success", { request_id: (req as any).requestId, path: req.path });
    const data = getPremiumData();
    res.json({
        method: "Apix",
        proof: (req as any).apixProof,
        ...data
    });
});

app.get('/agent-apix-product', apixProductMiddleware('agent'), (req: Request, res: Response) => {
    logEvent("apix_agent.request_success", { request_id: (req as any).requestId, path: req.path });
    const data = getPremiumData();
    res.json({
        method: "Apix",
        proof: (req as any).apixProof,
        ...data
    });
});

export { app };

if (process.env.NODE_ENV !== 'test') {
    const server = app.listen(port, bindHost, () => {
        console.log(`Demo Server running at http://${bindHost}:${port}`);
    });

    server.on('error', (error) => {
        console.error('Demo Server startup error:', {
            code: (error as any).code,
            syscall: (error as any).syscall,
            address: (error as any).address,
            port: (error as any).port,
            message: (error as any).message
        });
        process.exit(1);
    });

    // Keep process alive in constrained runtime environments where an
    // otherwise-unreferenced server handle can be garbage-collected.
    process.stdin.resume();

    const shutdown = (signal: string) => {
        console.log(`Demo Server shutting down via ${signal}`);
        server.close(() => {
            process.exit(0);
        });
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
}
