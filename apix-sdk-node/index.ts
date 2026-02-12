import axios from 'axios';
import * as jwt from 'jsonwebtoken';

export interface ApixConfig {
    apiKey?: string;
    facilitatorUrl?: string;
    jwtSecret?: string;
}

export interface VerificationResult {
    success: boolean;
    token?: string;
    message?: string;
}

export interface PaymentDetails {
    requestId: string;
    chainId: number;
    network: string;
    currency: string;
    amount: string;
    amountWei: string;
    recipient: string;
    minConfirmations?: number;
}

export interface PaymentResponse {
    headers: {
        'WWW-Authenticate': string;
        'PAYMENT-REQUIRED': string;
    };
    body: {
        error: string;
        message: string;
        details: {
                    request_id: string;
                    chain_id: number;
                    network: string;
                    payment_info: {
                        currency: string;
                        amount: string;
                        amount_wei: string;
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
    private jwtSecret: string;

    constructor(config: ApixConfig = {}) {
        this.config = config;
        this.facilitatorUrl = config.facilitatorUrl || 'http://localhost:8080';
        this.jwtSecret = config.jwtSecret || process.env.APIX_JWT_SECRET || '';
        if (!this.jwtSecret) {
            throw new Error('Missing APIX_JWT_SECRET (or provide jwtSecret in ApixMiddleware config).');
        }
        this.sessionCache = new Map();
    }

    /**
     * Verifies a payment transaction hash with Apix Cloud.
     * @param txHash The transaction hash from the client.
     */
    async verifyPayment(txHash: string, payment?: PaymentDetails): Promise<VerificationResult> {
        if (!txHash) {
            return { success: false, message: 'Transaction hash is missing.' };
        }

        try {
            const response = await axios.post(`${this.facilitatorUrl}/v1/verify`, {
                tx_hash: txHash,
                request_id: payment?.requestId,
                chain_id: payment?.chainId,
                network: payment?.network,
                recipient: payment?.recipient,
                amount_wei: payment?.amountWei,
                currency: payment?.currency,
                min_confirmations: payment?.minConfirmations
            });

            if (response.data && response.data.valid && response.data.token) {
                const token = response.data.token;

                // Decode and Cache
                try {
                    const decoded = jwt.verify(token, this.jwtSecret) as any;

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
        const paymentRequired = {
            version: 'x402-draft',
            request_id: details.requestId,
            chain_id: details.chainId,
            network: details.network,
            payment_info: {
                currency: details.currency,
                amount: details.amount,
                amount_wei: details.amountWei,
                recipient: details.recipient
            }
        };
        const paymentRequiredBase64 = Buffer.from(JSON.stringify(paymentRequired), 'utf8').toString('base64');
        const authHeader = `Apix realm="Apix Protected", request_id="${details.requestId}", price="${details.amount}", currency="${details.currency}", pay_to="${details.recipient}"`;

        return {
            headers: {
                'WWW-Authenticate': authHeader,
                'PAYMENT-REQUIRED': paymentRequiredBase64
            },
            body: {
                error: "Payment Required",
                message: "Payment Required. Please check WWW-Authenticate header or body for details.",
                details: {
                    request_id: details.requestId,
                    chain_id: details.chainId,
                    network: details.network,
                    payment_info: {
                        currency: details.currency,
                        amount: details.amount,
                        amount_wei: details.amountWei,
                        recipient: details.recipient
                    }
                }
            }
        };
    }
}
