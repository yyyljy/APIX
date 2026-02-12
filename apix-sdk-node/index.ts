import axios from 'axios';

export interface ApixConfig {
    apiKey?: string; // For future merchant identification
    facilitatorUrl?: string; // URL of Apix Cloud (default: http://localhost:8080)
}

export interface VerificationResult {
    success: boolean;
    token?: string;
    message?: string;
}

export interface PaymentDetails {
    requestId: string;
    chainId: number;
    currency: string;
    amount: string;
    recipient: string;
}

export interface PaymentResponse {
    headers: {
        'WWW-Authenticate': string;
    };
    body: {
        error: string;
        message: string;
        details: {
            request_id: string;
            chain_id: number;
            payment_info: {
                currency: string;
                amount: string;
                recipient: string;
            };
        };
    };
}

export class ApixMiddleware {
    private config: ApixConfig;
    private facilitatorUrl: string;

    constructor(config: ApixConfig = {}) {
        this.config = config;
        this.facilitatorUrl = config.facilitatorUrl || 'http://localhost:8080';
    }

    /**
     * Verifies a payment transaction hash with Apix Cloud.
     * @param txHash The transaction hash from the client.
     */
    async verifyPayment(txHash: string): Promise<VerificationResult> {
        if (!txHash) {
            return { success: false, message: 'Transaction hash is missing.' };
        }

        try {
            const response = await axios.post(`${this.facilitatorUrl}/v1/verify`, {
                tx_hash: txHash
            });

            if (response.data && response.data.valid) {
                return {
                    success: true,
                    token: response.data.token,
                    message: response.data.message
                };
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
     * Creates a standardized 402 Payment Required response.
     * @param details The payment details required from the client.
     */
    createPaymentRequest(details: PaymentDetails): PaymentResponse {
        const authHeader = `Apix realm="Apix Protected", request_id="${details.requestId}", price="${details.amount}", currency="${details.currency}", pay_to="${details.recipient}"`;

        return {
            headers: {
                'WWW-Authenticate': authHeader
            },
            body: {
                error: "Payment Required",
                message: "Payment Required. Please check WWW-Authenticate header or body for details.",
                details: {
                    request_id: details.requestId,
                    chain_id: details.chainId,
                    payment_info: {
                        currency: details.currency,
                        amount: details.amount,
                        recipient: details.recipient
                    }
                }
            }
        };
    }
}
