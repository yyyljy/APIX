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
if (typeof process.env.APIX_USE_CLOUD_SESSION_STATE === 'string') {
    apixConfig.useCloudSessionState = process.env.APIX_USE_CLOUD_SESSION_STATE.trim().toLowerCase() === 'true';
}
const apix = new ApixMiddleware(apixConfig);

const PAYMENT_PROFILE = {
    chainId: 43114,
    network: 'eip155:43114',
    currency: 'AVAX',
    amount: '0.100000000000000000',
    amountWei: '100000000000000000',
    recipient: '0x71C7656EC7ab88b098defB751B7401B5f6d8976F',
    minConfirmations: 1
};

const sendError = (
    res: Response,
    status: number,
    code: string,
    message: string,
    options?: { retryable?: boolean; requestId?: string }
) => {
    res.status(status).json({
        error: status >= 500 ? "Internal Error" : "Request Failed",
        code,
        message,
        retryable: options?.retryable ?? false,
        request_id: options?.requestId
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
        sendError(res, 401, "metrics_unauthorized", "Metrics endpoint requires a valid bearer token.");
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
    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.startsWith('Apix ')) {
        const token = authHeader.split(' ')[1];
        if (token) return token.trim();
    }

    const paymentSignature = req.headers['payment-signature'];
    if (typeof paymentSignature === 'string') {
        return parsePaymentSignature(paymentSignature);
    }
    if (Array.isArray(paymentSignature) && paymentSignature.length > 0) {
        const firstValue = paymentSignature[0];
        if (typeof firstValue === 'string') {
            return parsePaymentSignature(firstValue);
        }
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
        sendError(res, 401, "invalid_stripe_session", "Missing or invalid Stripe session token.", { requestId: (req as any).requestId });
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

        res.set(paymentResponse.headers);
        res.status(402).json(paymentResponse.body);
        return;
    }

    let validToken = '';

    // Heuristic: If token starts with 0x, treat as TxHash (Delegated Verification)
    // Otherwise treat as JWT (Session Validation)
    if (token.startsWith('0x') && token.length < 100) {
        logEvent("apix.verify_started", { request_id: requestId, tx_hash: token });
        const result = await apix.verifyPayment(token, paymentDetails);

        if (!result.success || !result.token) {
            sendError(
                res,
                403,
                result.code || "apix_verification_failed",
                result.message || "Apix verification failed.",
                { retryable: result.retryable ?? false, requestId: result.requestId || paymentDetails.requestId }
            );
            return;
        }
        validToken = result.token;
    } else {
        // JWT Validation
        if (await apix.validateSessionState(token)) {
            validToken = token;
        } else {
            sendError(res, 403, "invalid_apix_session", "Invalid or expired Apix session.", { requestId: paymentDetails.requestId });
            return;
        }
    }

    // Atomic Deduction Logic: Start Request
    if (!await apix.startRequestState(validToken)) {
        sendError(res, 402, "session_quota_exceeded", "Session quota exceeded.", { requestId: paymentDetails.requestId });
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
