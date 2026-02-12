import React from 'react';

const PaymentModal = ({ isOpen, onClose, onConfirm, paymentDetails, isProcessing }) => {
    if (!isOpen) return null;

    const { amount, currency, recipient, requestId } = paymentDetails;

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
                            disabled={isProcessing}
                            className="rounded-md p-1 text-white/80 transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed"
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
                            <span className="font-semibold text-emerald-700">Avalanche C-Chain</span>
                        </div>
                    </div>

                    <p className="text-xs leading-5 text-slate-500">
                        By confirming, your wallet signs and submits a transaction. API access is granted after payment
                        proof verification.
                    </p>

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
