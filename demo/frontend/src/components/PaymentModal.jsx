import React from 'react';

// Display the wallet payment modal for human wallet flow.
// PaymentModal: helper function.
const PaymentModal = ({
    isOpen,
    onClose,
    onConfirm,
    paymentDetails,
    isProcessing,
    onRequestFaucet = null,
    isRequestingFaucet = false,
    faucetSummary = 'Claim 10 APIX every 24 hours from the managed faucet wallet.',
}) => {
    if (!isOpen) return null;

    const { amount, currency, recipient, requestId, chainId, network } = paymentDetails;
    const networkLabel = network || (chainId ? `eip155:${chainId}` : 'eip155:43114');

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm">
            <div className="panel-strong w-full max-w-lg overflow-hidden bg-white">
                <div className="border-b border-slate-200 bg-slate-900 px-6 py-4 text-white">
                    <div className="flex items-center justify-between">
                        <div>
                            <h3 className="text-base font-bold">Wallet Payment Authorization</h3>
                            <p className="mt-1 text-xs text-slate-300">x402 challenge settlement for protected API access</p>
                        </div>
                        <button
                            onClick={onClose}
                            className="rounded-md p-1 text-white/80 transition hover:bg-white/10 hover:text-white"
                        >
                            x
                        </button>
                    </div>
                </div>

                <div className="space-y-5 p-6">
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-center">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Total Due</p>
                        <div className="mt-2 text-3xl font-extrabold text-slate-900">
                            {amount} <span className="text-xl font-semibold text-slate-500">{currency}</span>
                        </div>
                    </div>

                    <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 text-sm">
                        <div className="flex items-center justify-between gap-3">
                            <span className="text-slate-500">Recipient</span>
                            <span className="max-w-[220px] truncate font-mono text-xs text-slate-800" title={recipient}>
                                {recipient}
                            </span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                            <span className="text-slate-500">Request ID</span>
                            <span className="max-w-[220px] truncate font-mono text-xs text-slate-800" title={requestId}>
                                {requestId}
                            </span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                            <span className="text-slate-500">Network</span>
                            <span className="font-semibold text-emerald-700">{networkLabel}</span>
                        </div>
                    </div>

                    <p className="text-xs leading-5 text-slate-500">
                        By confirming, your wallet signs and submits a transaction. API access is granted after payment
                        proof verification.
                    </p>

                    {typeof onRequestFaucet === 'function' ? (
                        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4">
                            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Need test tokens first?</p>
                            <p className="mt-2 text-sm text-slate-700">{faucetSummary}</p>
                            <button
                                type="button"
                                onClick={onRequestFaucet}
                                disabled={isProcessing || isRequestingFaucet}
                                className="btn btn-secondary mt-4 w-full disabled:cursor-not-allowed disabled:opacity-70"
                            >
                                {isRequestingFaucet ? 'Claiming APIX...' : 'Claim APIX from Faucet'}
                            </button>
                        </div>
                    ) : null}

                    <button
                        onClick={onConfirm}
                        disabled={isProcessing}
                        className="btn btn-primary w-full disabled:cursor-not-allowed disabled:opacity-70"
                    >
                        {isProcessing ? 'Processing Transaction...' : 'Confirm Wallet Payment'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default PaymentModal;
