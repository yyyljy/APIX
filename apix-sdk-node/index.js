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
const crypto = __importStar(require("crypto"));
const DEFAULT_APIX_CHAIN_ID = 402;
const DEFAULT_APIX_NETWORK = `eip155:${DEFAULT_APIX_CHAIN_ID}`;
const DEFAULT_APIX_RPC_URL = 'https://subnets.avax.network/apix/testnet/rpc';
class InMemorySessionStore {
    // constructor: helper function.
    constructor() {
        this.cache = new Map();
    }
    // get: helper function.
    get(token) {
        return this.cache.get(token);
    }
    // set: helper function.
    set(token, value) {
        this.cache.set(token, value);
    }
    // delete: helper function.
    delete(token) {
        this.cache.delete(token);
    }
}
exports.InMemorySessionStore = InMemorySessionStore;
class FileSessionStore {
    // constructor: helper function.
    constructor(filePath) {
        this.filePath = path.resolve(filePath);
        this.lockPath = `${this.filePath}.lock`;
        this.ensureStorageDirectory();
    }
    // get: helper function.
    get(token) {
        const snapshot = this.readSnapshot();
        return snapshot[token];
    }
    // set: helper function.
    set(token, value) {
        this.update(token, () => value);
    }
    // delete: helper function.
    delete(token) {
        this.update(token, () => undefined);
    }
    // update: helper function.
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
    // ensureStorageDirectory: helper function.
    ensureStorageDirectory() {
        const directory = path.dirname(this.filePath);
        fs.mkdirSync(directory, { recursive: true });
    }
    // readSnapshot: helper function.
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
    // writeSnapshot: helper function.
    writeSnapshot(snapshot) {
        this.ensureStorageDirectory();
        const tempPath = `${this.filePath}.tmp`;
        fs.writeFileSync(tempPath, JSON.stringify(snapshot), { encoding: 'utf8', mode: 0o600 });
        fs.renameSync(tempPath, this.filePath);
    }
}
exports.FileSessionStore = FileSessionStore;
class ApixMiddleware {
    // constructor: helper function.
    constructor(config = {}) {
        this.config = config;
        this.environment = (process.env.APIX_ENV || 'development').trim().toLowerCase();
        const rpcUrlFromEnv = (process.env.APIX_VERIFICATION_RPC_URL || DEFAULT_APIX_RPC_URL).trim();
        this.rpcUrl = (config.rpcUrl || rpcUrlFromEnv).trim();
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
        this.jwtSecret = config.jwtSecret || process.env.APIX_JWT_SECRET || '';
        if (!this.jwtSecret) {
            throw new Error('Missing APIX_JWT_SECRET (or provide jwtSecret in ApixMiddleware config).');
        }
        if (config.sessionStore) {
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
        this.paymentProfile = this.resolvePaymentProfile(config);
        this.verificationPairCache = new Map();
        this.verificationTxOwner = new Map();
    }
    // resolvePaymentProfile: helper function.
    resolvePaymentProfile(config) {
        const chainIdInput = this.resolveConfigValue(config.paymentChainId, [process.env.APIX_PAYMENT_CHAIN_ID, process.env.APIX_CHAIN_ID, String(DEFAULT_APIX_CHAIN_ID)]);
        const chainId = this.parseRequiredPositiveInt(chainIdInput, 'paymentChainId');
        const network = this.resolveConfigValue(config.paymentNetwork, [process.env.APIX_PAYMENT_NETWORK, process.env.APIX_NETWORK, DEFAULT_APIX_NETWORK]);
        const parsedNetworkChainId = this.parseNetworkChainId(network);
        if (chainId !== parsedNetworkChainId) {
            throw new Error(`Payment config mismatch: paymentChainId=${chainId} paymentNetwork=${network}`);
        }
        return this.validateResolvedPaymentDetails({
            requestId: 'payment_profile',
            chainId,
            network,
            currency: this.requireConfigValue(this.resolveConfigValue(config.paymentCurrency, [process.env.APIX_PAYMENT_CURRENCY]), 'paymentCurrency', ['APIX_PAYMENT_CURRENCY']),
            amount: this.requireConfigValue(this.resolveConfigValue(config.paymentAmount, [process.env.APIX_PAYMENT_AMOUNT]), 'paymentAmount', ['APIX_PAYMENT_AMOUNT']),
            amountWei: this.requireConfigValue(this.resolveConfigValue(config.paymentAmountWei, [process.env.APIX_PAYMENT_AMOUNT_WEI]), 'paymentAmountWei', ['APIX_PAYMENT_AMOUNT_WEI']),
            recipient: this.requireConfigValue(this.resolveConfigValue(config.paymentRecipient, [process.env.APIX_PAYMENT_RECIPIENT]), 'paymentRecipient', ['APIX_PAYMENT_RECIPIENT']),
            minConfirmations: this.parseOptionalPositiveInt(config.paymentMinConfirmations ?? process.env.APIX_PAYMENT_MIN_CONFIRMATIONS ?? process.env.APIX_MIN_CONFIRMATIONS, this.defaultMinConfirmations, 'paymentMinConfirmations')
        });
    }
    // createPaymentMiddleware: helper function.
    createPaymentMiddleware(getPaymentDetails = () => ({}), options = {}) {
        const extractRequestId = options.extractRequestId ?? ((req) => this.extractRequestId(req));
        const extractPaymentProof = options.extractPaymentProof ?? ((req) => this.extractPaymentProof(req));
        const getClientTypeHint = options.getClientTypeHint ?? ((clientType) => this.getClientTypeHint(clientType));
        const clientType = options.clientType ?? 'human';
        return async (req, res, next) => {
            const requestContext = {};
            if (req.get) {
                requestContext.get = req.get;
            }
            if (req.headers) {
                requestContext.headers = req.headers;
            }
            if (req.requestId) {
                requestContext.requestId = req.requestId;
            }
            const baseDetails = getPaymentDetails(requestContext) || {};
            const extractedRequestId = extractRequestId(requestContext) || baseDetails.requestId;
            const token = extractPaymentProof(requestContext);
            await this.handlePaymentContext({
                ...(extractedRequestId ? { requestId: extractedRequestId } : {}),
                paymentProof: token,
                clientType,
                paymentDetails: baseDetails
            }, res, next, {
                getClientTypeHint,
                onVerified: (proof) => {
                    req.apixProof = proof;
                }
            });
        };
    }
    async handlePaymentContext(context, res, next, options = {}) {
        const sendError = (res, code, overrides = {}) => {
            const definition = ApixMiddleware.API_ERROR_DEFINITIONS[code];
            const status = overrides.status ?? definition?.status ?? 500;
            const message = overrides.message ?? definition?.message ?? code;
            const retryable = overrides.retryable ?? definition?.retryable ?? false;
            const requestId = overrides.requestId;
            res.status(status).json({
                error: status >= 500 ? 'Internal Error' : 'Request Failed',
                code,
                message,
                retryable,
                request_id: requestId
            });
        };
        const getClientTypeHint = options.getClientTypeHint ?? ((clientType) => this.getClientTypeHint(clientType));
        const requestId = (context.requestId || this.extractRequestId({})).trim();
        const paymentDetails = this.validateResolvedPaymentDetails({
            ...this.paymentProfile,
            ...(context.paymentDetails || {}),
            requestId
        });
        const token = (context.paymentProof || '').trim();
        const clientType = context.clientType || 'human';
        if (!token) {
            const paymentResponse = this.createPaymentRequest(paymentDetails);
            const paymentHint = getClientTypeHint(clientType);
            const paymentBody = {
                ...paymentResponse.body,
                code: paymentResponse.body.code || 'payment_required',
                message: paymentResponse.body.message || 'Payment required to access premium resource.',
                retryable: paymentResponse.body.retryable ?? false
            };
            paymentBody.details = {
                ...paymentResponse.body.details,
                ...paymentHint
            };
            res.set(paymentResponse.headers);
            res.status(402).json(paymentBody);
            return false;
        }
        let validToken = '';
        if (this.isTxProof(token)) {
            const result = await this.verifyPayment(token, paymentDetails);
            if (!result.success || !result.token) {
                sendError(res, result.code || 'verification_failed', {
                    message: result.message,
                    retryable: result.retryable,
                    requestId: paymentDetails.requestId
                });
                return false;
            }
            validToken = result.token;
        }
        else if (await this.validateSessionState(token)) {
            validToken = token;
        }
        else {
            sendError(res, 'invalid_apix_session', { requestId: paymentDetails.requestId });
            return false;
        }
        const sessionStart = await this.startRequestStateWithResult(validToken);
        if (!sessionStart.started) {
            const code = sessionStart.code || 'session_start_failed';
            switch (code) {
                case 'session_request_in_progress':
                    sendError(res, 'session_request_in_progress', {
                        message: sessionStart.message,
                        retryable: true,
                        requestId: paymentDetails.requestId
                    });
                    break;
                case 'session_not_found':
                    sendError(res, 'invalid_apix_session', {
                        message: sessionStart.message,
                        requestId: paymentDetails.requestId
                    });
                    break;
                case 'session_quota_exceeded':
                    sendError(res, 'session_quota_exceeded', {
                        message: sessionStart.message,
                        requestId: paymentDetails.requestId
                    });
                    break;
                default:
                    sendError(res, code, {
                        message: sessionStart.message,
                        retryable: true,
                        requestId: paymentDetails.requestId
                    });
                    break;
            }
            return false;
        }
        let quotaFinalized = false;
        const finalizeQuota = () => {
            if (quotaFinalized)
                return;
            quotaFinalized = true;
            const finalStatusCode = res.statusCode ?? 0;
            if (finalStatusCode >= 200 && finalStatusCode < 300) {
                void this.commitRequestState(validToken);
                return;
            }
            void this.rollbackRequestState(validToken);
        };
        res.on('finish', finalizeQuota);
        res.on('close', finalizeQuota);
        options.onVerified?.(validToken);
        next();
        return true;
    }
    // extractPaymentProof: helper function.
    extractPaymentProof(req) {
        const parsePaymentSignature = (value) => {
            const raw = value.trim();
            if (!raw)
                return '';
            if (raw.startsWith('0x')) {
                return raw;
            }
            const txHashMatch = raw.match(/tx_hash=([0-9a-zA-Zx]+)/i);
            if (txHashMatch?.[1]) {
                return txHashMatch[1];
            }
            try {
                const parsed = JSON.parse(raw);
                if (typeof parsed?.txHash === 'string')
                    return parsed.txHash;
                if (typeof parsed?.tx_hash === 'string')
                    return parsed.tx_hash;
            }
            catch (_error) {
                // Keep parsing fallbacks only.
            }
            return '';
        };
        const normalizeHeaderValue = (value) => {
            if (typeof value === 'string') {
                return value.trim();
            }
            if (!Array.isArray(value)) {
                return '';
            }
            for (const item of value) {
                if (typeof item === 'string' && item.trim()) {
                    return item.trim();
                }
            }
            return '';
        };
        const authHeader = normalizeHeaderValue(req.headers?.authorization || req.get?.('authorization'));
        if (authHeader.toLowerCase().startsWith('apix ')) {
            const token = authHeader.substring(authHeader.indexOf(' ') + 1);
            if (token) {
                return token.trim();
            }
        }
        const paymentSignature = normalizeHeaderValue(req.headers?.['payment-signature'] || req.get?.('payment-signature'));
        if (typeof paymentSignature === 'string') {
            return parsePaymentSignature(paymentSignature);
        }
        return '';
    }
    // extractRequestId: helper function.
    extractRequestId(req) {
        const fromHeader = this.normalizeHeaderValue(req.headers?.['x-request-id'] || req.get?.('x-request-id'));
        if (fromHeader) {
            return fromHeader;
        }
        const fromReq = req.requestId;
        if (fromReq) {
            return String(fromReq);
        }
        return `req_${crypto.randomUUID()}`;
    }
    normalizeHeaderValue(value) {
        if (typeof value === 'string') {
            return value.trim();
        }
        if (!Array.isArray(value)) {
            return '';
        }
        for (const item of value) {
            if (typeof item === 'string' && item.trim()) {
                return item.trim();
            }
        }
        return '';
    }
    // getClientTypeHint: helper function.
    getClientTypeHint(clientType) {
        if (clientType === 'agent') {
            return {
                payment_flow: 'agent_submit_tx_hash',
                payment_hint: {
                    mode: 'agent',
                    required_action: 'Submit tx hash to retry as Authorization header',
                    authorization_scheme: 'Apix <tx_hash>',
                    verification_hint: 'Call Authorization: Apix <tx_hash> with X-Request-ID equal to payment request_id.'
                },
                payment_channels: ['agent_tx_hash'],
                channels: ['agent_tx_hash']
            };
        }
        return {
            payment_flow: 'wallet_submit',
            payment_hint: {
                mode: 'human',
                required_action: 'Open wallet and pay on-chain',
                wallet_hint: 'MetaMask is required for demo.',
                verification_hint: 'SDK/API retries automatically after transaction hash is submitted.'
            },
            payment_channels: ['evm_wallet'],
            channels: ['evm_wallet']
        };
    }
    isTxProof(token) {
        return token.startsWith('0x') && token.length < 100;
    }
    // updateSession: helper function.
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
    // validateSessionState: helper function.
    async validateSessionState(token) {
        return this.validateSession(token);
    }
    // startRequestState: helper function.
    async startRequestState(token) {
        const result = await this.startRequestStateWithResult(token);
        return result.started;
    }
    // startRequestStateWithResult: helper function.
    async startRequestStateWithResult(token) {
        if (!token) {
            return { started: false, code: 'session_not_found', message: 'Session token is missing.' };
        }
        const result = this.startRequestWithResult(token);
        if (!result.started) {
            return result;
        }
        return {
            started: true,
            code: 'session_started',
            message: 'Session start succeeded.'
        };
    }
    // commitRequestState: helper function.
    async commitRequestState(token) {
        this.commitRequest(token);
    }
    // rollbackRequestState: helper function.
    async rollbackRequestState(token) {
        this.rollbackRequest(token);
    }
    // parseRequestId: helper function.
    parseRequestId(token) {
        return (token || '').trim();
    }
    // parseAmountWei: helper function.
    parseAmountWei(value, label) {
        const trimmed = (value || '').trim();
        if (!trimmed) {
            throw new Error(`Missing ${label}.`);
        }
        if (!/^\d+$/.test(trimmed)) {
            throw new Error(`Invalid ${label}: expected positive integer string, got "${value || ''}".`);
        }
        if (BigInt(trimmed) <= BigInt(0)) {
            throw new Error(`Invalid ${label}: expected value greater than zero.`);
        }
        return trimmed;
    }
    // parseNetworkChainId: helper function.
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
    resolveConfigValue(configValue, envCandidates) {
        if (typeof configValue === 'number' && Number.isFinite(configValue)) {
            return String(configValue);
        }
        if (typeof configValue === 'string' && configValue.trim()) {
            return configValue.trim();
        }
        for (const candidate of envCandidates) {
            const trimmed = (candidate || '').trim();
            if (trimmed) {
                return trimmed;
            }
        }
        return '';
    }
    requireConfigValue(value, configLabel, envLabels) {
        const trimmed = (value || '').trim();
        if (trimmed) {
            return trimmed;
        }
        throw new Error(`Missing ${envLabels.join(' or ')} (or provide ${configLabel} in ApixMiddleware config).`);
    }
    parseRequiredPositiveInt(value, label) {
        if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
            return Math.floor(value);
        }
        const normalized = String(value ?? '').trim();
        if (!/^\d+$/.test(normalized)) {
            throw new Error(`Invalid ${label}: expected positive integer, got "${normalized}".`);
        }
        const parsed = Number.parseInt(normalized, 10);
        if (!Number.isFinite(parsed) || parsed <= 0) {
            throw new Error(`Invalid ${label}: expected value greater than zero.`);
        }
        return parsed;
    }
    parseOptionalPositiveInt(value, fallback, label) {
        if (value === undefined || value === null || (typeof value === 'string' && !value.trim())) {
            return fallback;
        }
        return this.parseRequiredPositiveInt(value, label);
    }
    validateCurrency(value, label) {
        const trimmed = (value || '').trim();
        if (!trimmed) {
            throw new Error(`Missing ${label}.`);
        }
        if (!/^[A-Za-z0-9._-]+$/.test(trimmed)) {
            throw new Error(`Invalid ${label}: "${value || ''}".`);
        }
        return trimmed;
    }
    validateAmount(value, label) {
        const trimmed = (value || '').trim();
        if (!trimmed) {
            throw new Error(`Missing ${label}.`);
        }
        if (!/^\d+(\.\d+)?$/.test(trimmed)) {
            throw new Error(`Invalid ${label}: expected decimal string, got "${value || ''}".`);
        }
        const normalized = trimmed.replace('.', '');
        if (!/[1-9]/.test(normalized)) {
            throw new Error(`Invalid ${label}: expected value greater than zero.`);
        }
        return trimmed;
    }
    validateRecipient(value, label) {
        const trimmed = (value || '').trim();
        if (!trimmed) {
            throw new Error(`Missing ${label}.`);
        }
        if (!/^0x[a-fA-F0-9]{40}$/.test(trimmed)) {
            throw new Error(`Invalid ${label}: expected EVM address, got "${value || ''}".`);
        }
        return trimmed;
    }
    validateResolvedPaymentDetails(details) {
        const requestId = (details.requestId || '').trim();
        if (!requestId) {
            throw new Error('Payment details require a requestId.');
        }
        const chainId = this.parseRequiredPositiveInt(details.chainId, 'paymentDetails.chainId');
        const network = (details.network || '').trim();
        if (!network) {
            throw new Error('Missing paymentDetails.network.');
        }
        const networkChainId = this.parseNetworkChainId(network);
        if (networkChainId !== chainId) {
            throw new Error(`Payment details mismatch: chainId=${chainId} network=${network}`);
        }
        return {
            requestId,
            chainId,
            network,
            currency: this.validateCurrency(details.currency, 'paymentDetails.currency'),
            amount: this.validateAmount(details.amount, 'paymentDetails.amount'),
            amountWei: this.parseAmountWei(details.amountWei, 'paymentDetails.amountWei'),
            recipient: this.validateRecipient(details.recipient, 'paymentDetails.recipient'),
            minConfirmations: this.parseOptionalPositiveInt(details.minConfirmations, this.defaultMinConfirmations, 'paymentDetails.minConfirmations')
        };
    }
    // parseEnvInt: helper function.
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
    // parseHexToBigInt: helper function.
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
    // isL1RetryableError: helper function.
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
    // cleanupVerificationCache: helper function.
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
    // getPairCacheKey: helper function.
    getPairCacheKey(requestId, txHash) {
        const normalizedRequestId = requestId || '';
        return `${normalizedRequestId}:${txHash}`;
    }
    // getCachedVerificationToken: helper function.
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
    // setCachedVerificationToken: helper function.
    setCachedVerificationToken(requestId, txHash, token, requestIdValue, expiresAt) {
        const key = this.getPairCacheKey(requestId, txHash);
        this.verificationPairCache.set(key, { token, expiresAt, requestId: requestIdValue, txHash });
        if (requestIdValue) {
            this.verificationTxOwner.set(txHash, requestIdValue);
        }
    }
    // verifyTransactionOnChain: helper function.
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
    // issueLocalSessionToken: helper function.
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
        }, this.jwtSecret, signOptions);
        const decoded = jwt.verify(token, this.jwtSecret, { issuer: this.jwtIssuer });
        return { token, claims: decoded };
    }
    /**
     * Verifies a payment transaction hash directly on-chain (Avalanche L1).
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
        if (!payment) {
            return {
                success: false,
                message: 'Payment details are required for on-chain verification.',
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
    // startRequestWithResult: helper function.
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
ApixMiddleware.API_ERROR_DEFINITIONS = {
    invalid_stripe_session: {
        status: 401,
        message: 'Missing or invalid Stripe session.',
        retryable: false
    },
    invalid_apix_session: {
        status: 403,
        message: 'Invalid or expired Apix session.',
        retryable: false
    },
    session_not_found: {
        status: 403,
        message: 'Session token not found or expired.',
        retryable: false
    },
    session_request_in_progress: {
        status: 409,
        message: 'Session request is already in progress.',
        retryable: true
    },
    session_quota_exceeded: {
        status: 402,
        message: 'Session quota exceeded.',
        retryable: false
    },
    session_start_failed: {
        status: 403,
        message: 'Session start failed.',
        retryable: false
    },
    missing_tx_hash: {
        status: 400,
        message: 'Transaction hash is missing.',
        retryable: false
    },
    tx_hash_already_used: {
        status: 403,
        message: 'Transaction hash already used by another request.',
        retryable: false
    },
    verification_failed: {
        status: 403,
        message: 'Verification failed.',
        retryable: false
    },
    internal_error: {
        status: 500,
        message: 'Internal error.',
        retryable: true
    },
    payment_required: {
        status: 402,
        message: 'Payment required to access premium resource.',
        retryable: false
    }
};
//# sourceMappingURL=index.js.map