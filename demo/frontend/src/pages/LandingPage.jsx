import { useNavigate } from 'react-router-dom';
import { ArrowRight, Zap, Shield, Globe } from 'lucide-react';
import bgImage from '../assets/images/image.png';

export default function LandingPage() {
    const navigate = useNavigate();

    return (
        <div className="overflow-hidden relative">
            {/* Background Image */}
            <div className="absolute inset-0 z-0">
                <img src={bgImage} alt="Background" className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-white/40 mix-blend-overlay"></div> {/* Optional overlay for text readability */}
            </div>

            {/* Hero Section */}
            <section className="relative min-h-[90vh] flex items-center justify-center pt-20 z-10">
                {/* Abstract Background Shapes - REMOVED in favor of image */}


                <div className="container relative z-10 px-6 text-center">
                    <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/60 border border-white/40 shadow-sm mb-6 animate-fade-in-up">
                        <div className="w-6 h-6 rounded-full bg-white flex items-center justify-center">
                            <span className="text-lg">☁️</span>
                        </div>
                        <span className="text-sm font-semibold text-slate-600 tracking-wide">APIX</span>
                    </div>

                    <h1 className="text-6xl md:text-8xl font-medium tracking-tight mb-4 animate-fade-in-up delay-100 text-slate-800 font-sans">
                        The Future of API <br />
                        Monetization
                    </h1>

                    <p className="text-lg md:text-xl text-slate-500 max-w-2xl mx-auto mb-10 animate-fade-in-up delay-200 font-light">
                        Discover, integrate, and monetize premium APIs<br />
                        in a serene, secure environment.
                    </p>

                    <div className="flex justify-center mb-20 animate-fade-in-up delay-300">
                        <button
                            onClick={() => navigate('/dashboard')}
                            className="bg-[#EBEAE8] hover:bg-[#DEDCD9] text-slate-800 px-8 py-3 rounded-full font-medium transition-colors shadow-sm"
                        >
                            Explore Marketplace
                        </button>
                    </div>

                    {/* Featured APIs Grid - Matching Mockup Horizontal Style */}
                    <div className="container max-w-5xl mx-auto">
                        <div className="text-center mb-8">
                            <h3 className="text-xl font-medium text-slate-700">Featured APIs</h3>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            <FeatureCard
                                icon={<ArrowRight className="text-slate-700" size={24} />} // Using generic icons as per mockup for now
                                title="Global Payment Gateway"
                                description="Secure, seamless cross-border transactions."
                                price="From $99/mo"
                            />
                            <FeatureCard
                                icon={<Zap className="text-slate-700" size={24} />}
                                title="AI Data Analytics"
                                description="Real-time insights with machine learning."
                                price="From $249/mo"
                            />
                            <FeatureCard
                                icon={<Globe className="text-slate-700" size={24} />}
                                title="Climate & Weather Data"
                                description="Hyper-local forecasting and climate trends."
                                price="From $49/mo"
                            />
                            <FeatureCard
                                icon={<Shield className="text-slate-700" size={24} />}
                                title="Blockchain Identity"
                                description="Decentralized identity verification."
                                price="From $140/mo"
                            />
                            <FeatureCard
                                icon={<Zap className="text-slate-700" size={24} />}
                                title="Health & Wellness API"
                                description="Integrate health data and wellness metrics."
                                price="From $79/mo"
                            />
                            <FeatureCard
                                icon={<ArrowRight className="text-slate-700" size={24} />}
                                title="Logistics & Supply Chain"
                                description="Real-time tracking and route optimization."
                                price="From $199/mo"
                            />
                        </div>
                    </div>
                </div>
            </section>
        </div>
    );
}

function FeatureCard({ icon, title, description, price }) {
    return (
        <div className="card text-left hover:-translate-y-1 transition-transform duration-300 flex flex-col justify-between h-full bg-white/50 border border-white/60">
            <div>
                <div className="mb-4">
                    {icon}
                </div>
                <h3 className="text-lg font-semibold text-slate-800 mb-2 leading-tight">{title}</h3>
                <p className="text-slate-500 text-sm leading-relaxed mb-6">{description}</p>
            </div>

            <div className="flex items-center justify-between mt-auto">
                <span className="text-xs font-semibold text-slate-900">{price}</span>
                <button className="px-4 py-1.5 rounded-full bg-slate-100 hover:bg-slate-200 text-xs font-medium text-slate-700 transition-colors">
                    Learn More
                </button>
            </div>
        </div>
    );
}
