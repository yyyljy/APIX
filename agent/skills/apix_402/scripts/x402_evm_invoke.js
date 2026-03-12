/* eslint-disable no-console */
const { Buffer } = require("buffer");

const DEFAULT_CHAIN_ID = "eip155:402";
const DEFAULT_RPC_URL = process.env.APIX_RPC_URL;
const DEFAULT_PRIVATE_KEY = process.env.APIX_PRIVATE_KEY;
const DEFAULT_MAX_RETRIES = 1;
const DEFAULT_TIMEOUT_MS = 30000;

function normalizeHeaderValue(value) {
    if (!value) return "";
    if (Array.isArray(value)) {
        return value.length > 0 ? String(value[0]).trim() : "";
    }
    return String(value).trim();
}

function parseChainId(raw) {
    if (!raw) return null;
    const text = String(raw).trim();
    if (!text) return null;
    const prefixMatch = /^eip155:(\d+)$/.exec(text);
    if (prefixMatch?.[1]) {
        return Number(prefixMatch[1]);
    }
    const numeric = Number(text);
    return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

function sanitizeInput(input = {}) {
    return {
        url: String(input.url || "").trim(),
        method: String(input.method || "GET").toUpperCase(),
        body: input.body || undefined,
        payer_private_key: String(input.payer_private_key || DEFAULT_PRIVATE_KEY || "").trim(),
        chain_id: String(input.chain_id || DEFAULT_CHAIN_ID).trim(),
        network: String(input.network || input.chain_id || DEFAULT_CHAIN_ID).trim(),
        rpc_url: String(input.rpc_url || DEFAULT_RPC_URL || "").trim(),
        client_type: String(input.client_type || "agent").trim(),
        payment_signature_header: String(input.payment_signature_header || "PAYMENT-SIGNATURE").trim(),
        timeout_ms: Number.isFinite(Number(input.timeout_ms)) ? Number(input.timeout_ms) : DEFAULT_TIMEOUT_MS,
        max_retries: Number.isFinite(Number(input.max_retries)) && Number(input.max_retries) >= 0
            ? Number(input.max_retries)
            : DEFAULT_MAX_RETRIES
    };
}

function parsePaymentRequired(headerValue) {
    const raw = normalizeHeaderValue(headerValue);
    if (!raw) {
        throw { code: "missing_challenge", message: "PAYMENT-REQUIRED header is missing" };
    }
    let payload;
    try {
        const jsonText = Buffer.from(raw, "base64").toString("utf8");
        payload = JSON.parse(jsonText);
    } catch (_err) {
        throw {
            code: "missing_challenge",
            message: "PAYMENT-REQUIRED is not valid base64 JSON"
        };
    }
    const paymentInfo = payload?.payment_info || {};
    const request_id = payload?.request_id;
    const chain_id = payload?.chain_id || payload?.chainId || "eip155:402";
    const network = payload?.network || chain_id;
    const recipient = paymentInfo?.recipient;
    const amount_wei = paymentInfo?.amount_wei;

    if (!recipient || !amount_wei) {
        throw {
            code: "missing_challenge",
            message: "Missing payment_info.recipient or payment_info.amount_wei"
        };
    }
    return { request_id, chain_id, network, recipient, amount_wei };
}

function formatError(code, message, status, raw) {
    return {
        success: false,
        status: status || 0,
        request_id: undefined,
        tx_hash: undefined,
        url: undefined,
        method: undefined,
        response: undefined,
        error: {
            code,
            message,
            status,
            raw
        }
    };
}

function ensureAddress(value) {
    const ethers = getEthers();
    if (ethers.utils?.isAddress) {
        return ethers.utils.isAddress(String(value).trim());
    }
    if (ethers.getAddress) {
        try {
            ethers.getAddress(String(value).trim());
            return true;
        } catch (_err) {
            return false;
        }
    }
    return /^0x[a-fA-F0-9]{40}$/.test(String(value).trim());
}

function toBigIntAmount(raw) {
    const text = String(raw).trim();
    if (!/^\d+$/.test(text)) {
        throw {
            code: "invalid_payment",
            message: "amount_wei must be a decimal string"
        };
    }
    try {
        return BigInt(text);
    } catch (_err) {
        throw {
            code: "invalid_payment",
            message: "invalid amount_wei format"
        };
    }
}

function createFetchResult({ success, status, request_id, tx_hash, url, method, response, error }) {
    if (success) {
        return {
            success,
            status,
            request_id,
            tx_hash,
            url,
            method,
            response
        };
    }
    return {
        success,
        status,
        request_id,
        tx_hash,
        url,
        method,
        response: undefined,
        error
    };
}

function getProvider(rpcUrl) {
    const ethers = getEthers();
    const RpcProvider = ethers.JsonRpcProvider || (ethers.providers && ethers.providers.JsonRpcProvider);
    if (!RpcProvider) {
        throw {
            code: "invalid_target",
            message: "RPC provider is not available in ethers package"
        };
    }
    return new RpcProvider(rpcUrl);
}

function getSigner(privateKey, provider) {
    const ethers = getEthers();
    const WalletCtor = ethers.Wallet;
    if (!WalletCtor) {
        throw {
            code: "invalid_target",
            message: "Wallet constructor is not available in ethers package"
        };
    }
    return new WalletCtor(privateKey, provider);
}

function getEthers() {
    if (global.__apixEthers) {
        return global.__apixEthers;
    }
    let ethers;
    try {
        ethers = require("ethers");
    } catch (_err) {
        throw {
            code: "invalid_target",
            message: "ethers package is required but not available"
        };
    }
    global.__apixEthers = ethers;
    return ethers;
}

async function requestWithTimeout(url, options, timeoutMs) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal
        });
        return response;
    } finally {
        clearTimeout(timeout);
    }
}

