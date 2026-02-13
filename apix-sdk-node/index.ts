import axios from 'axios';
import * as jwt from 'jsonwebtoken';

export interface SessionData {
    claims: any;
    remainingQuota: number;
    requestState: 'idle' | 'pending';
}

export interface SessionStore {
    get(token: string): SessionData | undefined;
    set(token: string, value: SessionData): void;
    delete(token: string): void;
}

export class InMemorySessionStore implements SessionStore {
    private cache: Map<string, SessionData>;

    constructor() {
        this.cache = new Map();
    }

    get(token: string): SessionData | undefined {
        return this.cache.get(token);
    }

    set(token: string, value: SessionData): void {
        this.cache.set(token, value);
    }

    delete(token: string): void {
        this.cache.delete(token);
    }
}

export interface ApixConfig {
    apiKey?: string;
    facilitatorUrl?: string;
    jwtSecret?: string;
    sessionStore?: SessionStore;
}

export interface VerificationResult {
    success: boolean;
    token?: string;
    message?: string;
    code?: string;
    retryable?: boolean;
    requestId?: string;
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

export class ApixMiddleware {
    private config: ApixConfig;
    private facilitatorUrl: string;
    private sessionStore: SessionStore;
    private jwtSecret: string;

    constructor(config: ApixConfig = {}) {
        this.config = config;
        this.facilitatorUrl = config.facilitatorUrl || 'http://localhost:8080';
        this.jwtSecret = config.jwtSecret || process.env.APIX_JWT_SECRET || '';
        if (!this.jwtSecret) {
            throw new Error('Missing APIX_JWT_SECRET (or provide jwtSecret in ApixMiddleware config).');
        }
        this.sessionStore = config.sessionStore || new InMemorySessionStore();
    }

    /**
     * Verifies a payment transaction hash with Apix Cloud.
     * @param txHash The transaction hash from the client.
     */
    async verifyPayment(txHash: string, payment?: PaymentDetails): Promise<VerificationResult> {
        if (!txHash) {
            return { success: false, message: 'Transaction hash is missing.', code: 'missing_tx_hash', retryable: false };
        }

        try {
            const requestOptions = payment?.requestId
                ? { headers: { 'X-Request-ID': payment.requestId } }
                : {};
            const response = await axios.post(`${this.facilitatorUrl}/v1/verify`, {
                tx_hash: txHash,
                request_id: payment?.requestId,
                chain_id: payment?.chainId,
                network: payment?.network,
                recipient: payment?.recipient,
                amount_wei: payment?.amountWei,
                currency: payment?.currency,
                min_confirmations: payment?.minConfirmations
            }, requestOptions);

            if (response.data && response.data.valid && response.data.token) {
                const token = response.data.token;

                // Decode and cache for per-session quota tracking.
                try {
                    const decoded = jwt.verify(token, this.jwtSecret) as any;

                    this.sessionStore.set(token, {
                        claims: decoded,
                        remainingQuota: decoded.max_requests || 10,
                        requestState: 'idle'
                    });

                    return {
                        success: true,
                        token,
                        message: response.data.message,
                        requestId: response.data.request_id || response.headers?.['x-request-id']
                    };
                } catch (jwtError) {
                    console.error('JWT Verification failed:', jwtError);
                    return { success: false, message: 'Invalid token from Cloud.', code: 'invalid_cloud_token', retryable: false };
                }
            }

            return {
                success: false,
                message: response.data?.message || 'Verification failed.',
                code: response.data?.code,
                retryable: response.data?.retryable,
                requestId: response.data?.request_id
            };

        } catch (error: any) {
            const remoteError = error?.response?.data;
            if (remoteError) {
                return {
                    success: false,
                    message: remoteError.message || 'Verification failed.',
                    code: remoteError.code,
                    retryable: remoteError.retryable,
                    requestId: remoteError.request_id || error?.response?.headers?.['x-request-id']
                };
            }
            console.error('Apix SDK Verification Error:', error.message);
            return {
                success: false,
                message: 'Failed to connect to Apix Cloud.',
                code: 'facilitator_unreachable',
                retryable: true
            };
        }
    }

    /**
     * Validates an existing session token (JWT).
     * @param token The JWT session token.
     */
    validateSession(token: string): boolean {
        const session = this.sessionStore.get(token);

        if (!session) {
            // For quota integrity, token must be present in stateful session store.
            return false;
        }

        // Check if token expired.
        const now = Math.floor(Date.now() / 1000);
        if (session.claims.exp && session.claims.exp < now) {
            this.sessionStore.delete(token);
            return false;
        }

        if (session.remainingQuota <= 0) {
            return false;
        }

        return true;
    }

    /**
     * Starts a request and marks quota deduction as pending.
     */
    startRequest(token: string): boolean {
        const session = this.sessionStore.get(token);
        if (!session || session.remainingQuota <= 0) return false;
        if (session.requestState === 'pending') return false;

        session.requestState = 'pending';
        session.remainingQuota -= 1;
        return true;
    }

    /**
     * Commits a pending deduction after successful request handling.
     */
    commitRequest(token: string): void {
        const session = this.sessionStore.get(token);
        if (!session || session.requestState !== 'pending') return;
        session.requestState = 'idle';
    }

    /**
     * Rolls back a pending deduction when request handling fails.
     */
    rollbackRequest(token: string): void {
        const session = this.sessionStore.get(token);
        if (!session || session.requestState !== 'pending') return;
        session.requestState = 'idle';
        session.remainingQuota += 1;
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
                error: 'Payment Required',
                message: 'Payment Required. Please check WWW-Authenticate header or body for details.',
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
