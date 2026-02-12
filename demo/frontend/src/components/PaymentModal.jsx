import React from 'react';

const PaymentModal = ({ isOpen, onClose, onConfirm, paymentDetails, isProcessing }) => {
    if (!isOpen) return null;

    const { amount, currency, recipient, requestId } = paymentDetails;

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden transform transition-all scale-100">
                {/* Header */}
                <div className="bg-emerald-600 p-5 flex justify-between items-center text-white">
                    <h3 className="font-bold flex items-center gap-2 text-lg">
                        <span className="bg-white/20 p-1.5 rounded-lg text-sm font-mono">Apix</span>
                        Wallet Payment
                    </h3>
                    <button
                        onClick={onClose}
                        className="text-white/80 hover:text-white transition-colors p-1 rounded-full hover:bg-white/10"
                        disabled={isProcessing}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Body */}
                <div className="p-6 space-y-6">
                    <div className="text-center">
                        <p className="text-gray-500 text-sm mb-1">Total Due</p>
                        <div className="text-4xl font-extrabold text-gray-800 flex items-center justify-center gap-2">
                            {amount} <span className="text-xl text-gray-500 font-medium">{currency}</span>
                        </div>
                    </div>

                    <div className="bg-gray-50 rounded-xl p-4 space-y-3 border border-gray-100">
                        <div className="flex justify-between text-sm">
                            <span className="text-gray-500">To (Recipient)</span>
                            <span className="font-mono text-gray-700 font-medium truncate w-32" title={recipient}>{recipient}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                            <span className="text-gray-500">Request ID</span>
                            <span className="font-mono text-gray-700 font-medium truncate w-32" title={requestId}>{requestId}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                            <span className="text-gray-500">Network</span>
                            <span className="font-medium text-emerald-600">Avalanche C-Chain</span>
                        </div>
                    </div>

                    <div className="text-xs text-gray-400 text-center px-4">
                        By confirming, you agree to sign a transaction with your wallet to send the required funds.
                    </div>

                    <button
                        onClick={onConfirm}
                        disabled={isProcessing}
                        className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3.5 rounded-xl transition-all active:scale-[0.98] shadow-lg shadow-emerald-200 flex justify-center items-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
                    >
                        {isProcessing ? (
                            <>
                                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                Processing Transaction...
                            </>
                        ) : (
                            <>Confirm Payment</>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default PaymentModal;
