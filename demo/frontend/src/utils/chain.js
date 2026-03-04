const DEFAULT_CHAIN_ID = Number.parseInt((import.meta.env.VITE_AVALANCHE_CHAIN_ID || '43114').trim(), 10);
const FALLBACK_CHAIN_ID = Number.isFinite(DEFAULT_CHAIN_ID) && DEFAULT_CHAIN_ID > 0 ? DEFAULT_CHAIN_ID : 43114;
const FALLBACK_RPC_URL = import.meta.env.VITE_AVALANCHE_RPC_URL || 'https://api.avax.network/ext/bc/C/rpc';
const FALLBACK_NETWORK_NAME = import.meta.env.VITE_AVALANCHE_NETWORK_NAME || 'Avalanche C-Chain';
const FALLBACK_BLOCK_EXPLORER = import.meta.env.VITE_AVALANCHE_BLOCK_EXPLORER || 'https://snowtrace.io';

const normalizeNumericChainId = (value, fallback = FALLBACK_CHAIN_ID) => {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
        return Math.floor(value);
    }
    const trimmed = String(value || '').trim();
    if (!trimmed) {
        return fallback;
    }
    if (/^\d+$/.test(trimmed)) {
        const parsed = Number.parseInt(trimmed, 10);
        return parsed > 0 ? parsed : fallback;
    }
    const match = /^eip155:(\d+)$/i.exec(trimmed);
    if (match?.[1]) {
        const parsed = Number.parseInt(match[1], 10);
        return parsed > 0 ? parsed : fallback;
    }
    return fallback;
};

const toHexChainId = (chainId) => {
    const normalized = normalizeNumericChainId(chainId, FALLBACK_CHAIN_ID);
    return `0x${normalized.toString(16)}`;
};

export const getPaymentChainId = (details) => {
    if (!details) {
        return FALLBACK_CHAIN_ID;
    }
    return normalizeNumericChainId(
        details.chain_id ?? details.chainId ?? details.network ?? FALLBACK_CHAIN_ID,
        FALLBACK_CHAIN_ID
    );
};

export const getPaymentNetwork = (details) => {
    const chainId = getPaymentChainId(details);
    const network = String(details?.network || '').trim();
    if (network) {
        return network;
    }
    return `eip155:${chainId}`;
};

export const ensureWalletChain = async (details) => {
    const chainId = getPaymentChainId(details);
    const chainIdHex = toHexChainId(chainId);
    const network = getPaymentNetwork(details);
    const chainName = network.includes('Avalanche') || network.includes('avax')
        ? FALLBACK_NETWORK_NAME
        : `Chain ${chainId}`;
    const ethereum = globalThis?.window?.ethereum;

    if (!ethereum?.request) {
        throw new Error('MetaMask is not available. Please install an EVM wallet extension.');
    }

    const currentChainId = await ethereum.request({ method: 'eth_chainId' });
    if (typeof currentChainId === 'string' && currentChainId.toLowerCase() === chainIdHex.toLowerCase()) {
        return { switched: false, chainId: chainIdHex, network };
    }

    try {
        await ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: chainIdHex }],
        });
        return { switched: true, chainId: chainIdHex, network };
    } catch (error) {
        if (error?.code === 4902) {
            await ethereum.request({
                method: 'wallet_addEthereumChain',
                params: [
                    {
                        chainId: chainIdHex,
                        chainName: chainName,
                        nativeCurrency: {
                            name: 'Avalanche',
                            symbol: 'AVAX',
                            decimals: 18,
                        },
                        rpcUrls: [FALLBACK_RPC_URL],
                        blockExplorerUrls: [FALLBACK_BLOCK_EXPLORER],
                    },
                ],
            });
            await ethereum.request({
                method: 'wallet_switchEthereumChain',
                params: [{ chainId: chainIdHex }],
            });
            return { switched: true, chainId: chainIdHex, network };
        }
        throw error;
    }
};
