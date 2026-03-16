import { useNavigate } from 'react-router-dom';
import { ArrowRight, Shield, Zap, Globe } from 'lucide-react';
import bgImage from '../assets/images/image.png';

const PRODUCT_PILLARS = [
    {
        icon: <ArrowRight className="text-slate-700" size={24} />,
        title: '402 Payment Challenge',
        description: 'Return an HTTP-native payment challenge before protected access is granted.',
    },
    {
        icon: <Shield className="text-slate-700" size={24} />,
        title: 'Verified Access Control',
        description: 'Verify payment proof on-chain, then issue session or quota-backed access safely.',
    },
    {
        icon: <Zap className="text-slate-700" size={24} />,
        title: 'Quota-Ready Monetization',
        description: 'Start with pay-per-call today and expand toward entitlement and package models next.',
    },
];

const AUDIENCES = [
    {
        icon: <Zap className="text-slate-700" size={24} />,
        title: 'Built for AI agents',
        description: 'Programmatic payment and retry flows for autonomous software and tool-using agents.',
    },
    {
        icon: <ArrowRight className="text-slate-700" size={24} />,
        title: 'Made for API providers',
        description: 'Monetize provider-owned endpoints while keeping policy and access control on your side.',
    },
    {
        icon: <Globe className="text-slate-700" size={24} />,
        title: 'Ready for Web3 infra',
        description: 'Strong fit for RPC, data, and infrastructure teams that need crypto-native settlement.',
    },
];

const COMMERCIAL_PATH = [
    'Free sandbox for demos and testnet experimentation',
    'Usage-based production for monetized API traffic',
    'Enterprise expansion for operational controls and support',
];

export default function LandingPage() {
    const navigate = useNavigate();

    return (
        <div className="relative overflow-hidden rounded-[2rem] border border-white/60 bg-white/40 shadow-xl backdrop-blur-sm">
            <div className="absolute inset-0 z-0">
                <img src={bgImage} alt="Background" className="h-full w-full object-cover" />
                <div className="absolute inset-0 bg-white/70 mix-blend-screen"></div>
                <div className="absolute inset-0 bg-gradient-to-b from-white/40 via-white/30 to-white/80"></div>
            </div>

            <section className="relative z-10 px-6 py-16 md:px-10 md:py-20">
                <div className="mx-auto max-w-6xl">
                    <div className="mx-auto max-w-4xl text-center">
                        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/60 bg-white/70 px-4 py-2 shadow-sm">
                            <div className="grid h-6 w-6 place-items-center rounded-full bg-white text-lg">☁️</div>
                            <span className="text-sm font-semibold tracking-wide text-slate-700">
                                HTTP-native monetization for APIs and AI agents
                            </span>
                        </div>

                        <h1 className="mb-6 text-5xl font-medium tracking-tight text-slate-900 md:text-7xl">
                            Monetize API access<br />
                            without rebuilding billing
                        </h1>

                        <p className="mx-auto mb-10 max-w-3xl text-lg leading-relaxed text-slate-600 md:text-xl">
                            APIX adds an HTTP 402 payment challenge, on-chain verification, and quota-ready access
                            control to provider-owned APIs. Use it as monetization middleware and a control plane for
                            AI agents, API providers, and crypto-native infrastructure teams.
                        </p>

                        <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
                            <button
                                onClick={() => navigate('/')}
                                className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-8 py-3 text-sm font-semibold text-white shadow-lg shadow-slate-900/10 transition hover:bg-slate-800"
                            >
                                Launch Live Demo
                                <ArrowRight size={16} />
                            </button>
                            <button
                                onClick={() => navigate('/transactions')}
                                className="rounded-full border border-slate-300 bg-white/80 px-8 py-3 text-sm font-semibold text-slate-700 transition hover:bg-white"
                            >
                                View Transaction Trace
                            </button>
                        </div>
                    </div>

                    <div className="mt-10 grid gap-4 md:grid-cols-3">
                        <SignalCard label="Platform role" value="Monetization middleware + control plane" />
                        <SignalCard label="Flow" value="402 challenge → pay → retry" />
                        <SignalCard label="Target user" value="AI agents, API providers, Web3 infra" />
                    </div>

                    <div className="mt-14 grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
                        <div className="rounded-3xl border border-white/70 bg-white/70 p-8 shadow-sm backdrop-blur-sm">
                            <div className="mb-6 flex items-center justify-between gap-4">
                                <div>
                                    <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
                                        Product pillars
                                    </p>
                                    <h2 className="mt-2 text-2xl font-semibold text-slate-900">
                                        The shortest path to a monetized endpoint
                                    </h2>
                                </div>
                            </div>

                            <div className="grid gap-4 md:grid-cols-3">
                                {PRODUCT_PILLARS.map((pillar) => (
                                    <FeatureCard key={pillar.title} {...pillar} />
                                ))}
                            </div>
                        </div>

                        <div className="rounded-3xl border border-slate-200 bg-slate-950 p-8 text-white shadow-lg shadow-slate-900/10">
                            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-300">
                                Commercial direction
                            </p>
                            <h2 className="mt-2 text-2xl font-semibold">
                                Start simple, expand with control
                            </h2>
                            <p className="mt-4 text-sm leading-7 text-slate-300">
                                APIX is designed to help teams learn in a sandbox, move into usage-based production,
                                and later adopt higher-trust operational controls as they scale.
                            </p>
                            <ul className="mt-6 space-y-4">
                                {COMMERCIAL_PATH.map((item) => (
                                    <li key={item} className="flex items-start gap-3 text-sm text-slate-200">
                                        <span className="mt-1 h-2.5 w-2.5 rounded-full bg-emerald-400"></span>
                                        <span>{item}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>

                    <div className="mt-14 rounded-3xl border border-white/70 bg-white/70 p-8 shadow-sm backdrop-blur-sm">
                        <div className="mb-8 text-center">
                            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
                                Who APIX is for
                            </p>
                            <h2 className="mt-2 text-2xl font-semibold text-slate-900 md:text-3xl">
                                Designed for operators, builders, and monetized infrastructure teams
                            </h2>
                        </div>
                        <div className="grid gap-6 md:grid-cols-3">
                            {AUDIENCES.map((audience) => (
                                <FeatureCard key={audience.title} {...audience} />
                            ))}
                        </div>
                    </div>
                </div>
            </section>
        </div>
    );
}

function SignalCard({ label, value }) {
    return (
        <div className="rounded-2xl border border-white/70 bg-white/75 px-5 py-4 text-left shadow-sm backdrop-blur-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">{label}</p>
            <p className="mt-2 text-sm font-semibold leading-6 text-slate-800">{value}</p>
        </div>
    );
}

function FeatureCard({ icon, title, description }) {
    return (
        <div className="flex h-full flex-col justify-between rounded-2xl border border-white/70 bg-white/85 p-5 text-left shadow-sm transition duration-300 hover:-translate-y-1">
            <div>
                <div className="mb-4">{icon}</div>
                <h3 className="mb-2 text-lg font-semibold leading-tight text-slate-900">{title}</h3>
                <p className="text-sm leading-relaxed text-slate-600">{description}</p>
            </div>
        </div>
    );
}
