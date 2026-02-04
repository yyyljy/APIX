import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Search, Command } from 'lucide-react';
import ThemeToggle from '../components/ThemeToggle';

export default function MainLayout({ children }) {
    const navigate = useNavigate();
    const location = useLocation();

    const navItems = [
        { label: 'Demo', path: '/' },
    ];

    return (
        <div className="flex flex-col min-h-screen bg-gray-50 dark:bg-slate-950 font-sans selection:bg-blue-500/30">
            {/* Header */}
            <header className="fixed w-full top-6 z-50 flex justify-center px-4">
                <div className="container max-w-5xl flex items-center justify-between h-16 rounded-full bg-white/70 dark:bg-slate-900/60 backdrop-blur-xl border border-white/40 dark:border-slate-800 shadow-sm transition-all duration-300">
                    <div className="flex items-center gap-8 pl-2">
                        <Link to="/" className="flex items-center gap-2 group pl-2">
                            <div className="w-8 h-8 rounded-full bg-slate-900 text-white flex items-center justify-center font-bold text-lg shadow-lg group-hover:scale-105 transition-transform">
                                <span className="mb-0.5">A</span>
                            </div>
                            <span className="text-xl font-bold tracking-tight text-slate-800 dark:text-white">
                                APIX SDK Demo
                            </span>
                        </Link>

                        <nav className="flex items-center gap-1 p-1 bg-slate-100/50 dark:bg-slate-800/50 rounded-full">
                            {navItems.map((item) => (
                                <Link
                                    key={item.label}
                                    to={item.path}
                                    className={`px-4 py-1.5 text-sm font-medium rounded-full transition-all duration-200 ${location.pathname === item.path ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-900 hover:bg-white/50'}`}
                                >
                                    {item.label}
                                </Link>
                            ))}
                        </nav>
                    </div>

                    <div className="flex items-center gap-3 pr-2">
                        <div className="hidden lg:flex relative group">
                            <Search className="text-slate-400 group-hover:text-slate-600 transition-colors" size={20} />
                        </div>

                        <div className="w-px h-6 bg-slate-200 dark:bg-slate-800 hidden sm:block mx-1"></div>

                        <Link
                            to="/dashboard"
                            className="btn bg-slate-100 hover:bg-slate-200 text-slate-900 text-sm font-semibold px-5 py-2 rounded-full transition-colors"
                        >
                            Sign In / Sign Up
                        </Link>
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main className="flex-1 mt-16 md:mt-20">
                {children}
            </main>

            {/* Footer */}
            <footer className="border-t border-gray-200 dark:border-slate-800/50 py-12 bg-white dark:bg-slate-900/30">
                <div className="container">
                    <div className="flex flex-col md:flex-row justify-between items-center gap-6">
                        <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded bg-gray-200 dark:bg-slate-800 flex items-center justify-center text-xs font-bold text-gray-500">A</div>
                            <span className="text-gray-500 dark:text-gray-400 text-sm font-medium">
                                © 2026 APIX Marketplace
                            </span>
                        </div>
                        <div className="flex gap-8 text-sm font-medium">
                            <a href="#" className="text-gray-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">Privacy</a>
                            <a href="#" className="text-gray-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">Terms</a>
                            <a href="#" className="text-gray-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">Twitter</a>
                            <a href="#" className="text-gray-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">GitHub</a>
                        </div>
                    </div>
                </div>
            </footer>
        </div>
    );
}

