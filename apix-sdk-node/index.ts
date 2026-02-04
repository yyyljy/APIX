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
}
