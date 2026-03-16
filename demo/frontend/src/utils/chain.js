const DEFAULT_CHAIN_ID = Number.parseInt((import.meta.env.VITE_AVALANCHE_CHAIN_ID || '402').trim(), 10);
const FALLBACK_CHAIN_ID = Number.isFinite(DEFAULT_CHAIN_ID) && DEFAULT_CHAIN_ID > 0 ? DEFAULT_CHAIN_ID : 402;
const FALLBACK_RPC_URL = import.meta.env.VITE_AVALANCHE_RPC_URL || 'https://subnets.avax.network/apix/testnet/rpc';
const FALLBACK_NETWORK_NAME = import.meta.env.VITE_AVALANCHE_NETWORK_NAME || 'APIX';
const FALLBACK_BLOCK_EXPLORER = import.meta.env.VITE_AVALANCHE_BLOCK_EXPLORER || 'https://explorer-test.avax.network/apix';
const FALLBACK_FAUCET_URL = String(import.meta.env.VITE_AVALANCHE_FAUCET_URL || '').trim();
const FALLBACK_FAUCET_TOKEN_SYMBOL = String(import.meta.env.VITE_APIX_FAUCET_TOKEN_SYMBOL || 'APIX').trim() || 'APIX';
const FALLBACK_FAUCET_AMOUNT = String(import.meta.env.VITE_APIX_FAUCET_AMOUNT || '10').trim() || '10';
const FALLBACK_FAUCET_TOKEN_DECIMALS = Number.parseInt(String(import.meta.env.VITE_APIX_FAUCET_TOKEN_DECIMALS || '18').trim(), 10);
const FALLBACK_FAUCET_COOLDOWN_HOURS = Number.parseInt(String(import.meta.env.VITE_APIX_FAUCET_COOLDOWN_HOURS || '24').trim(), 10);
const PREFERRED_WALLET = String((import.meta.env.VITE_PREFERRED_WALLET || 'core')).trim().toLowerCase();

// Normalize provider names into a lower-case trimmed string.
// sanitizeProviderRequestName: helper function.
const sanitizeProviderRequestName = (value) => String(value || "").trim().toLowerCase();

// Return available wallet providers detected from injected browser object.
// getWalletProviderCandidates: helper function.
const getWalletProviderCandidates = () => {
    const ethereum = globalThis?.window?.ethereum;
    if (!ethereum || typeof ethereum.request !== 'function') {
        return [];
    }



    if (Array.isArray(ethereum.providers) && ethereum.providers.length > 0) {
        return ethereum.providers
            .filter((provider) => provider && typeof provider.request === 'function')
            .filter((provider, index, providers) =>
                providers.findIndex((candidate) => candidate === provider) === index
            );
    }

    return [ethereum];
};

// Detect Core wallet markers from injected provider metadata.
// isCoreWallet: helper function.
const isCoreWallet = (provider) => {
    if (!provider || typeof provider !== 'object') {
        return false;
    }



    if (provider.isCore || provider.isCoreWallet || provider.isAvalanche) {
        return true;
    }

    const info = provider.info || {};
    const name = sanitizeProviderRequestName(info.name || provider.name);
    return name.includes('core') || name.includes('avalanche core') || name.includes('avalanche wallet');
};

// Detect MetaMask provider via standard isMetaMask flag.
// isMetaMaskWallet: helper function.
const isMetaMaskWallet = (provider) => provider?.isMetaMask === true;

// Sort providers by preferred wallet config while keeping deterministic fallback order.
// getOrderedWalletProviders: helper function.
export const getOrderedWalletProviders = () => {
    const providers = getWalletProviderCandidates();
    if (providers.length <= 1) {
        return providers;
    }

    const coreFirst = providers.filter((provider) => isCoreWallet(provider));
    const nonCore = providers.filter((provider) => !isCoreWallet(provider));
    const metaMask = nonCore.filter((provider) => isMetaMaskWallet(provider));
    const others = nonCore.filter((provider) => !isMetaMaskWallet(provider));



    if (PREFERRED_WALLET === 'core') {
        return [...coreFirst, ...metaMask, ...others];
    }
    if (PREFERRED_WALLET === 'metamask') {
        return [...metaMask, ...coreFirst, ...others];
    }
    return [...providers];
};

// getPreferredWalletProvider: helper function.
export const getPreferredWalletProvider = () => {
    const providers = getOrderedWalletProviders();
    if (providers.length === 0) {
        throw new Error('No EVM wallet provider is available. Please install MetaMask or Core Wallet.');
    }



    if (PREFERRED_WALLET !== 'core' && PREFERRED_WALLET !== 'metamask') {
        return { provider: providers[0], source: 'fallback' };
    }

    const hasPreferredProvider = providers.find((provider) => {
        if (PREFERRED_WALLET === 'core') {
            return isCoreWallet(provider);
        }
        if (PREFERRED_WALLET === 'metamask') {
            return isMetaMaskWallet(provider);
        }
        return provider;
    });



    if (hasPreferredProvider) {
        return {
            provider: hasPreferredProvider,
            source: PREFERRED_WALLET === 'core'
                    ? 'preferred-core'
                    : PREFERRED_WALLET === 'metamask'
                        ? 'preferred-metamask'
                        : 'fallback',
        };
    }

    const hasMetaMask = providers.find((provider) => isMetaMaskWallet(provider));
    if (hasMetaMask) {
        return { provider: hasMetaMask, source: 'metamask-fallback' };
    }

    return { provider: providers[0], source: 'fallback' };
};

