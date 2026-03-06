import axios from 'axios';
import * as jwt from 'jsonwebtoken';
import * as fs from 'fs';
import * as path from 'path';

export interface SessionData {
    claims: any;
    remainingQuota: number;
    requestState: 'idle' | 'pending';
}

export interface SessionStartResult {
    started: boolean;
    code?: string;
    message?: string;
}

export interface SessionStore {
    get(token: string): SessionData | undefined;
    set(token: string, value: SessionData): void;
    delete(token: string): void;
}

export class InMemorySessionStore implements SessionStore {
    private cache: Map<string, SessionData>;

    // constructor: helper function.


    constructor() {
        this.cache = new Map();
    }

    // get: helper function.


    get(token: string): SessionData | undefined {
        return this.cache.get(token);
    }

    // set: helper function.


    set(token: string, value: SessionData): void {
        this.cache.set(token, value);
    }

    // delete: helper function.


    delete(token: string): void {
        this.cache.delete(token);
    }
}

export interface ApixConfig {
    apiKey?: string;
    jwtSecret?: string;
    rpcUrl?: string;
    rpcTimeoutMs?: number;
    rpcMaxRetries?: number;
    defaultMinConfirmations?: number;
    jwtTtlSeconds?: number;
    jwtIssuer?: string;
    jwtKid?: string;
    sessionStorePath?: string;
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
        code?: string;
        retryable?: boolean;
        request_id?: string;
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
interface RpcTransaction {
    hash: string;
    to: string;
    value: string;
    blockNumber: string;
}

interface RpcReceipt {
    transactionHash: string;
    blockNumber: string;
    status: string;
}

interface RpcResponse<T = unknown> {
    jsonrpc?: string;
    id?: number;
    result?: T;
    error?: {
        code: number;
        message: string;
    };
}

interface LocalVerificationRecord {
    token: string;
    expiresAt: number;
    requestId: string;
    txHash: string;
}

export class FileSessionStore implements SessionStore {
    private filePath: string;
    private lockPath: string;

    // constructor: helper function.


    constructor(filePath: string) {
        this.filePath = path.resolve(filePath);
        this.lockPath = `${this.filePath}.lock`;
        this.ensureStorageDirectory();
    }

    // get: helper function.


    get(token: string): SessionData | undefined {
        const snapshot = this.readSnapshot();
        return snapshot[token];
    }

    // set: helper function.


    set(token: string, value: SessionData): void {
        this.update(token, () => value);
    }

    // delete: helper function.


    delete(token: string): void {
        this.update(token, () => undefined);
    }

    // update: helper function.


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

    // ensureStorageDirectory: helper function.


    private ensureStorageDirectory(): void {
        const directory = path.dirname(this.filePath);
        fs.mkdirSync(directory, { recursive: true });
    }

    // readSnapshot: helper function.


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

    // writeSnapshot: helper function.


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
    private rpcUrl: string;
    private rpcTimeoutMs: number;
    private rpcMaxRetries: number;
    private defaultMinConfirmations: number;
    private jwtTtlSeconds: number;
    private jwtIssuer: string;
    private jwtKid: string;
    private sessionStore: SessionStore;
    private jwtSecret: string;
    private verificationPairCache: Map<string, LocalVerificationRecord>;
    private verificationTxOwner: Map<string, string>;

    // constructor: helper function.


