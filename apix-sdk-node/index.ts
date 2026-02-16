import axios from 'axios';
import * as jwt from 'jsonwebtoken';
import * as fs from 'fs';
import * as path from 'path';

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
    sessionStorePath?: string;
    sessionStore?: SessionStore;
    sessionAuthorityUrl?: string;
    useCloudSessionState?: boolean;
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

type SessionStoreSnapshot = Record<string, SessionData>;

export class FileSessionStore implements SessionStore {
    private filePath: string;
    private lockPath: string;

    constructor(filePath: string) {
        this.filePath = path.resolve(filePath);
        this.lockPath = `${this.filePath}.lock`;
        this.ensureStorageDirectory();
    }

    get(token: string): SessionData | undefined {
        const snapshot = this.readSnapshot();
        return snapshot[token];
    }

    set(token: string, value: SessionData): void {
        this.update(token, () => value);
    }

    delete(token: string): void {
        this.update(token, () => undefined);
    }

    update(token: string, updater: (value: SessionData | undefined) => SessionData | undefined): SessionData | undefined {
        return this.withLock(() => {
            const snapshot = this.readSnapshot();
            const current = snapshot[token];
            const next = updater(current);
            if (next) {
                snapshot[token] = next;
            } else {
                delete snapshot[token];
            }
            this.writeSnapshot(snapshot);
            return next;
        });
    }

    private withLock<T>(operation: () => T): T {
        this.ensureStorageDirectory();
        const maxAttempts = 200;
        for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
            let fd: number | null = null;
            try {
                fd = fs.openSync(this.lockPath, 'wx', 0o600);
                const result = operation();
                fs.closeSync(fd);
                fs.rmSync(this.lockPath, { force: true });
                return result;
            } catch (error: any) {
                if (fd !== null) {
                    try { fs.closeSync(fd); } catch (_closeErr) { /* ignore */ }
                    fs.rmSync(this.lockPath, { force: true });
                }
                if (error?.code !== 'EEXIST') {
                    throw error;
                }
                const backoffUntil = Date.now() + 10;
                while (Date.now() < backoffUntil) {
                    // Busy-wait fallback to keep sync API.
                }
            }
        }
        throw new Error(`Timed out acquiring session store lock: ${this.lockPath}`);
    }

    private ensureStorageDirectory(): void {
        const directory = path.dirname(this.filePath);
        fs.mkdirSync(directory, { recursive: true });
    }

    private readSnapshot(): SessionStoreSnapshot {
        try {
            if (!fs.existsSync(this.filePath)) {
                return {};
            }
            const raw = fs.readFileSync(this.filePath, 'utf8');
            if (!raw.trim()) {
                return {};
            }
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === 'object') {
                return parsed as SessionStoreSnapshot;
            }
        } catch (_error) {
            // Corrupted or inaccessible state should not crash request handling.
        }
        return {};
    }

    private writeSnapshot(snapshot: SessionStoreSnapshot): void {
        this.ensureStorageDirectory();
        const tempPath = `${this.filePath}.tmp`;
        fs.writeFileSync(tempPath, JSON.stringify(snapshot), { encoding: 'utf8', mode: 0o600 });
        fs.renameSync(tempPath, this.filePath);
    }
}

export class ApixMiddleware {
    private config: ApixConfig;
    private environment: string;
    private facilitatorUrl: string;
    private sessionAuthorityUrl: string;
    private useCloudSessionState: boolean;
    private sessionStore: SessionStore;
    private jwtSecret: string;

