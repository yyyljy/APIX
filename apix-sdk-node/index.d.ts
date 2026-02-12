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
export declare class ApixMiddleware {
    private config;
    private facilitatorUrl;
    private sessionCache;
    private jwtSecret;
    constructor(config?: ApixConfig);
    /**
     * Verifies a payment transaction hash with Apix Cloud.
     * @param txHash The transaction hash from the client.
     */
    verifyPayment(txHash: string, payment?: PaymentDetails): Promise<VerificationResult>;
    /**
     * Validates an existing session token (JWT).
     * @param token The JWT session token.
     */
    validateSession(token: string): boolean;
    /**
     * Starts a request: marks simple "pending" state or just check quota.
     * For MVP Atomic Deduction: we assume optimistic, deduct on success?
     * Or deduct on start (PENDING), and verify success to keep it deducted, or rollback on failure.
     * Plan says: "Request Start: Mark session usage as PENDING."
     */
    startRequest(token: string): boolean;
    /**
     * Commits the deduction (request succeeded).
     */
    commitRequest(token: string): void;
    /**
     * Rolls back the deduction (request failed).
     */
    rollbackRequest(token: string): void;
    /**
     * Creates a standardized 402 Payment Required response.
     * @param details The payment details required from the client.
     */
    createPaymentRequest(details: PaymentDetails): PaymentResponse;
}
//# sourceMappingURL=index.d.ts.map