    constructor(config: ApixConfig = {}) {
        this.config = config;
        this.environment = (process.env.APIX_ENV || 'development').trim().toLowerCase();
        const rpcUrlFromEnv = (process.env.APIX_VERIFICATION_RPC_URL || '').trim();
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
        if (!this.rpcUrl) {
            throw new Error('Missing APIX_VERIFICATION_RPC_URL (or config.rpcUrl) for on-chain verification.');
        }
        if (config.sessionStore) {
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

        this.verificationPairCache = new Map();
        this.verificationTxOwner = new Map();
    }

    // updateSession: helper function.


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

    // validateSessionState: helper function.


    async validateSessionState(token: string): Promise<boolean> {
        return this.validateSession(token);
    }

    // startRequestState: helper function.


    async startRequestState(token: string): Promise<boolean> {
        const result = await this.startRequestStateWithResult(token);
        return result.started;
    }

    // startRequestStateWithResult: helper function.


    async startRequestStateWithResult(token: string): Promise<SessionStartResult> {
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


    async commitRequestState(token: string): Promise<void> {
        this.commitRequest(token);
    }

    // rollbackRequestState: helper function.


    async rollbackRequestState(token: string): Promise<void> {
        this.rollbackRequest(token);
    }

    // parseRequestId: helper function.


    private parseRequestId(token?: string): string {
        return (token || '').trim();
    }

    // parseNetworkChainId: helper function.


    private parseNetworkChainId(network: string): number {
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

    // parseEnvInt: helper function.


    private parseEnvInt(configValue: number | string | undefined, envValue: string | undefined, fallback: number): number {
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


    private parseHexToBigInt(value: string, label: string): bigint {
        const normalized = (value || '').trim().replace(/^0x/i, '');
        if (!normalized) {
            throw new Error(`failed to parse ${label}`);
        }
        try {
            return BigInt(`0x${normalized}`);
        } catch (_error) {
            throw new Error(`failed to parse ${label}`);
        }
    }

    private async rpcCall<T>(method: string, params: any[]): Promise<T> {
        const payload = {
            jsonrpc: '2.0',
            id: 1,
            method,
            params
        };

        let lastError: string = `rpc ${method} failed`;
        const attempts = Math.max(0, this.rpcMaxRetries) + 1;
        for (let attempt = 1; attempt <= attempts; attempt += 1) {
            try {
                const response = await axios.post<RpcResponse<T>>(this.rpcUrl, payload, { timeout: this.rpcTimeoutMs });
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
                return response.data.result as T;
            } catch (error: any) {
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


    private isL1RetryableError(message: string): boolean {
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


    private cleanupVerificationCache(): void {
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


    private getPairCacheKey(requestId: string, txHash: string): string {
        const normalizedRequestId = requestId || '';
        return `${normalizedRequestId}:${txHash}`;
    }

    // getCachedVerificationToken: helper function.


    private getCachedVerificationToken(requestId: string, txHash: string): string | undefined {
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


    private setCachedVerificationToken(requestId: string, txHash: string, token: string, requestIdValue: string, expiresAt: number): void {
        const key = this.getPairCacheKey(requestId, txHash);
        this.verificationPairCache.set(key, { token, expiresAt, requestId: requestIdValue, txHash });
        if (requestIdValue) {
            this.verificationTxOwner.set(txHash, requestIdValue);
        }
    }

    // verifyTransactionOnChain: helper function.


    private async verifyTransactionOnChain(txHash: string, payment: PaymentDetails): Promise<void> {
        if (!payment.network || !payment.recipient || !payment.amountWei) {
            throw new Error('missing_payment_info');
        }

        const tx = await this.rpcCall<RpcTransaction>('eth_getTransactionByHash', [txHash]);
        if (!tx || !tx.hash || tx.hash.toLowerCase() !== txHash.toLowerCase()) {
            throw new Error('transaction not found');
        }
        if (!tx.blockNumber || tx.blockNumber === '0x') {
            throw new Error('transaction is not confirmed yet');
        }

        const receipt = await this.rpcCall<RpcReceipt>('eth_getTransactionReceipt', [txHash]);
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
        const rpcChainId = this.parseHexToBigInt(await this.rpcCall<string>('eth_chainId', []), 'rpc chain id');
        if (rpcChainId !== BigInt(expectedChainId)) {
            throw new Error(`network mismatch expected_chain=${expectedChainId} rpc_chain=${rpcChainId.toString()}`);
        }
        if (payment.chainId && payment.chainId !== 0 && payment.chainId !== Number(rpcChainId)) {
            throw new Error(`chain_id mismatch request_chain=${payment.chainId} network_chain=${expectedChainId}`);
        }

        const txBlock = this.parseHexToBigInt(tx.blockNumber, 'transaction block number');
        const latestBlock = this.parseHexToBigInt(await this.rpcCall<string>('eth_blockNumber', []), 'latest block number');
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


    private issueLocalSessionToken(payment: PaymentDetails, txHash: string): { token: string; claims: any } {
        const signOptions = {
            algorithm: 'HS256',
            expiresIn: this.jwtTtlSeconds,
            issuer: this.jwtIssuer,
            header: {
                kid: this.jwtKid
            }
        } as jwt.SignOptions & { header?: { kid: string } };
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
        const decoded = jwt.verify(token, this.jwtSecret, { issuer: this.jwtIssuer }) as any;
        return { token, claims: decoded };
    }

    /**
     * Verifies a payment transaction hash directly on-chain (Avalanche L1).
     * @param txHash The transaction hash from the client.
     */
    async verifyPayment(txHash: string, payment?: PaymentDetails): Promise<VerificationResult> {
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
            } else {
                const fallbackExpiration = Date.now() + (this.jwtTtlSeconds * 1000);
                this.setCachedVerificationToken(requestId, normalizedTxHash, token, requestId, fallbackExpiration);
            }

            return {
                success: true,
                token,
                message: 'Verification successful',
                requestId
            };
        } catch (error: any) {
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
        return this.startRequestWithResult(token).started;
    }

    // startRequestWithResult: helper function.


    private startRequestWithResult(token: string): SessionStartResult {
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
