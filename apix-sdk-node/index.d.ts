export interface ApixConfig {
    apiKey?: string;
    facilitatorUrl?: string;
}
export interface VerificationResult {
    success: boolean;
    token?: string;
    message?: string;
}
export declare class ApixMiddleware {
    private config;
    private facilitatorUrl;
    constructor(config?: ApixConfig);
    /**
     * Verifies a payment transaction hash with Apix Cloud.
     * @param txHash The transaction hash from the client.
     */
    verifyPayment(txHash: string): Promise<VerificationResult>;
}
//# sourceMappingURL=index.d.ts.map