async function fetchJsonSafe(response) {
    try {
        const text = await response.text();
        if (!text) return null;
        return JSON.parse(text);
    } catch (_err) {
        return null;
    }
}

function buildHeadersForRetry(txHash, requestId, paymentSignatureHeader, clientType, existing) {
    const headers = Object.assign({}, existing || {});
    headers.Authorization = `Apix ${txHash}`;
    if (requestId) {
        headers["X-Request-ID"] = requestId;
    }
    if (paymentSignatureHeader) {
        headers[paymentSignatureHeader] = `tx_hash=${txHash}`;
    }
    if (String(clientType).toLowerCase() === "agent") {
        headers["x-apix-client-type"] = "agent";
    }
    return headers;
}

async function invokeWithPayment({
    url,
    method,
    body,
    payer_private_key,
    chain_id,
    rpc_url,
    client_type,
    payment_signature_header,
    timeout_ms,
    max_retries
}) {
    if (!url) {
        return formatError("invalid_target", "url is required", 0);
    }
    if (!payer_private_key) {
        return formatError("invalid_target", "payer_private_key is required", 0);
    }
    if (!rpc_url) {
        return formatError("invalid_target", "rpc_url is required", 0);
    }

    let initialRes;
    try {
        const initRes = await requestWithTimeout(url, {
            method,
            headers: {
                "content-type": "application/json"
            },
            body: method === "POST" ? JSON.stringify(body || {}) : undefined
        }, timeout_ms);
        initialRes = initRes;
    } catch (error) {
        return formatError("payment_send_failed", error?.message || "initial request failed", 0);
    }

    const initialBody = await fetchJsonSafe(initialRes);
    if (initialRes.status !== 402) {
        return createFetchResult({
            success: initialRes.ok,
            status: initialRes.status,
            tx_hash: undefined,
            response: initialBody,
            url,
            method,
            request_id: undefined
        });
    }

    const challenge = parsePaymentRequired(initialRes.headers.get("payment-required") || initialRes.headers.get("PAYMENT-REQUIRED"));
    const challengeChain = parseChainId(challenge.chain_id || chain_id);
    const fixedChain = parseChainId(chain_id) || parseChainId(challenge.network) || challengeChain || 402;

    if (!ensureAddress(challenge.recipient)) {
        return formatError("invalid_payment", "recipient is not a valid address", 402);
    }
    const amountWei = toBigIntAmount(challenge.amount_wei);

    const ethers = getEthers();
    let provider;
    try {
        provider = getProvider(rpc_url);
        const network = await provider.getNetwork();
        const networkChainId = Number(network.chainId);
        if (fixedChain && networkChainId !== fixedChain) {
            return formatError(
                "invalid_payment",
                `chain mismatch expected ${fixedChain} actual ${networkChainId}`,
                402
            );
        }
    } catch (error) {
        return formatError(
            error?.code || "invalid_target",
            error?.message || "provider validation failed",
            0
        );
    }

    const wallet = getSigner(payer_private_key, provider);
    const senderAddress = await wallet.getAddress();
    if (!senderAddress) {
        return formatError("invalid_target", "wallet initialization failed", 0);
    }

    const baseTxOpts = {
        to: ethers.getAddress ? ethers.getAddress(challenge.recipient) : challenge.recipient,
        value: amountWei
    };

    let lastError = null;
    const attempts = Math.max(0, Number(max_retries));
    for (let attempt = 0; attempt <= attempts; attempt += 1) {
        try {
            let tx;
            try {
                tx = await wallet.sendTransaction(baseTxOpts);
            } catch (error) {
                return formatError(
                    "payment_send_failed",
                    error?.message || "failed to send payment tx",
                    0
                );
            }

            const receipt = await tx.wait();
            if (!receipt?.status) {
                return formatError("invalid_payment", "payment transaction failed on-chain", 402);
            }

            const headers = buildHeadersForRetry(
                tx.hash,
                challenge.request_id,
                payment_signature_header,
                client_type,
                {}
            );
            const retried = await requestWithTimeout(url, {
                method,
                headers
            }, timeout_ms);
            const retriedBody = await fetchJsonSafe(retried);
            if (retried.status !== 402) {
                return createFetchResult({
                    success: retried.ok,
                    status: retried.status,
                    request_id: challenge.request_id,
                    tx_hash: tx.hash,
                    response: retriedBody,
                    url,
                    method
                });
            }
            if (attempt === attempts) {
                return createFetchResult({
                    success: false,
                    status: 402,
                    request_id: challenge.request_id,
                    tx_hash: tx.hash,
                    response: retriedBody,
                    url,
                    method,
                    error: {
                        code: "retry_exhausted",
                        message: "402 response kept returning after retries",
                        status: 402,
                        raw: retriedBody
                    }
                });
            }
            lastError = {
                code: "retry_exhausted",
                message: "402 received after payment; retrying",
                raw: retriedBody
            };
        } catch (error) {
            return formatError(
                error?.code || "invalid_payment",
                error?.message || "retry flow failed",
                0,
                error
            );
        }
    }

    return formatError("retry_exhausted", lastError?.message || "retry loop failed", 402, lastError);
}

module.exports = async function x402_evm_invoke(input = {}) {
    const config = sanitizeInput(input);
    try {
        return await invokeWithPayment(config);
    } catch (error) {
        return formatError(error?.code || "invalid_payment", error?.message || "tool execution failed", 0);
    }
};

module.exports.default = module.exports;

