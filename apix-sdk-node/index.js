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
exports.ApixMiddleware = void 0;
const axios_1 = __importDefault(require("axios"));
const jwt = __importStar(require("jsonwebtoken"));
const JWT_SECRET = "apix-mvp-secret-key"; // Shared secret for MVP
class ApixMiddleware {
    constructor(config = {}) {
        this.config = config;
        this.facilitatorUrl = config.facilitatorUrl || 'http://localhost:8080';
        this.sessionCache = new Map();
    }
    /**
     * Verifies a payment transaction hash with Apix Cloud.
     * @param txHash The transaction hash from the client.
     */
    async verifyPayment(txHash) {
        if (!txHash) {
            return { success: false, message: 'Transaction hash is missing.' };
        }
        // 1. Check Local Cache first (if txHash is used as key, but here we use token as key usually)
        // However, initial request only has txHash. 
        // We could cache verified txHash -> token mapping if we wanted, but for MVP we rely on client sending token after first verify?
        // Plan says: "SDK uses in-memory caching (Redis/Map) to validate the JWT for subsequent calls"
        // So verifyPayment is for the INITIAL entry.
        try {
            const response = await axios_1.default.post(`${this.facilitatorUrl}/v1/verify`, {
                tx_hash: txHash
            });
            if (response.data && response.data.valid && response.data.token) {
                const token = response.data.token;
                // Decode and Cache
                try {
                    const decoded = jwt.verify(token, JWT_SECRET);
                    this.sessionCache.set(token, {
                        claims: decoded,
                        remainingQuota: decoded.max_requests || 10,
                        pendingDeduction: false
                    });
                    return {
                        success: true,
                        token: token,
                        message: response.data.message
                    };
                }
                catch (jwtError) {
                    console.error('JWT Verification failed:', jwtError);
                    return { success: false, message: 'Invalid token from Cloud.' };
                }
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
     * Validates an existing session token (JWT).
     * @param token The JWT session token.
     */
    validateSession(token) {
        const session = this.sessionCache.get(token);
        if (!session) {
            // If not in cache, try to verify signature stateless (but no quota tracking then if we rely on cache)
            // For MVP, if not in cache, we reject to force re-verification or we reload from JWT if valid?
            // If we reload from JWT, we reset quota which is bad.
            // So MUST be in cache for quota tracking.
            return false;
        }
        // Check if token expired
        const now = Math.floor(Date.now() / 1000);
        if (session.claims.exp && session.claims.exp < now) {
            this.sessionCache.delete(token);
            return false;
        }
        if (session.remainingQuota <= 0) {
            return false;
        }
        return true;
    }
    /**
     * Starts a request: marks simple "pending" state or just check quota.
     * For MVP Atomic Deduction: we assume optimistic, deduct on success?
     * Or deduct on start (PENDING), and verify success to keep it deducted, or rollback on failure.
     * Plan says: "Request Start: Mark session usage as PENDING."
     */
    startRequest(token) {
        const session = this.sessionCache.get(token);
        if (!session || session.remainingQuota <= 0)
            return false;
        // Mark pending
        session.pendingDeduction = true;
        // We conservatively deduct 1 now? or just mark pending.
        // Let's deduct 1 now, and add back if it fails.
        session.remainingQuota -= 1;
        return true;
    }
    /**
     * Commits the deduction (request succeeded).
     */
    commitRequest(token) {
        const session = this.sessionCache.get(token);
        if (session) {
            session.pendingDeduction = false;
            // Already deducted in startRequest
        }
    }
    /**
     * Rolls back the deduction (request failed).
     */
    rollbackRequest(token) {
        const session = this.sessionCache.get(token);
        if (session) {
            session.pendingDeduction = false;
            session.remainingQuota += 1; // Refund
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