// Normalize chain id into positive integer.
// normalizeNumericChainId: helper function.
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

// toHexChainId: helper function.
const toHexChainId = (chainId) => {
    const normalized = normalizeNumericChainId(chainId, FALLBACK_CHAIN_ID);
    return `0x${normalized.toString(16)}`;
};

// Resolve payment chain id with fallback to configured defaults.
// getPaymentChainId: helper function.
export const getPaymentChainId = (details) => {
    if (!details) {
        return FALLBACK_CHAIN_ID;
    }
    return normalizeNumericChainId(
        details.chain_id ?? details.chainId ?? details.network ?? FALLBACK_CHAIN_ID,
        FALLBACK_CHAIN_ID
    );
};

// getPaymentNetwork: helper function.
export const getPaymentNetwork = (details) => {
    const chainId = getPaymentChainId(details);
    const network = String(details?.network || '').trim();
    if (network) {
        return network;
    }
    return `eip155:${chainId}`;
};

// getBlockExplorerUrl: helper function.
export const getBlockExplorerUrl = () => FALLBACK_BLOCK_EXPLORER;

// getFaucetUrl: helper function.
export const getFaucetUrl = (details) => {
    const explicit = String(details?.faucetUrl || details?.faucet_url || '').trim();
    if (explicit) {
        return explicit;
    }
    if (FALLBACK_FAUCET_URL) {
        return FALLBACK_FAUCET_URL;
    }
    if (!FALLBACK_BLOCK_EXPLORER) {
        return '';
    }
    return `${FALLBACK_BLOCK_EXPLORER.replace(/\/$/, '')}/faucet`;
};

// Return the configured managed-faucet display settings for the active network.
// getFaucetClaimConfig: helper function.
export const getFaucetClaimConfig = (details) => {
    const amount = String(details?.faucetAmount || details?.faucet_amount || FALLBACK_FAUCET_AMOUNT).trim() || FALLBACK_FAUCET_AMOUNT;
    const tokenSymbol = String(details?.faucetTokenSymbol || details?.faucet_token_symbol || FALLBACK_FAUCET_TOKEN_SYMBOL).trim() || FALLBACK_FAUCET_TOKEN_SYMBOL;
    const decimals = Number.parseInt(
        String(details?.faucetTokenDecimals ?? details?.faucet_token_decimals ?? FALLBACK_FAUCET_TOKEN_DECIMALS).trim(),
        10
    );
    const cooldownHours = Number.parseInt(
        String(details?.faucetCooldownHours ?? details?.faucet_cooldown_hours ?? FALLBACK_FAUCET_COOLDOWN_HOURS).trim(),
        10
    );

    return {
        amount,
        cooldownHours: Number.isFinite(cooldownHours) && cooldownHours > 0 ? cooldownHours : 24,
        decimals: Number.isFinite(decimals) && decimals >= 0 ? decimals : 18,
        tokenSymbol,
    };
};

// Ensure wallet is connected and on the expected chain for payment.
// ensureWalletChain: helper function.
export const ensureWalletChain = async (details, provider = null) => {
    const selectedProvider = provider || getPreferredWalletProvider().provider;
    const chainId = getPaymentChainId(details);
    const chainIdHex = toHexChainId(chainId);
    const network = getPaymentNetwork(details);
    const chainName = FALLBACK_NETWORK_NAME || network || `Chain ${chainId}`;
    const ethereum = selectedProvider;



    if (!ethereum?.request) {
        throw new Error('No EVM wallet provider is available. Please install MetaMask or Core Wallet.');
    }

    try {
        const accounts = await ethereum.request({ method: 'eth_accounts' });
        if (!Array.isArray(accounts) || accounts.length === 0) {
            await ethereum.request({ method: 'eth_requestAccounts' });
        }
    } catch (error) {
        const normalizedMessage = String(error?.message || '').toLowerCase();
        if (error?.code === 4001) {
            throw new Error('Wallet connection was rejected. Please approve the connection request.');
        }
        if (normalizedMessage.includes('user closed') || normalizedMessage.includes('user rejected') || normalizedMessage.includes('rejected')) {
            throw new Error('Wallet popup was closed or the request was rejected.');
        }
        if (error?.code === -32002) {
            throw new Error('Wallet is already handling a request. Please complete the pending popup and try again.');
        }
        throw error;
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
                            name: 'APIX',
                            symbol: 'APIX',
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
