import { useOutletContext } from 'react-router-dom';

export default function History() {
    const { logs } = useOutletContext();

    return (
        <div className="max-w-4xl mx-auto">
            <h2 className="text-2xl font-bold mb-6">Transaction History</h2>
            <div className="card">
                <div className="space-y-4">
                    {logs && logs.length > 0 ? (
                        logs.map((log, i) => (
                            <div key={i} className="p-4 rounded-lg bg-gray-50 dark:bg-slate-800/50 border border-gray-100 dark:border-slate-800 flex justify-between items-center">
                                <div>
                                    <span className="text-xs text-gray-500 block mb-1">{log.substring(1, 12)}</span>
                                    <span className="font-medium text-gray-900 dark:text-gray-100">{log.substring(14)}</span>
                                </div>
                            </div>
                        ))
                    ) : (
                        <div className="text-center py-12 text-gray-500">
                            No transaction history available.
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
