export default function Settings() {
    return (
        <div className="max-w-2xl mx-auto">
            <h2 className="text-2xl font-bold mb-6">Settings</h2>
            <div className="card space-y-6">
                <div>
                    <h3 className="font-bold text-lg mb-2">Account</h3>
                    <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-slate-800/50 rounded-xl">
                        <span>Connected Wallet</span>
                        <span className="text-sm font-mono bg-gray-200 dark:bg-slate-700 px-2 py-1 rounded">Not connected</span>
                    </div>
                </div>

                <div>
                    <h3 className="font-bold text-lg mb-2">Preferences</h3>
                    <div className="flex items-center justify-between p-4 transition-colors hover:bg-gray-50 dark:hover:bg-slate-800/50 rounded-xl">
                        <span>Email Notifications</span>
                        <div className="w-10 h-6 bg-blue-600 rounded-full relative cursor-pointer">
                            <div className="absolute right-1 top-1 w-4 h-4 bg-white rounded-full"></div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
