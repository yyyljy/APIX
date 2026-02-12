"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ApixMiddleware = void 0;
const axios_1 = __importDefault(require("axios"));
class ApixMiddleware {
    constructor(config = {}) {
        this.config = config;
        this.facilitatorUrl = config.facilitatorUrl || 'http://localhost:8080';
    }
    /**
     * Verifies a payment transaction hash with Apix Cloud.
     * @param txHash The transaction hash from the client.
     */
    async verifyPayment(txHash) {
        if (!txHash) {
            return { success: false, message: 'Transaction hash is missing.' };
        }
        try {
            const response = await axios_1.default.post(`${this.facilitatorUrl}/v1/verify`, {
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
        }
        catch (error) {
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
    createPaymentRequest(details) {
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
exports.ApixMiddleware = ApixMiddleware;
//# sourceMappingURL=index.js.map