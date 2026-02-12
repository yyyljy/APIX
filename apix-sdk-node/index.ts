import axios from 'axios';
import * as jwt from 'jsonwebtoken';

const JWT_SECRET = "apix-mvp-secret-key"; // Shared secret for MVP

export interface ApixConfig {
    apiKey?: string;
    facilitatorUrl?: string;
}

export interface VerificationResult {
    success: boolean;
    token?: string;
    message?: string;
}

export interface PaymentDetails {
    requestId: string;
    chainId: number;
    currency: string;
    amount: string;
    recipient: string;
}

export interface PaymentResponse {
    headers: {
        'WWW-Authenticate': string;
    };
    body: {
        error: string;
        message: string;
        details: {
            request_id: string;
            chain_id: number;
            payment_info: {
                currency: string;
                amount: string;
                recipient: string;
            };
        };
    };
}

interface SessionData {
    claims: any;
    remainingQuota: number;
    pendingDeduction: boolean;
}

export class ApixMiddleware {
    private config: ApixConfig;
    private facilitatorUrl: string;
    private sessionCache: Map<string, SessionData>;

    constructor(config: ApixConfig = {}) {
        this.config = config;
        this.facilitatorUrl = config.facilitatorUrl || 'http://localhost:8080';
        this.sessionCache = new Map();
    }

    /**
     * Verifies a payment transaction hash with Apix Cloud.
     * @param txHash The transaction hash from the client.
     */
    async verifyPayment(txHash: string): Promise<VerificationResult> {
        if (!txHash) {
            return { success: false, message: 'Transaction hash is missing.' };
        }

        // 1. Check Local Cache first (if txHash is used as key, but here we use token as key usually)
        // However, initial request only has txHash. 
        // We could cache verified txHash -> token mapping if we wanted, but for MVP we rely on client sending token after first verify?
        // Plan says: "SDK uses in-memory caching (Redis/Map) to validate the JWT for subsequent calls"
        // So verifyPayment is for the INITIAL entry.

        try {
            const response = await axios.post(`${this.facilitatorUrl}/v1/verify`, {
                tx_hash: txHash
            });

            if (response.data && response.data.valid && response.data.token) {
                const token = response.data.token;

                // Decode and Cache
                try {
                    const decoded = jwt.verify(token, JWT_SECRET) as any;

                    this.sessionCache.set(token, {
                        claims: decoded,
                        remainingQuota: decoded.max_requests || 10,
                        pendingDeduction: false
                    });

                    return {
                        success: true,
                        token: token,
                        message: response.data.message
                    };
                } catch (jwtError) {
                    console.error('JWT Verification failed:', jwtError);
                    return { success: false, message: 'Invalid token from Cloud.' };
                }
            }

            return {
                success: false,
                message: response.data?.message || 'Verification failed.'
            };

        } catch (error: any) {
            console.error('Apix SDK Verification Error:', error.message);
            return {
                success: false,
                message: 'Failed to connect to Apix Cloud.'
            };
        }
    }

    /**
     * Validates an existing session token (JWT).
     * @param token The JWT session token.
     */
    validateSession(token: string): boolean {
        const session = this.sessionCache.get(token);

        if (!session) {
            // If not in cache, try to verify signature stateless (but no quota tracking then if we rely on cache)
            // For MVP, if not in cache, we reject to force re-verification or we reload from JWT if valid?
            // If we reload from JWT, we reset quota which is bad.
            // So MUST be in cache for quota tracking.
            return false;
        }

        // Check if token expired
        const now = Math.floor(Date.now() / 1000);
        if (session.claims.exp && session.claims.exp < now) {
            this.sessionCache.delete(token);
            return false;
        }

        if (session.remainingQuota <= 0) {
            return false;
        }

        return true;
    }

    /**
     * Starts a request: marks simple "pending" state or just check quota.
     * For MVP Atomic Deduction: we assume optimistic, deduct on success?
     * Or deduct on start (PENDING), and verify success to keep it deducted, or rollback on failure.
     * Plan says: "Request Start: Mark session usage as PENDING."
     */
    startRequest(token: string): boolean {
        const session = this.sessionCache.get(token);
        if (!session || session.remainingQuota <= 0) return false;

        // Mark pending
        session.pendingDeduction = true;
        // We conservatively deduct 1 now? or just mark pending.
        // Let's deduct 1 now, and add back if it fails.
        session.remainingQuota -= 1;
        return true;
    }

    /**
     * Commits the deduction (request succeeded).
     */
    commitRequest(token: string): void {
        const session = this.sessionCache.get(token);
        if (session) {
            session.pendingDeduction = false;
            // Already deducted in startRequest
        }
    }

    /**
     * Rolls back the deduction (request failed).
     */
    rollbackRequest(token: string): void {
        const session = this.sessionCache.get(token);
        if (session) {
            session.pendingDeduction = false;
            session.remainingQuota += 1; // Refund
        }
    }

    /**
     * Creates a standardized 402 Payment Required response.
     * @param details The payment details required from the client.
     */
    createPaymentRequest(details: PaymentDetails): PaymentResponse {
        const authHeader = `Apix realm="Apix Protected", request_id="${details.requestId}", price="${details.amount}", currency="${details.currency}", pay_to="${details.recipient}"`;

        return {
            headers: {
                'WWW-Authenticate': authHeader
            },
            body: {
                error: "Payment Required",
                message: "Payment Required. Please check WWW-Authenticate header or body for details.",
                details: {
                    request_id: details.requestId,
                    chain_id: details.chainId,
                    payment_info: {
                        currency: details.currency,
                        amount: details.amount,
                        recipient: details.recipient
                    }
                }
            }
        };
    }
}
