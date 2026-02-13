import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { ethers } from 'ethers';
import { fetchProxyResource, verifyPayment } from '../../utils/api';
import Sparkline from '../Sparkline';
import {
    BarChart3,
    Activity,
    ArrowUpRight,
    ArrowDownRight,
    Lock,
    Zap,
    ChevronDown,
    MoreHorizontal,
    History
} from 'lucide-react';

const MOCK_CHART_DATA = [
    { name: 'Jan', value: 400 }, { name: 'Feb', value: 300 }, { name: 'Mar', value: 600 },
    { name: 'Apr', value: 400 }, { name: 'May', value: 500 }, { name: 'Jun', value: 800 },
    { name: 'Jul', value: 700 }, { name: 'Aug', value: 900 }, { name: 'Sep', value: 1000 },
];

export default function Overview() {
    const { account, logs, addLog } = useOutletContext();
    const [resourceData, setResourceData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [accessToken, setAccessToken] = useState(null);

    // X402 Logic specific to this view
    const handlePurchaseAccess = async () => {
        setLoading(true);
        setResourceData(null);
        addLog("Requesting Restricted Resource...", "info");

        try {
            // 1. Trigger 402
            const response = await fetchProxyResource("listing_001", accessToken);
            const data = await response.json();

            if (response.status === 200) {
                setResourceData(data.data);
                addLog("Resource Access Granted!", "success");
            } else if (response.status === 402) {
                addLog("402 Payment Required received.", "warning");
                await handlePayment(data.error.details);
            } else {
                addLog(`Unexpected Error: ${response.status}`, "error");
            }
        } catch (err) {
            addLog(`Request Failed: ${err.message}`, "error");
        } finally {
            setLoading(false);
        }
    };

    const handlePayment = async (details) => {
        if (!account) {
            addLog("Please connect wallet first!", "error");
            return;
        }

        try {
            const { request_id, payment_info } = details;
            const amountWei = payment_info.amount_wei || payment_info.amount;
            addLog(`Initializing Payment: ${ethers.formatEther(amountWei)} AVAX`, "info");

            // 2. Send Transaction
            const provider = new ethers.BrowserProvider(window.ethereum);
            const signer = await provider.getSigner();

            const tx = {
                to: payment_info.recipient,
                value: amountWei,
            };

            const txResponse = await signer.sendTransaction(tx);
            addLog(`TX Sent: ${txResponse.hash.slice(0, 10)}...`, "success");

            await txResponse.wait();
            addLog("Transaction Confirmed.", "success");

            // 3. Verify
            addLog("Verifying payment...", "info");
            const verifyRes = await verifyPayment(request_id, txResponse.hash);
            const verifyData = await verifyRes.json();

            if (verifyData.success) {
                setAccessToken(verifyData.data.access_token);
                addLog("Payment Verified! Retrying request...", "success");

                // 4. Retry
                const retryRes = await fetchProxyResource("listing_001", verifyData.data.access_token);
                const retryData = await retryRes.json();
                if (retryRes.status === 200) {
                    setResourceData(retryData.data);
                    addLog("Final Access Granted!", "success");
                }
            } else {
                addLog("Verification Failed.", "error");
            }

        } catch (err) {
            if (err.code === "ACTION_REJECTED") {
                addLog("User rejected transaction.", "error");
            } else {
                addLog(`Payment Error: ${err.message}`, "error");
            }
        }
    };

    return (
        <div className="max-w-7xl mx-auto space-y-8">
            {/* Stats Row */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <StatCard title="Total Volume" value="$2.4M" change="+12.5%" trend="up" icon={<Activity size={20} className="text-white" />} color="bg-blue-500" />
                <StatCard title="Active APIs" value="1,240" change="+4.2%" trend="up" icon={<Zap size={20} className="text-white" />} color="bg-purple-500" />
                <StatCard title="Avg. Price" value="$0.0042" change="-1.8%" trend="down" icon={<BarChart3 size={20} className="text-white" />} color="bg-orange-500" />
                {/* Note: In a real app, 'Your Balance' might come from the parent outlet context or a hook */}
                <StatCard title="Your Balance" value="14.2 AVAX" change="+0.0%" trend="neutral" icon={<Activity size={20} className="text-white" />} color="bg-emerald-500" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Main Chart Section */}
                <div className="lg:col-span-2 space-y-8">
                    <div className="card h-96 flex flex-col relative overflow-hidden group">
                        <div className="flex justify-between items-start mb-6">
                            <div>
                                <h3 className="text-lg font-bold">Token Prices</h3>
                                <p className="text-sm text-gray-500">Global index of top 50 APIs</p>
                            </div>
                            <div className="flex gap-2">
                                {['1H', '1D', '1W', '1M', '1Y'].map(t => (
                                    <button key={t} className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${t === '1M' ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-slate-800'}`}>
                                        {t}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="flex-1 w-full -ml-2">
                            <Sparkline data={MOCK_CHART_DATA} height={280} showTooltip={true} />
                        </div>
                    </div>

                    {/* Secret Resource (PoC Integration) */}
                    <div className="card relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-4 opacity-5">
                            <Lock size={120} />
                        </div>

                        <div className="flex items-center justify-between mb-6 relative z-10">
                            <div>
                                <h3 className="font-bold text-lg flex items-center gap-2">
                                    Restricted Resource Access
                                </h3>
                                <p className="text-sm text-gray-500">Pay-per-view data via smart contract.</p>
                            </div>
                            {resourceData && <span className="text-xs font-bold px-3 py-1 bg-green-100 dark:bg-green-900/30 text-green-600 rounded-full flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>Access Granted</span>}
                        </div>

                        <div className="p-6 bg-gray-50 dark:bg-slate-800/50 rounded-2xl border border-dashed border-gray-200 dark:border-slate-700 relative z-10">
                            {!resourceData ? (
                                <div className="text-center py-8">
                                    <div className="w-16 h-16 rounded-full bg-amber-100 dark:bg-amber-900/20 flex items-center justify-center text-amber-500 mx-auto mb-4">
                                        <Lock size={32} />
                                    </div>
                                    <h4 className="font-bold text-lg mb-2">Premium Data Locked</h4>
                                    <p className="text-sm text-gray-500 mb-6 max-w-sm mx-auto">
                                        This resource sits behind a 402 payment wall. Pay the required amount on-chain to unlock it instantly.
                                    </p>
                                    <button
                                        onClick={handlePurchaseAccess}
                                        disabled={!account || loading}
                                        className="btn btn-primary mx-auto disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {loading ? (
                                            <>Processing <span className="animate-pulse">...</span></>
                                        ) : (
                                            <>Unlock for 10 AVAX <Lock size={16} className="ml-2" /></>
                                        )}
                                    </button>
                                    {!account && <p className="text-xs text-red-500 mt-3 font-medium">Please connect your wallet first</p>}
                                </div>
                            ) : (
                                <div className="animate-fade-in-up">
                                    <div className="flex justify-between items-center mb-4 pb-4 border-b border-gray-200 dark:border-slate-700">
                                        <span className="text-sm text-gray-500 font-medium">Decrypted Value</span>
                                        <span className="font-mono font-bold text-lg text-blue-600">{resourceData.value}</span>
                                    </div>
                                    <div className="bg-white dark:bg-slate-900 p-4 rounded-xl text-sm font-mono text-gray-600 dark:text-gray-300">
                                        {resourceData.message}
                                    </div>
                                    <button
                                        onClick={() => setResourceData(null)}
                                        className="mt-4 text-xs text-gray-400 hover:text-gray-600 underline"
                                    >
                                        Lock Resource
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Right Side - Logs & Quick Actions */}
                <div className="space-y-8">
                    {/* Buy/Sell Widget */}
                    <div className="card bg-gradient-to-br from-indigo-600 to-purple-700 text-white border-none shadow-xl shadow-indigo-500/20 relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>

                        <div className="flex justify-between items-center mb-6 relative z-10">
                            <h3 className="font-bold text-lg">Quick Trade</h3>
                            <div className="flex bg-black/20 rounded-lg p-1">
                                <button className="px-3 py-1 rounded-md bg-white/20 text-xs font-bold">Buy</button>
                                <button className="px-3 py-1 rounded-md text-white/60 text-xs font-bold hover:bg-white/10">Sell</button>
                            </div>
                        </div>

                        <div className="space-y-4 relative z-10">
                            <div className="bg-black/20 rounded-xl p-3">
                                <div className="flex justify-between text-xs text-white/60 mb-1">
                                    <span>Token</span>
                                    <span>Balance: 0</span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="font-bold text-lg">OpenAI API</span>
                                    <button className="text-xs bg-white/20 px-2 py-1 rounded flex items-center gap-1">APP <ChevronDown size={12} /></button>
                                </div>
                            </div>

                            <div className="flex justify-center -my-2 relative z-20">
                                <div className="w-8 h-8 rounded-full bg-white text-indigo-600 flex items-center justify-center shadow-lg cursor-pointer hover:scale-110 transition-transform">
                                    <ArrowDownRight size={16} />
                                </div>
                            </div>

                            <div className="bg-black/20 rounded-xl p-3">
                                <div className="flex justify-between text-xs text-white/60 mb-1">
                                    <span>Pay With</span>
                                    <span>Avail: 14.2</span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <input type="text" value="35.30" className="bg-transparent border-none text-white font-bold text-lg w-full p-0 focus:ring-0 placeholder-white/50" readOnly />
                                    <span className="text-xs font-bold">AVAX</span>
                                </div>
                            </div>
                        </div>

                        <button className="w-full mt-6 py-3 bg-white text-indigo-600 rounded-xl font-bold hover:bg-opacity-90 transition shadow-lg relative z-10">
                            Execute Trade
                        </button>
                    </div>

                    {/* Transaction Logs */}
                    <div className="card flex flex-col h-[400px]">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="font-bold text-lg flex items-center gap-2">
                                Activity
                            </h3>
                            <button className="text-gray-400 hover:text-gray-600">
                                <MoreHorizontal size={20} />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto space-y-4 pr-2 custom-scrollbar">
                            {logs.length === 0 && (
                                <div className="flex flex-col items-center justify-center h-full text-gray-400 opacity-50">
                                    <History size={32} className="mb-2" />
                                    <span className="text-sm">No activity recorded</span>
                                </div>
                            )}
                            {logs.map((log, i) => (
                                <div key={i} className="flex gap-3 items-start animate-fade-in-up">
                                    <div className={`mt-1 w-2 h-2 rounded-full shrink-0 ${log.includes('error') ? 'bg-red-500' :
                                        log.includes('success') ? 'bg-green-500' :
                                            'bg-blue-500'
                                        }`}></div>
                                    <div className="flex-1">
                                        <p className="text-xs text-gray-500 mb-0.5">{log.substring(1, 12)}</p>
                                        <p className="text-sm font-medium text-gray-700 dark:text-gray-300 leading-snug">
                                            {log.substring(14)}
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
}

function StatCard({ title, value, change, trend, icon, color }) {
    return (
        <div className="card hover:-translate-y-1 transition-transform">
            <div className="flex items-start justify-between mb-4">
                <div className={`w-10 h-10 rounded-xl ${color} flex items-center justify-center shadow-lg shadow-blue-500/20`}>
                    {icon}
                </div>
                <span className={`text-xs font-bold px-2 py-1 rounded-lg flex items-center ${trend === 'up' ? 'text-green-600 bg-green-50 dark:bg-green-900/20' : trend === 'down' ? 'text-red-500 bg-red-50 dark:bg-red-900/20' : 'text-gray-500 bg-gray-100 dark:bg-slate-800'
                    }`}>
                    {change}
                    {trend === 'up' ? <ArrowUpRight size={12} className="ml-0.5" /> : trend === 'down' ? <ArrowDownRight size={12} className="ml-0.5" /> : null}
                </span>
            </div>
            <div>
                <p className="text-sm text-gray-500 font-medium mb-1">{title}</p>
                <h3 className="text-2xl font-bold text-gray-900 dark:text-white">{value}</h3>
            </div>
        </div>
    );
}
