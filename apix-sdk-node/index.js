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
}
exports.ApixMiddleware = ApixMiddleware;
//# sourceMappingURL=index.js.map