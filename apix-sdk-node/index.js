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
        this.rpcUrl = config.rpcUrl || process.env.APIX_RPC_URL || '';
        this.rpcTimeoutMs = this.parseEnvInt(config.rpcTimeoutMs, process.env.APIX_RPC_TIMEOUT_MS, 8000);
        if (this.rpcTimeoutMs <= 0) {
            this.rpcTimeoutMs = 8000;
        }
        this.rpcMaxRetries = this.parseEnvInt(config.rpcMaxRetries, process.env.APIX_RPC_MAX_RETRIES, 2);
        if (this.rpcMaxRetries < 0) {
            this.rpcMaxRetries = 2;
        }
        this.defaultMinConfirmations = this.parseEnvInt(config.defaultMinConfirmations, process.env.APIX_MIN_CONFIRMATIONS, 1);
        if (this.defaultMinConfirmations <= 0) {
            this.defaultMinConfirmations = 1;
        }
        this.jwtTtlSeconds = this.parseEnvInt(config.jwtTtlSeconds, process.env.APIX_JWT_TTL_SECONDS, 60);
        if (!Number.isFinite(this.jwtTtlSeconds) || this.jwtTtlSeconds <= 0) {
            this.jwtTtlSeconds = 60;
        }
        this.jwtIssuer = (config.jwtIssuer || process.env.APIX_JWT_ISSUER || 'apix-sdk').trim();
        this.jwtKid = (config.jwtKid || process.env.APIX_JWT_KID || 'v1').trim();
        this.sessionAuthorityUrl = config.sessionAuthorityUrl || process.env.APIX_SESSION_AUTHORITY_URL || this.facilitatorUrl;
        this.useCloudSessionState = config.useCloudSessionState
            ?? String(process.env.APIX_USE_CLOUD_SESSION_STATE || '').trim().toLowerCase() === 'true';
        this.useCloudVerification = config.useCloudVerification
            ?? String(process.env.APIX_USE_CLOUD_VERIFICATION || 'true').trim().toLowerCase() === 'true';
        this.jwtSecret = config.jwtSecret || process.env.APIX_JWT_SECRET || '';
        if (!this.jwtSecret) {
            throw new Error('Missing APIX_JWT_SECRET (or provide jwtSecret in ApixMiddleware config).');
        }
        if (!this.useCloudVerification && !this.rpcUrl) {
            throw new Error('Missing APIX_RPC_URL (or set useCloudVerification=true to use facilitator verification).');
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
        this.verificationPairCache = new Map();
        this.verificationTxOwner = new Map();
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
            return this.startRequestWithResult(token).started;
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
    async startRequestStateWithResult(token) {
        if (!this.useCloudSessionState) {
            return this.startRequestWithResult(token);
        }
        if (!token) {
            return { started: false, code: 'session_not_found', message: 'Session token is missing.' };
        }
        try {
            const payload = await this.postSessionAction('/v1/session/start', token);
            return {
                started: !!payload?.started,
                code: typeof payload?.code === 'string'
                    ? payload.code
                    : (!!payload?.started ? 'session_started' : 'session_start_failed'),
                message: typeof payload?.message === 'string'
                    ? payload.message
                    : (!!payload?.started ? 'Session start succeeded.' : 'Session start failed.')
            };
        }
        catch (error) {
            const remoteError = error?.response?.data;
            if (remoteError) {
                return {
                    started: false,
                    code: remoteError.code || 'session_start_failed',
                    message: remoteError.message || 'Session start failed.'
                };
            }
            return { started: false, code: 'session_state_unavailable', message: 'Failed to update session state.' };
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
    parseRequestId(token) {
        return (token || '').trim();
    }
    parseNetworkChainId(network) {
        const trimmed = (network || '').trim();
        const parts = trimmed.split(':');
        if (parts.length !== 2 || parts[0] !== 'eip155') {
            throw new Error(`network must be CAIP-2 format eip155:<chain_id>, got ${network || '(empty)'}`);
        }
        const chainIdPart = parts[1];
        if (!chainIdPart) {
            throw new Error(`invalid chain id in network "${network}"`);
        }
        const chainId = Number.parseInt(chainIdPart, 10);
        if (!Number.isFinite(chainId) || chainId <= 0) {
            throw new Error(`invalid chain id in network "${network}"`);
        }
        return chainId;
    }
    parseEnvInt(configValue, envValue, fallback) {
        if (typeof configValue === 'number' && Number.isFinite(configValue)) {
            return configValue;
        }
        const source = configValue === undefined ? envValue : String(configValue);
        const parsed = Number.parseInt((source || '').trim(), 10);
        if (Number.isFinite(parsed)) {
            return parsed;
        }
        return fallback;
    }
    parseHexToBigInt(value, label) {
        const normalized = (value || '').trim().replace(/^0x/i, '');
        if (!normalized) {
            throw new Error(`failed to parse ${label}`);
        }
        try {
            return BigInt(`0x${normalized}`);
        }
        catch (_error) {
            throw new Error(`failed to parse ${label}`);
        }
    }
    async rpcCall(method, params) {
        const payload = {
            jsonrpc: '2.0',
            id: 1,
            method,
            params
        };
        let lastError = `rpc ${method} failed`;
        const attempts = Math.max(0, this.rpcMaxRetries) + 1;
        for (let attempt = 1; attempt <= attempts; attempt += 1) {
            try {
                const response = await axios_1.default.post(this.rpcUrl, payload, { timeout: this.rpcTimeoutMs });
                if (!response) {
                    throw new Error(`rpc ${method} returned no response`);
                }
                if (!response.data) {
                    throw new Error(`rpc ${method} returned empty body`);
                }
                if (response.status >= 400) {
                    throw new Error(`rpc http error status=${response.status}`);
                }
                if (response.data.error) {
                    throw new Error(`rpc error code=${response.data.error.code} message=${response.data.error.message}`);
                }
                return response.data.result;
            }
            catch (error) {
                lastError = error?.message || lastError;
                if (attempt < attempts) {
                    await new Promise((resolve) => setTimeout(resolve, attempt * 150));
                    continue;
                }
                throw new Error(lastError);
            }
        }
        throw new Error(lastError);
    }
    isL1RetryableError(message) {
        const lowercase = message.toLowerCase();
        const retryablePatterns = [
            'failed to get transaction',
            'failed to get receipt',
            'failed to get chain id from rpc',
            'failed to get latest block number',
            'rpc http error',
            'rpc error'
        ];
        return retryablePatterns.some((pattern) => lowercase.includes(pattern));
    }
    cleanupVerificationCache() {
        const now = Date.now();
        for (const [key, record] of this.verificationPairCache.entries()) {
            if (record.expiresAt <= now) {
                this.verificationPairCache.delete(key);
                if (this.verificationTxOwner.get(record.txHash) === record.requestId) {
                    this.verificationTxOwner.delete(record.txHash);
                }
            }
        }
    }
    getPairCacheKey(requestId, txHash) {
        const normalizedRequestId = requestId || '';
        return `${normalizedRequestId}:${txHash}`;
    }
    getCachedVerificationToken(requestId, txHash) {
        this.cleanupVerificationCache();
        const key = this.getPairCacheKey(requestId, txHash);
        const record = this.verificationPairCache.get(key);
        if (!record || record.expiresAt <= Date.now()) {
            this.verificationPairCache.delete(key);
            return undefined;
        }
        return record.token;
    }
    setCachedVerificationToken(requestId, txHash, token, requestIdValue, expiresAt) {
        const key = this.getPairCacheKey(requestId, txHash);
        this.verificationPairCache.set(key, { token, expiresAt, requestId: requestIdValue, txHash });
        if (requestIdValue) {
            this.verificationTxOwner.set(txHash, requestIdValue);
        }
    }
    async verifyTransactionOnChain(txHash, payment) {
        if (!payment.network || !payment.recipient || !payment.amountWei) {
            throw new Error('missing_payment_info');
        }
        const tx = await this.rpcCall('eth_getTransactionByHash', [txHash]);
        if (!tx || !tx.hash || tx.hash.toLowerCase() !== txHash.toLowerCase()) {
            throw new Error('transaction not found');
        }
        if (!tx.blockNumber || tx.blockNumber === '0x') {
            throw new Error('transaction is not confirmed yet');
        }
        const receipt = await this.rpcCall('eth_getTransactionReceipt', [txHash]);
        if (!receipt || !receipt.transactionHash) {
            throw new Error('transaction receipt not found');
        }
        if (receipt.status !== '0x1') {
            throw new Error('transaction execution failed');
        }
        const expectedRecipient = payment.recipient.toLowerCase().trim();
        const actualRecipient = (tx.to || '').toLowerCase().trim();
        if (expectedRecipient !== actualRecipient) {
            throw new Error(`recipient mismatch expected=${expectedRecipient} actual=${actualRecipient}`);
        }
        const onChainValue = this.parseHexToBigInt(tx.value, 'transaction value');
        const expectedValue = BigInt(payment.amountWei);
        if (onChainValue < expectedValue) {
            throw new Error(`insufficient payment expected=${payment.amountWei} actual=${onChainValue.toString()}`);
        }
        const expectedChainId = this.parseNetworkChainId(payment.network);
        const rpcChainId = this.parseHexToBigInt(await this.rpcCall('eth_chainId', []), 'rpc chain id');
        if (rpcChainId !== BigInt(expectedChainId)) {
            throw new Error(`network mismatch expected_chain=${expectedChainId} rpc_chain=${rpcChainId.toString()}`);
        }
        if (payment.chainId && payment.chainId !== 0 && payment.chainId !== Number(rpcChainId)) {
            throw new Error(`chain_id mismatch request_chain=${payment.chainId} network_chain=${expectedChainId}`);
        }
        const txBlock = this.parseHexToBigInt(tx.blockNumber, 'transaction block number');
        const latestBlock = this.parseHexToBigInt(await this.rpcCall('eth_blockNumber', []), 'latest block number');
        if (latestBlock < txBlock) {
            throw new Error('latest block is behind transaction block');
        }
        const confirmations = Number(latestBlock - txBlock + BigInt(1));
        const minConfirmations = payment.minConfirmations && payment.minConfirmations > 0
            ? payment.minConfirmations
            : this.defaultMinConfirmations;
        if (confirmations < minConfirmations) {
            throw new Error(`insufficient confirmations required=${minConfirmations} actual=${confirmations}`);
        }
    }
    issueLocalSessionToken(payment, txHash) {
        const signOptions = {
            algorithm: 'HS256',
            expiresIn: this.jwtTtlSeconds,
            issuer: this.jwtIssuer,
            header: {
                kid: this.jwtKid
            }
        };
        const token = jwt.sign({
            tx_hash: txHash,
            max_requests: 100,
            request_id: payment.requestId,
            network: payment.network,
            recipient: payment.recipient,
            amount_wei: payment.amountWei,
            chain_id: payment.chainId,
            currency: payment.currency,
            iss: this.jwtIssuer
        }, this.jwtSecret, signOptions);
        const decoded = jwt.verify(token, this.jwtSecret, { issuer: this.jwtIssuer });
        return { token, claims: decoded };
    }
    /**
     * Verifies a payment transaction hash with Apix Cloud.
     * @param txHash The transaction hash from the client.
     */
    async verifyPayment(txHash, payment) {
        if (!txHash) {
            return { success: false, message: 'Transaction hash is missing.', code: 'missing_tx_hash', retryable: false };
        }
        const normalizedTxHash = txHash.trim();
        if (!normalizedTxHash) {
            return { success: false, message: 'Transaction hash is missing.', code: 'missing_tx_hash', retryable: false };
        }
        const requestId = this.parseRequestId(payment?.requestId);
        if (!this.useCloudVerification) {
            if (!payment) {
                return {
                    success: false,
                    message: 'Payment details are required for direct on-chain verification.',
                    code: 'invalid_request',
                    retryable: false,
                    requestId
                };
            }
            try {
                const cacheResult = this.getCachedVerificationToken(requestId, normalizedTxHash);
                if (cacheResult) {
                    return {
                        success: true,
                        token: cacheResult,
                        message: 'Verification already processed',
                        requestId
                    };
                }
                const existingOwner = this.verificationTxOwner.get(normalizedTxHash);
                if (existingOwner && existingOwner !== requestId) {
                    return {
                        success: false,
                        message: 'Transaction hash already used by another request',
                        code: 'tx_hash_already_used',
                        retryable: false,
                        requestId
                    };
                }
                await this.verifyTransactionOnChain(normalizedTxHash, payment);
                const { token, claims } = this.issueLocalSessionToken(payment, normalizedTxHash);
                this.sessionStore.set(token, {
                    claims,
                    remainingQuota: claims.max_requests || 10,
                    requestState: 'idle'
                });
                if (claims?.exp && typeof claims.exp === 'number') {
                    this.setCachedVerificationToken(requestId, normalizedTxHash, token, requestId, claims.exp * 1000);
                }
                else {
                    const fallbackExpiration = Date.now() + (this.jwtTtlSeconds * 1000);
                    this.setCachedVerificationToken(requestId, normalizedTxHash, token, requestId, fallbackExpiration);
                }
                return {
                    success: true,
                    token,
                    message: 'Verification successful',
                    requestId
                };
            }
            catch (error) {
                const message = error?.message || 'Verification failed.';
                const code = message === 'missing_payment_info'
                    ? 'invalid_request'
                    : message === 'transaction not found'
                        ? 'verification_failed'
                        : message === 'transaction is not confirmed yet'
                            ? 'verification_failed'
                            : message === 'transaction receipt not found'
                                ? 'verification_failed'
                                : message === 'transaction execution failed'
                                    ? 'verification_failed'
                                    : message.startsWith('recipient mismatch')
                                        ? 'verification_failed'
                                        : message.startsWith('insufficient payment')
                                            ? 'verification_failed'
                                            : message.startsWith('network mismatch')
                                                ? 'verification_failed'
                                                : message.startsWith('chain_id mismatch')
                                                    ? 'verification_failed'
                                                    : message.startsWith('latest block is behind')
                                                        ? 'verification_failed'
                                                        : message.startsWith('insufficient confirmations')
                                                            ? 'verification_failed'
                                                            : 'verification_failed';
                return {
                    success: false,
                    message,
                    code,
                    retryable: this.isL1RetryableError(message),
                    requestId
                };
            }
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
        return this.startRequestWithResult(token).started;
    }
    startRequestWithResult(token) {
        if (!token) {
            return { started: false, code: 'session_not_found', message: 'Session token is missing.' };
        }
        let started = false;
        const nextSession = this.updateSession(token, (session) => {
            if (!session) {
                return session;
            }
            if (session.requestState === 'pending') {
                return session;
            }
            if (session.remainingQuota <= 0) {
                return session;
            }
            started = true;
            return {
                ...session,
                requestState: 'pending',
                remainingQuota: session.remainingQuota - 1
            };
        });
        if (!nextSession || !started) {
            const current = this.sessionStore.get(token);
            if (!current) {
                return { started: false, code: 'session_not_found', message: 'Session not found.' };
            }
            if (current.requestState === 'pending') {
                return { started: false, code: 'session_request_in_progress', message: 'Session request is already in progress.' };
            }
            if (current.remainingQuota <= 0) {
                return { started: false, code: 'session_quota_exceeded', message: 'Session quota exceeded.' };
            }
            return { started: false, code: 'session_start_failed', message: 'Session start failed.' };
        }
        return { started: true, code: 'session_started', message: 'Session request started.' };
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
                code: 'payment_required',
                message: 'Payment required to access premium resource.',
                retryable: false,
                request_id: details.requestId,
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