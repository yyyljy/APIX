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
    const txHash = req.headers['x-apix-auth'] as string;

    if (!txHash) {
        res.status(402).json({
            error: "Payment Required",
            message: "Please provide a valid transaction hash in 'x-apix-auth' header."
        });
        return;
    }

    console.log(`Apix Middleware: Verifying hash ${txHash}`);
    const result = await apix.verifyPayment(txHash);

    if (!result.success) {
        res.status(403).json({
            error: "Forbidden",
            message: "Apix verification failed."
        });
        return;
    }

    // Inject proof if needed
    (req as any).apixProof = result.token;
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
