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
export declare class InMemorySessionStore implements SessionStore {
    private cache;
    constructor();
    get(token: string): SessionData | undefined;
    set(token: string, value: SessionData): void;
    delete(token: string): void;
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
export declare class FileSessionStore implements SessionStore {
    private filePath;
    private lockPath;
    constructor(filePath: string);
    get(token: string): SessionData | undefined;
    set(token: string, value: SessionData): void;
    delete(token: string): void;
    update(token: string, updater: (value: SessionData | undefined) => SessionData | undefined): SessionData | undefined;
    private withLock;
    private ensureStorageDirectory;
    private readSnapshot;
    private writeSnapshot;
}
export declare class ApixMiddleware {
    private config;
    private environment;
    private rpcUrl;
    private rpcTimeoutMs;
    private rpcMaxRetries;
    private defaultMinConfirmations;
    private jwtTtlSeconds;
    private jwtIssuer;
    private jwtKid;
    private sessionStore;
    private jwtSecret;
    private verificationPairCache;
    private verificationTxOwner;
    constructor(config?: ApixConfig);
    private updateSession;
    private postSessionAction;
    validateSessionState(token: string): Promise<boolean>;
    startRequestState(token: string): Promise<boolean>;
    startRequestStateWithResult(token: string): Promise<SessionStartResult>;
    commitRequestState(token: string): Promise<void>;
    rollbackRequestState(token: string): Promise<void>;
    private parseRequestId;
    private parseNetworkChainId;
    private parseEnvInt;
    private parseHexToBigInt;
    private rpcCall;
    private isL1RetryableError;
    private cleanupVerificationCache;
    private getPairCacheKey;
    private getCachedVerificationToken;
    private setCachedVerificationToken;
    private verifyTransactionOnChain;
    private issueLocalSessionToken;
    /**
     * Verifies a payment transaction hash directly on-chain.
     * @param txHash The transaction hash from the client.
     */
    verifyPayment(txHash: string, payment?: PaymentDetails): Promise<VerificationResult>;
    /**
     * Validates an existing session token (JWT).
     * @param token The JWT session token.
     */
    validateSession(token: string): boolean;
    /**
     * Starts a request and marks quota deduction as pending.
     */
    startRequest(token: string): boolean;
    private startRequestWithResult;
    /**
     * Commits a pending deduction after successful request handling.
     */
    commitRequest(token: string): void;
    /**
     * Rolls back a pending deduction when request handling fails.
     */
    rollbackRequest(token: string): void;
    /**
     * Creates a standardized 402 Payment Required response.
     * @param details The payment details required from the client.
     */
    createPaymentRequest(details: PaymentDetails): PaymentResponse;
}
//# sourceMappingURL=index.d.ts.map
