import { Book, Code, Terminal, FileText, ChevronRight } from 'lucide-react';

export default function DocsPage() {
    return (
        <div className="container py-12">
            <div className="flex flex-col lg:flex-row gap-12">
                {/* Sidebar */}
                <aside className="w-full lg:w-64 shrink-0">
                    <div className="sticky top-24 space-y-8">
                        <div>
                            <h3 className="font-bold text-gray-900 dark:text-white mb-4 px-2">Getting Started</h3>
                            <nav className="space-y-1">
                                <DocLink active>Introduction</DocLink>
                                <DocLink>Quick Start</DocLink>
                                <DocLink>Authentication</DocLink>
                                <DocLink>Rate Limits</DocLink>
                            </nav>
                        </div>
                        <div>
                            <h3 className="font-bold text-gray-900 dark:text-white mb-4 px-2">API Reference</h3>
                            <nav className="space-y-1">
                                <DocLink>Endpoints</DocLink>
                                <DocLink>Error Codes</DocLink>
                                <DocLink>SDKs</DocLink>
                            </nav>
                        </div>
                    </div>
                </aside>

                {/* Content */}
                <div className="flex-1 max-w-3xl">
                    <h1 className="text-4xl font-bold mb-6">Introduction to APIX</h1>
                    <p className="text-lg text-gray-600 dark:text-gray-400 mb-8 leading-relaxed">
                        APIX is the decentralized marketplace for buying and selling API access using cryptocurrency.
                        Our platform enables seamless, trustless monetization of data and services.
                    </p>

                    <div className="glass-panel p-6 rounded-2xl mb-8 border-l-4 border-blue-500">
                        <h4 className="font-bold text-lg mb-2 flex items-center gap-2">
                            <Terminal size={18} className="text-blue-500" />
                            Developer Note
                        </h4>
                        <p className="text-gray-600 dark:text-gray-300">
                            Currently in Phase 1 (Proof of Concept). Features are limited to the testnet environment.
                        </p>
                    </div>

                    <h2 className="text-2xl font-bold mb-4 mt-12">Core Concepts</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
                        <ConceptCard
                            icon={<Book className="text-violet-500" />}
                            title="Listings"
                            description="Define your API endpoints, pricing, and access terms."
                        />
                        <ConceptCard
                            icon={<Code className="text-pink-500" />}
                            title="Integration"
                            description="Use our SDK or direct smart contract calls to purchase access."
                        />
                    </div>

                    <h2 className="text-2xl font-bold mb-4">Example Request</h2>
                    <div className="bg-slate-900 rounded-xl p-6 overflow-x-auto shadow-xl">
                        <pre className="text-sm font-mono text-gray-300">
                            {`curl -X POST https://api.apix.market/v1/purchase \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -d '{
    "listing_id": "listing_001",
    "amount": "10.5"
  }'`}
                        </pre>
                    </div>
                </div>
            </div>
        </div>
    );
}

function DocLink({ children, active }) {
    return (
        <a href="#" className={`block px-3 py-2 rounded-lg text-sm font-medium transition-colors ${active
            ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400'
            : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-slate-800'
            }`}>
            {children}
        </a>
    );
}

function ConceptCard({ icon, title, description }) {
    return (
        <div className="card p-6">
            <div className="mb-4 bg-gray-50 dark:bg-slate-800 w-12 h-12 rounded-lg flex items-center justify-center">
                {icon}
            </div>
            <h3 className="font-bold text-lg mb-2">{title}</h3>
            <p className="text-sm text-gray-500">{description}</p>
        </div>
    );
}
