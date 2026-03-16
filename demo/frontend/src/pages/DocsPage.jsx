import { Book, Code, Terminal, FileText, ChevronRight } from 'lucide-react';

const gettingStartedLinks = ['Introduction', 'Quick Start', 'HTTP 402 Flow', 'Client Modes'];
const referenceLinks = ['Headers & Tokens', 'Error Codes', 'Protected Routes'];

const concepts = [
    {
        icon: Book,
        title: 'Protected route',
        description: 'APIX sits in front of an existing HTTP endpoint and turns access control into a paid request lifecycle.',
    },
    {
        icon: Terminal,
        title: '402 payment challenge',
        description: 'When payment is missing, the route responds with request metadata, pricing, and settlement instructions instead of a checkout page.',
    },
    {
        icon: Code,
        title: 'Retry with proof',
        description: 'After payment, the client retries the same route with tx proof and request id so APIX can verify and unlock access.',
    },
];

const lifecycle = [
    {
        title: 'Request',
        description: 'Call the protected endpoint exactly as you normally would. If payment is missing, APIX returns HTTP 402 Payment Required.',
    },
    {
        title: 'Pay + verify',
        description: 'Use the returned payment_info fields to settle on-chain, then retry with the transaction hash in the Authorization and PAYMENT-SIGNATURE headers.',
    },
    {
        title: 'Consume',
        description: 'A successful retry returns the protected payload plus reusable proof, so agents and apps can continue without a separate checkout session.',
    },
];

const challengeExample = `# 1) Initial request to a protected route
curl -i http://localhost:3000/apix-product

HTTP/1.1 402 Payment Required
WWW-Authenticate: Apix realm="Apix Protected", request_id="req_123", price="0.1", currency="AVAX", pay_to="0xRecipient..."
PAYMENT-REQUIRED: eyJ2ZXJzaW9uIjoieDQwMi1kcmFmdCIsLi4ufQ==
X-Request-ID: req_123

{
  "error": "Payment Required",
  "code": "payment_required",
  "message": "Payment required to access premium resource.",
  "retryable": false,
  "request_id": "req_123",
  "details": {
    "request_id": "req_123",
    "chain_id": 43113,
    "network": "avalanche-fuji",
    "payment_info": {
      "currency": "AVAX",
      "amount": "0.1",
      "amount_wei": "100000000000000000",
      "recipient": "0xRecipient..."
    }
  }
}`;

const retryExample = `# 2) After payment, retry the same route with proof
curl -X GET http://localhost:3000/apix-product \\
  -H "Authorization: Apix 0xYOUR_TX_HASH" \\
  -H "PAYMENT-SIGNATURE: tx_hash=0xYOUR_TX_HASH" \\
  -H "X-Request-ID: req_123"

# 3) APIX verifies the payment and the route returns the protected payload
#    plus a proof token that can be reused until quota is exhausted.`;

export default function DocsPage() {
    return (
        <div className="container py-12">
            <div className="flex flex-col lg:flex-row gap-12">
                <aside className="w-full lg:w-64 shrink-0">
                    <div className="sticky top-24 space-y-8">
                        <div>
                            <h3 className="font-bold text-gray-900 dark:text-white mb-4 px-2">Getting Started</h3>
                            <nav className="space-y-1">
                                {gettingStartedLinks.map((label, index) => (
                                    <DocLink key={label} active={index === 0}>{label}</DocLink>
                                ))}
                            </nav>
                        </div>
                        <div>
                            <h3 className="font-bold text-gray-900 dark:text-white mb-4 px-2">API Reference</h3>
                            <nav className="space-y-1">
                                {referenceLinks.map((label) => (
                                    <DocLink key={label}>{label}</DocLink>
                                ))}
                            </nav>
                        </div>
                    </div>
                </aside>

                <div className="flex-1 max-w-4xl">
                    <h1 className="text-4xl font-bold mb-6">APIX Integration Docs</h1>
                    <p className="text-lg text-gray-600 dark:text-gray-400 mb-8 leading-relaxed">
                        APIX is an HTTP-native monetization middleware and control plane for AI agents and API providers.
                        You keep your own endpoints and let APIX enforce paid access through a 402 -&gt; payment -&gt; retry workflow.
                    </p>

                    <div className="glass-panel p-6 rounded-2xl mb-8 border-l-4 border-blue-500">
                        <h4 className="font-bold text-lg mb-2 flex items-center gap-2">
                            <Terminal size={18} className="text-blue-500" />
                            Developer Note
                        </h4>
                        <p className="text-gray-600 dark:text-gray-300">
                            The current demo is Phase 1 and testnet-focused, but the integration model is already centered on protecting HTTP routes, returning structured 402 challenges, and verifying payment proof on retry.
                        </p>
                    </div>

                    <h2 className="text-2xl font-bold mb-4 mt-12">Core Concepts</h2>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
                        {concepts.map(({ icon: Icon, title, description }) => (
                            <ConceptCard
                                key={title}
                                icon={<Icon className="text-violet-500" />}
                                title={title}
                                description={description}
                            />
                        ))}
                    </div>

                    <h2 className="text-2xl font-bold mb-4">HTTP 402 Lifecycle</h2>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-12">
                        {lifecycle.map(({ title, description }) => (
                            <FlowCard key={title} title={title} description={description} />
                        ))}
                    </div>

                    <div className="glass-panel p-6 rounded-2xl mb-8">
                        <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
                            <FileText size={20} className="text-blue-500" />
                            Example flow
                        </h2>
                        <p className="text-gray-600 dark:text-gray-300 mb-6 leading-relaxed">
                            The important shift is that clients do not call a separate purchase endpoint. They call the protected route,
                            receive a structured payment challenge, settle payment, and retry that same route with proof.
                        </p>

                        <CodeBlock>{challengeExample}</CodeBlock>
                        <div className="my-4 flex items-center gap-2 text-sm font-medium text-slate-500">
                            <ChevronRight size={16} />
                            Retry the same route after settlement
                        </div>
                        <CodeBlock>{retryExample}</CodeBlock>
                    </div>

                    <div className="card p-6">
                        <h3 className="font-bold text-lg mb-3">Implementation notes</h3>
                        <ul className="space-y-3 text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
                            <li><span className="font-semibold text-gray-900 dark:text-white">Authorization:</span> send <code className="text-xs bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">Apix &lt;txHash or proof&gt;</code> when retrying or reusing a verified session.</li>
                            <li><span className="font-semibold text-gray-900 dark:text-white">PAYMENT-SIGNATURE:</span> the current demo accepts <code className="text-xs bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">tx_hash=0x...</code> as a direct payment proof header.</li>
                            <li><span className="font-semibold text-gray-900 dark:text-white">X-Request-ID:</span> preserve the request id from the 402 response so APIX can correlate settlement with the challenged request.</li>
                        </ul>
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

function FlowCard({ title, description }) {
    return (
        <div className="card p-6">
            <h3 className="font-bold text-base mb-2">{title}</h3>
            <p className="text-sm text-gray-500 leading-relaxed">{description}</p>
        </div>
    );
}

function CodeBlock({ children }) {
    return (
        <div className="bg-slate-900 rounded-xl p-6 overflow-x-auto shadow-xl">
            <pre className="text-sm font-mono text-gray-300 whitespace-pre-wrap">{children}</pre>
        </div>
    );
}
