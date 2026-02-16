"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ApixMiddleware = exports.FileSessionStore = exports.InMemorySessionStore = void 0;
const axios_1 = __importDefault(require("axios"));
const jwt = __importStar(require("jsonwebtoken"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
class InMemorySessionStore {
    constructor() {
        this.cache = new Map();
    }
    get(token) {
        return this.cache.get(token);
    }
    set(token, value) {
        this.cache.set(token, value);
    }
    delete(token) {
        this.cache.delete(token);
    }
}
exports.InMemorySessionStore = InMemorySessionStore;
class FileSessionStore {
    constructor(filePath) {
        this.filePath = path.resolve(filePath);
        this.lockPath = `${this.filePath}.lock`;
        this.ensureStorageDirectory();
    }
    get(token) {
        const snapshot = this.readSnapshot();
        return snapshot[token];
    }
    set(token, value) {
        this.update(token, () => value);
    }
    delete(token) {
        this.update(token, () => undefined);
    }
    update(token, updater) {
        return this.withLock(() => {
            const snapshot = this.readSnapshot();
            const current = snapshot[token];
            const next = updater(current);
            if (next) {
                snapshot[token] = next;
            }
            else {
                delete snapshot[token];
            }
            this.writeSnapshot(snapshot);
            return next;
        });
    }
    withLock(operation) {
        this.ensureStorageDirectory();
        const maxAttempts = 200;
        for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
            let fd = null;
            try {
                fd = fs.openSync(this.lockPath, 'wx', 0o600);
                const result = operation();
                fs.closeSync(fd);
                fs.rmSync(this.lockPath, { force: true });
                return result;
            }
            catch (error) {
                if (fd !== null) {
                    try {
                        fs.closeSync(fd);
                    }
                    catch (_closeErr) { /* ignore */ }
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
    ensureStorageDirectory() {
        const directory = path.dirname(this.filePath);
        fs.mkdirSync(directory, { recursive: true });
    }
    readSnapshot() {
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
                return parsed;
            }
        }
        catch (_error) {
            // Corrupted or inaccessible state should not crash request handling.
        }
        return {};
    }
    writeSnapshot(snapshot) {
        this.ensureStorageDirectory();
        const tempPath = `${this.filePath}.tmp`;
        fs.writeFileSync(tempPath, JSON.stringify(snapshot), { encoding: 'utf8', mode: 0o600 });
        fs.renameSync(tempPath, this.filePath);
    }
}
exports.FileSessionStore = FileSessionStore;
class ApixMiddleware {
    constructor(config = {}) {
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
        }
        else if (config.sessionStore) {
            this.sessionStore = config.sessionStore;
        }
        else {
            const sessionStorePath = config.sessionStorePath || process.env.APIX_SESSION_STORE_PATH || '';
            if (this.environment === 'production' && !sessionStorePath) {
                throw new Error('Missing durable session store: set APIX_SESSION_STORE_PATH or provide sessionStore in production.');
            }
            this.sessionStore = sessionStorePath
                ? new FileSessionStore(sessionStorePath)
                : new InMemorySessionStore();
        }
    }
    updateSession(token, updater) {
        const candidate = this.sessionStore;
        if (candidate && typeof candidate.update === 'function') {
            return candidate.update(token, updater);
        }
        const current = this.sessionStore.get(token);
        const next = updater(current);
        if (next) {
            this.sessionStore.set(token, next);
        }
        else if (current) {
            this.sessionStore.delete(token);
        }
        return next;
    }
    async postSessionAction(pathname, token) {
        const response = await axios_1.default.post(`${this.sessionAuthorityUrl}${pathname}`, { token }, {
            timeout: 5000
        });
        return response?.data || {};
    }
    async validateSessionState(token) {
        if (!this.useCloudSessionState) {
            return this.validateSession(token);
        }
        if (!token) {
            return false;
        }
        try {
            const payload = await this.postSessionAction('/v1/session/validate', token);
            return !!payload?.valid;
        }
        catch (_error) {
            return false;
        }
    }
    async startRequestState(token) {
        if (!this.useCloudSessionState) {
            return this.startRequest(token);
        }
        if (!token) {
            return false;
        }
        try {
            const payload = await this.postSessionAction('/v1/session/start', token);
            return !!payload?.started;
        }
        catch (_error) {
            return false;
        }
    }
    async commitRequestState(token) {
        if (!this.useCloudSessionState) {
            this.commitRequest(token);
            return;
        }
        if (!token) {
            return;
        }
        await this.postSessionAction('/v1/session/commit', token);
    }
    async rollbackRequestState(token) {
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
    async verifyPayment(txHash, payment) {
        if (!txHash) {
            return { success: false, message: 'Transaction hash is missing.', code: 'missing_tx_hash', retryable: false };
        }
        try {
            const requestOptions = payment?.requestId
                ? { headers: { 'X-Request-ID': payment.requestId } }
                : {};
            const response = await axios_1.default.post(`${this.facilitatorUrl}/v1/verify`, {
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
                    const decoded = jwt.verify(token, this.jwtSecret);
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
                }
                catch (jwtError) {
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
        }
        catch (error) {
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
    validateSession(token) {
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
    startRequest(token) {
        let started = false;
        const nextSession = this.updateSession(token, (session) => {
            if (!session || session.remainingQuota <= 0)
                return session;
            if (session.requestState === 'pending')
                return session;
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
    commitRequest(token) {
        this.updateSession(token, (session) => {
            if (!session || session.requestState !== 'pending')
                return session;
            return {
                ...session,
                requestState: 'idle'
            };
        });
    }
    /**
     * Rolls back a pending deduction when request handling fails.
     */
    rollbackRequest(token) {
        this.updateSession(token, (session) => {
            if (!session || session.requestState !== 'pending')
                return session;
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
    createPaymentRequest(details) {
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
exports.ApixMiddleware = ApixMiddleware;
//# sourceMappingURL=index.js.map