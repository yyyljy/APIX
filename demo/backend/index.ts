import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { ApixMiddleware } from 'apix-sdk-node';
import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const port = 3000;
const facilitatorUrl = process.env.APIX_FACILITATOR_URL || 'http://localhost:8080';

app.use(cors());
app.use(express.json());

// Initialize Apix SDK
const apixConfig: { facilitatorUrl: string; jwtSecret?: string } = {
    facilitatorUrl
};
if (process.env.APIX_JWT_SECRET) {
    apixConfig.jwtSecret = process.env.APIX_JWT_SECRET;
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
        res.status(401).json({
            error: "Unauthorized",
            message: "Missing or invalid Stripe session token."
        });
        return;
    }

    // Mock validation success
    console.log("Stripe Middleware: Payment Verified via Session Token");
    next();
};

// Apix Middleware Wrapper
const apixMiddlewareWrapper = async (req: Request, res: Response, next: NextFunction) => {
    const token = extractPaymentProof(req);
    const paymentDetails = {
        requestId: `req_${crypto.randomUUID()}`,
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
        console.log(`Apix Middleware: Verifying hash ${token}`);
        const result = await apix.verifyPayment(token, paymentDetails);

        if (!result.success || !result.token) {
            res.status(403).json({
                error: "Forbidden",
                message: "Apix verification failed."
            });
            return;
        }
        validToken = result.token;
    } else {
        // JWT Validation
        if (apix.validateSession(token)) {
            validToken = token;
        } else {
            res.status(403).json({
                error: "Forbidden",
                message: "Invalid or expired Apix session."
            });
            return;
        }
    }

    // Atomic Deduction Logic: Start Request
    if (!apix.startRequest(validToken)) {
        res.status(402).json({
            error: "Payment Required",
            message: "Session quota exceeded."
        });
        return;
    }

    // Hook into response finish to commit/rollback
    res.on('finish', () => {
        if (res.statusCode >= 200 && res.statusCode < 500) {
            apix.commitRequest(validToken);
            // console.log("Apix: Request Committed");
        } else {
            apix.rollbackRequest(validToken);
            console.log("Apix: Request Rolled Back (Quota Refunded)");
        }
    });

    // Inject proof (JWT) so controller can return it to client
    (req as any).apixProof = validToken;
    next();
};

// --- ENDPOINTS ---

// 1. Stripe Endpoint
app.get('/stripe-product', stripeMiddleware, (req: Request, res: Response) => {
    const data = getPremiumData();
    res.json({
        method: "Stripe",
        ...data
    });
});

// 2. Apix Endpoint
app.get('/apix-product', apixMiddlewareWrapper, (req: Request, res: Response) => {
    const data = getPremiumData();
    res.json({
        method: "Apix",
        proof: (req as any).apixProof,
        ...data
    });
});

app.listen(port, () => {
    console.log(`Demo Server running at http://localhost:${port}`);
});
