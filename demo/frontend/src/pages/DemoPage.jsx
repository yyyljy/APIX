
import React, { useState } from 'react';

const DemoPage = () => {
    const [stripeResult, setStripeResult] = useState(null);
    const [apixResult, setApixResult] = useState(null);
    const [showStripeModal, setShowStripeModal] = useState(false);
    const [isProcessingStripe, setIsProcessingStripe] = useState(false);

    // Mock Stripe Flow
    const handleStripeClick = () => {
        setShowStripeModal(true);
    };

    const confirmStripePayment = async () => {
        setIsProcessingStripe(true);

        // Simulate processing delay
        await new Promise(resolve => setTimeout(resolve, 1500));

        setShowStripeModal(false);
        setIsProcessingStripe(false);

        callStripeApi();
    };

    const callStripeApi = async () => {
        try {
            // 1. Simulate getting a token from Stripe frontend SDK
            const mockStripeToken = "Bearer stripe_session_abc123";

            // 2. Call Backend
            const res = await fetch('http://localhost:3000/stripe-product', {
                headers: {
                    'Authorization': mockStripeToken
                }
            });
            const data = await res.json();
            setStripeResult(JSON.stringify(data, null, 2));
        } catch (err) {
            setStripeResult('Error: ' + err.message);
        }
    };

    // Mock Apix Flow (Updated for 402)
    const callApixApi = async () => {
        try {
            setApixResult("1. Requesting Resource...");
            console.log("[Apix] 1. Requesting Resource without Payment Proof...");

            // 1. Try accessing WITHOUT payment headers first
            let res = await fetch('http://localhost:3000/apix-product'); // No headers

            // 2. Expect 402 Payment Required
            if (res.status === 402) {
                const errorData = await res.json();
                console.warn("[Apix] >> Received 402 Payment Required:", errorData);

                // Log WWW-Authenticate header for verification
                const authHeader = res.headers.get('www-authenticate');
                console.log("[Apix] >> WWW-Authenticate Header:", authHeader);

                setApixResult(`Received 402 Payment Required.\nServer says: "${errorData.message}"\nHeader: ${authHeader}\n\nInitiating Wallet Payment...`);

                // 3. Simulate Wallet Interaction (Metamask/Phantom)
                await new Promise(resolve => setTimeout(resolve, 1500));
                const mockTxHash = "0x9876543210fedcba";
                console.log(`[Apix] >> Wallet Payment Complete! TxHash: ${mockTxHash}`);

                // 4. Retry with Proof (Auth Header)
                console.log("[Apix] 3. Retrying request with Proof (TxHash)...");
                res = await fetch('http://localhost:3000/apix-product', {
                    headers: {
                        'Authorization': `Apix ${mockTxHash}`
                    }
                });
            }

            const data = await res.json();
            console.log("[Apix] >> Access Granted:", data);
            setApixResult(JSON.stringify(data, null, 2));
        } catch (err) {
            console.error(err);
            setApixResult('Error: ' + err.message);
        }
    };

    return (
        <div className="container mx-auto p-10 grid grid-cols-2 gap-10 relative">
            {/* Stripe Mock Modal */}
            {showStripeModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 backdrop-blur-sm">
                    <div className="bg-white rounded-xl shadow-2xl w-96 overflow-hidden">
                        <div className="bg-indigo-600 p-4 flex justify-between items-center text-white">
                            <h3 className="font-bold flex items-center gap-2">
                                <span className="bg-white/20 p-1 rounded text-xs font-serif">M</span>
                                Mock Payment (Web2)
                            </h3>
                            <button onClick={() => setShowStripeModal(false)} className="text-white/80 hover:text-white">&times;</button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div className="flex justify-between items-center border-b pb-4">
                                <span className="text-gray-600">High-Value Insight</span>
                                <span className="font-bold">$10.00</span>
                            </div>

                            <div className="space-y-3">
                                <div>
                                    <label className="block text-xs font-bold text-gray-400 mb-1">EMAIL</label>
                                    <input type="email" placeholder="user@example.com" className="w-full border rounded p-2 text-sm" />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-400 mb-1">CARD INFORMATION</label>
                                    <div className="border rounded p-2 flex items-center gap-2">
                                        <div className="w-6 h-4 bg-gray-200 rounded"></div>
                                        <input type="text" placeholder="1234 4242 4242 4242" className="w-full text-sm outline-none" />
                                    </div>
                                    <div className="flex gap-2 mt-2">
                                        <input type="text" placeholder="MM / YY" className="w-1/2 border rounded p-2 text-sm" />
                                        <input type="text" placeholder="CVC" className="w-1/2 border rounded p-2 text-sm" />
                                    </div>
                                </div>
                            </div>

                            <button
                                onClick={confirmStripePayment}
                                disabled={isProcessingStripe}
                                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded mt-4 transition flex justify-center items-center gap-2"
                            >
                                {isProcessingStripe ? (
                                    <>Processing...</>
                                ) : (
                                    <>Pay $10.00</>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Left: Traditional Stripe */}
            <div className="bg-white p-6 rounded-lg shadow-md border-t-4 border-indigo-500">
                <h2 className="text-2xl font-bold mb-2 text-indigo-700">Traditional Payment</h2>
                <span className="inline-block bg-indigo-100 text-indigo-800 text-xs px-2 py-1 rounded mb-4">Mock Payment (Web2)</span>
                <p className="mb-6 text-gray-600">
                    Simulates a standard Web2 flow: <br />
                    User pays → Mock Session ID → Backend Verification.
                </p>
                <button
                    onClick={handleStripeClick}
                    className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-4 rounded transition"
                >
                    Buy with Credit Card ($10)
                </button>
                <div className="mt-6">
                    <h3 className="text-sm font-semibold text-gray-500 mb-2">API Response:</h3>
                    <pre className="bg-gray-100 p-4 rounded text-xs overflow-auto h-48 border border-gray-200">
                        {stripeResult || 'Waiting for payment...'}
                    </pre>
                </div>
            </div>

            {/* Right: Apix Web3 */}
            <div className="bg-white p-6 rounded-lg shadow-md border-t-4 border-emerald-500">
                <h2 className="text-2xl font-bold mb-2 text-emerald-700">Web3 Payment</h2>
                <span className="inline-block bg-emerald-100 text-emerald-800 text-xs px-2 py-1 rounded mb-4">Apix SDK Integration</span>
                <p className="mb-6 text-gray-600">
                    Simulates x402 Middleware flow: <br />
                    User pays (L1) → Transaction Hash → Backend Verification.
                </p>
                <button
                    onClick={callApixApi}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 px-4 rounded transition"
                >
                    Buy with Crypto (10 AVAX)
                </button>
                <div className="mt-6">
                    <h3 className="text-sm font-semibold text-gray-500 mb-2">API Response:</h3>
                    <pre className="bg-gray-100 p-4 rounded text-xs overflow-auto h-48 border border-gray-200">
                        {apixResult || 'Waiting for payment...'}
                    </pre>
                </div>
            </div>

            <div className="col-span-2 text-center text-gray-500 text-sm mt-8">
                Both panels fetch the <strong>exact same product data</strong> from the backend logic,<br />
                but authenticate using completely different middleware stacks.
            </div>
        </div>
    );
};

export default DemoPage;