    constructor(config: ApixConfig = {}) {
        this.config = config;
        this.environment = (process.env.APIX_ENV || 'development').trim().toLowerCase();
        this.facilitatorUrl = config.facilitatorUrl || 'http://localhost:8080';
        this.sessionAuthorityUrl = config.sessionAuthorityUrl || process.env.APIX_SESSION_AUTHORITY_URL || this.facilitatorUrl;
        this.useCloudSessionState = config.useCloudSessionState
            ?? String(process.env.APIX_USE_CLOUD_SESSION_STATE || '').trim().toLowerCase() === 'true';
        this.jwtSecret = config.jwtSecret || process.env.APIX_JWT_SECRET || '';
        if (!this.jwtSecret) {
            throw new Error('Missing APIX_JWT_SECRET (or provide jwtSecret in ApixMiddleware config).');
        }

        if (this.environment === 'production' && !this.useCloudSessionState) {
            throw new Error('Missing distributed session authority: set APIX_USE_CLOUD_SESSION_STATE=true in production.');
        }

        if (this.useCloudSessionState) {
            this.sessionStore = config.sessionStore || new InMemorySessionStore();
        } else if (config.sessionStore) {
            this.sessionStore = config.sessionStore;
        } else {
            const sessionStorePath = config.sessionStorePath || process.env.APIX_SESSION_STORE_PATH || '';
            if (this.environment === 'production' && !sessionStorePath) {
                throw new Error('Missing durable session store: set APIX_SESSION_STORE_PATH or provide sessionStore in production.');
            }
            this.sessionStore = sessionStorePath
                ? new FileSessionStore(sessionStorePath)
                : new InMemorySessionStore();
        }
    }

    private updateSession(token: string, updater: (value: SessionData | undefined) => SessionData | undefined): SessionData | undefined {
        const candidate = this.sessionStore as any;
        if (candidate && typeof candidate.update === 'function') {
            return candidate.update(token, updater);
        }
        const current = this.sessionStore.get(token);
        const next = updater(current);
        if (next) {
            this.sessionStore.set(token, next);
        } else if (current) {
            this.sessionStore.delete(token);
        }
        return next;
    }

    private async postSessionAction(pathname: string, token: string): Promise<any> {
        const response = await axios.post(`${this.sessionAuthorityUrl}${pathname}`, { token }, {
            timeout: 5000
        });
        return response?.data || {};
    }

    async validateSessionState(token: string): Promise<boolean> {
        if (!this.useCloudSessionState) {
            return this.validateSession(token);
        }
        if (!token) {
            return false;
        }
        try {
            const payload = await this.postSessionAction('/v1/session/validate', token);
            return !!payload?.valid;
        } catch (_error) {
            return false;
        }
    }

    async startRequestState(token: string): Promise<boolean> {
        if (!this.useCloudSessionState) {
            return this.startRequest(token);
        }
        if (!token) {
            return false;
        }
        try {
            const payload = await this.postSessionAction('/v1/session/start', token);
            return !!payload?.started;
        } catch (_error) {
            return false;
        }
    }

    async commitRequestState(token: string): Promise<void> {
        if (!this.useCloudSessionState) {
            this.commitRequest(token);
            return;
        }
        if (!token) {
            return;
        }
        await this.postSessionAction('/v1/session/commit', token);
    }

    async rollbackRequestState(token: string): Promise<void> {
        if (!this.useCloudSessionState) {
            this.rollbackRequest(token);
            return;
        }
        if (!token) {
            return;
        }
        await this.postSessionAction('/v1/session/rollback', token);
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

                    if (!this.useCloudSessionState) {
                        this.sessionStore.set(token, {
                            claims: decoded,
                            remainingQuota: decoded.max_requests || 10,
                            requestState: 'idle'
                        });
                    }

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
            this.updateSession(token, () => undefined);
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
        let started = false;
        const nextSession = this.updateSession(token, (session) => {
            if (!session || session.remainingQuota <= 0) return session;
            if (session.requestState === 'pending') return session;
            started = true;
            return {
                ...session,
                requestState: 'pending',
                remainingQuota: session.remainingQuota - 1
            };
        });
        return started && !!nextSession && nextSession.requestState === 'pending';
    }

    /**
     * Commits a pending deduction after successful request handling.
     */
    commitRequest(token: string): void {
        this.updateSession(token, (session) => {
            if (!session || session.requestState !== 'pending') return session;
            return {
                ...session,
                requestState: 'idle'
            };
        });
    }

    /**
     * Rolls back a pending deduction when request handling fails.
     */
    rollbackRequest(token: string): void {
        this.updateSession(token, (session) => {
            if (!session || session.requestState !== 'pending') return session;
            return {
                ...session,
                requestState: 'idle',
                remainingQuota: session.remainingQuota + 1
            };
        });
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
