import { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { ethers } from 'ethers';
import { loginUser } from '../utils/api';
import {
    BarChart3,
    Wallet,
    Settings,
    History,
    LayoutDashboard,
    Bell,
    Search,
    Zap,
    ArrowUpRight,
    ArrowDownRight,
} from 'lucide-react';

export default function DashboardLayout() {
    const navigate = useNavigate();
    // Existing PoC State
    const [account, setAccount] = useState(null);
    const [logs, setLogs] = useState([]);

    const addLog = (msg, type = 'info') => {
        setLogs(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev]);
    };

    const connectWallet = async () => {
        if (!window.ethereum) {
            addLog("Metamask not found!", "error");
            return;
        }
        try {
            const provider = new ethers.BrowserProvider(window.ethereum);
            const accounts = await provider.send("eth_requestAccounts", []);
            setAccount(accounts[0]);
            addLog(`Wallet Connected: ${accounts[0].slice(0, 6)}...`, "success");

            // Backend Login
            const loginRes = await loginUser(accounts[0]);
            const loginData = await loginRes.json();

            if (loginData.success) {
                addLog("Backend Session Established", "success");
            } else {
                addLog("Backend Authentication Failed", "error");
            }
        } catch (err) {
            addLog(`Connection Failed: ${err.message}`, "error");
        }
    };

    return (
        <div className="flex h-screen bg-[rgb(var(--cloud-dancer))] dark:bg-slate-950 text-slate-800 dark:text-gray-100 overflow-hidden font-sans">

            {/* Sidebar */}
            <aside className="w-72 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border-r border-white/40 dark:border-slate-800 flex flex-col justify-between hidden md:flex z-20 shadow-sm">
                <div>
                    <div className="h-20 flex items-center px-8 border-b border-white/40 dark:border-slate-800 cursor-pointer" onClick={() => navigate('/')}>
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white font-bold text-lg shadow-lg shadow-indigo-500/20 mr-3">
                            A
                        </div>
                        <span className="text-xl font-bold text-slate-800 dark:text-white">APIX Dashboard</span>
                    </div>

                    <div className="p-6">
                        <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4 px-2">Main Menu</div>
                        <nav className="space-y-1">
                            <NavItem to="/dashboard" end icon={<LayoutDashboard size={20} />} label="Overview" />
                            <NavItem to="/dashboard/market" icon={<BarChart3 size={20} />} label="Market" />
                            <NavItem to="/dashboard/portfolio" icon={<Wallet size={20} />} label="Portfolio" />
                            <NavItem to="/dashboard/history" icon={<History size={20} />} label="History" />
                        </nav>

                        <div className="mt-8 text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4 px-2">Preferences</div>
                        <nav className="space-y-1">
                            <NavItem to="/dashboard/settings" icon={<Settings size={20} />} label="Settings" />
                        </nav>
                    </div>
                </div>

                <div className="p-6 border-t border-gray-200 dark:border-slate-800">
                    <div className="bg-gradient-to-br from-blue-600 to-indigo-700 p-5 rounded-2xl shadow-lg shadow-blue-500/20 relative overflow-hidden group">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2 group-hover:translate-x-1/3 transition-transform"></div>
                        <div className="flex items-center gap-3 mb-3 relative z-10">
                            <div className="p-2 bg-white/20 rounded-lg backdrop-blur-sm">
                                <Zap size={18} className="text-white" />
                            </div>
                            <div>
                                <p className="text-sm font-bold text-white leading-none">Pro Plan</p>
                                <p className="text-xs text-blue-100/80 mt-1">Upgrade for 0% fees</p>
                            </div>
                        </div>
                        <button className="w-full py-2 bg-white text-blue-600 rounded-lg text-xs font-bold hover:bg-blue-50 transition shadow-sm relative z-10">
                            Upgrade Now
                        </button>
                    </div>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 flex flex-col overflow-hidden relative">

                {/* Header */}
                <header className="h-20 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border-b border-gray-200 dark:border-slate-800 flex items-center justify-between px-8 z-10">
                    <div className="flex items-center gap-4">
                        <h2 className="text-xl font-bold">Dashboard</h2>
                    </div>
                    <div className="flex items-center gap-6">
                        <div className="hidden md:flex relative group">
                            <Search className="absolute left-3 top-2.5 text-gray-400 group-focus-within:text-blue-500 transition-colors" size={18} />
                            <input
                                type="text"
                                placeholder="Search markets..."
                                className="glass-input pl-10 pr-4 py-2 rounded-full w-64 text-sm"
                            />
                        </div>

                        <button className="relative p-2 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                            <Bell size={20} />
                            <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full border-2 border-white dark:border-slate-900"></span>
                        </button>

                        <div className="h-8 w-px bg-gray-200 dark:bg-slate-800"></div>

                        {account ? (
                            <div className="flex items-center gap-3 pl-2 cursor-pointer hover:opacity-80 transition-opacity">
                                <div className="text-right hidden sm:block">
                                    <p className="text-sm font-bold text-gray-900 dark:text-white">Connected</p>
                                    <p className="text-xs text-gray-500 font-mono">{account.slice(0, 6)}...{account.slice(-4)}</p>
                                </div>
                                <div className="w-10 h-10 rounded-full bg-gradient-to-r from-blue-500 to-cyan-500 p-0.5">
                                    <div className="w-full h-full rounded-full bg-white dark:bg-slate-900 flex items-center justify-center">
                                        <Wallet size={18} className="text-blue-500" />
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <button
                                onClick={connectWallet}
                                className="btn btn-primary text-sm shadow-blue-500/20"
                            >
                                <Wallet size={18} className="mr-2" />
                                Connect Wallet
                            </button>
                        )}
                    </div>
                </header>

                {/* Dashboard Outlet Content */}
                <div className="flex-1 overflow-auto p-4 md:p-8 bg-gray-50/50 dark:bg-slate-950">
                    <Outlet context={{ account, logs, addLog }} />
                </div>
            </main>
        </div>
    );
}

// Subcomponents
function NavItem({ to, icon, label, end = false }) {
    return (
        <NavLink
            to={to}
            end={end}
            className={({ isActive }) => `flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all duration-200 group ${isActive
                ? 'nav-item-active'
                : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-slate-800 hover:text-gray-900 dark:hover:text-white'
                }`}
        >
            {({ isActive }) => (
                <>
                    <span className={`transition-colors ${isActive ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300'}`}>
                        {icon}
                    </span>
                    <span>{label}</span>
                </>
            )}
        </NavLink>
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
