// Interacts with real Go Backend

const BACKEND_URL = "http://localhost:8080";

export const loginUser = async (walletAddress) => {
    console.log(`[API] Logging in user: ${walletAddress}`);
    try {
        const response = await fetch(`${BACKEND_URL}/auth/connect`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                walletAddress: walletAddress,
                signature: "mock_signature", // In real app, sign message first
                message: "Login to Apix"
            })
        });
        return response;
    } catch (error) {
        console.error("Network Error:", error);
        return { status: 500 };
    }
};

export const fetchProxyResource = async (listingId, token = null) => {
    console.log(`[API] Requesting resource ${listingId} from Backend...`);

    const headers = {};
    if (token) {
        headers["Authorization"] = `Bearer ${token}`;
    }

    try {
        const response = await fetch(`${BACKEND_URL}/proxy/${listingId}`, {
            method: "GET",
            headers: headers
        });
        return response;
    } catch (error) {
        console.error("Network Error:", error);
        return {
            status: 500,
            json: async () => ({
                success: false,
                error: { message: "Backend connection failed" }
            })
        };
    }
};

export const verifyPayment = async (requestId, txHash) => {
    console.log(`[API] Verifying payment for ${requestId}, tx: ${txHash}`);

    try {
        const response = await fetch(`${BACKEND_URL}/verify`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                request_id: requestId,
                tx_hash: txHash
            })
        });
        return response;
    } catch (error) {
        console.error("Network Error:", error);
        return {
            status: 500,
            json: async () => ({
                success: false,
                error: { message: "Backend verification failed" }
            })
        };
    }
};
