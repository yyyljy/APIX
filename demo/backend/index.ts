import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { ApixMiddleware } from 'apix-sdk-node';

const app = express();
const port = 3000;

app.use(cors());
app.use(express.json());

// Initialize Apix SDK
const apix = new ApixMiddleware({
    facilitatorUrl: 'http://localhost:8080'
});

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
    const authHeader = req.headers['authorization'];

    // Parse Authorization: Apix <token>
    let token = '';
    if (authHeader && authHeader.startsWith('Apix ')) {
        token = authHeader.split(' ')[1];
    }

    if (!token) {
        // Standard x402/L402 Pattern: Return WWW-Authenticate header
        const paymentDetails = {
            requestId: "req_550e8400-e29b",
            chainId: 43114,
            currency: "AVAX",
            amount: "0.100000000000000000",
            recipient: "0x71C7656EC7ab88b098defB751B7401B5f6d8976F"
        };

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
        const result = await apix.verifyPayment(token);

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
