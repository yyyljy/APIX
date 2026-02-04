import { Search, Filter, Star } from 'lucide-react';

const MOCK_PROVIDERS = [
    { name: 'OpenAI', category: 'AI/ML', rating: 4.9, apis: 12, description: 'Leading AI models for text and image generation.' },
    { name: 'Stripe', category: 'Finance', rating: 4.8, apis: 8, description: 'Payment infrastructure for the internet.' },
    { name: 'Twilio', category: 'Communication', rating: 4.7, apis: 15, description: 'Connect with customers via SMS, Voice, and Video.' },
    { name: 'Alchemy', category: 'Blockchain', rating: 4.9, apis: 6, description: 'The power of blockchain, made accessible.' },
    { name: 'SendGrid', category: 'Email', rating: 4.6, apis: 4, description: 'Email delivery service for marketing and transactional emails.' },
    { name: 'Google Cloud', category: 'Infrastructure', rating: 4.8, apis: 45, description: 'Suite of cloud computing services.' },
];

export default function ProvidersPage() {
    return (
        <div className="container py-12 md:py-20">
            <div className="text-center max-w-2xl mx-auto mb-16">
                <h1 className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-violet-600 dark:from-blue-400 dark:to-violet-400 mb-4">
                    Top API Providers
                </h1>
                <p className="text-gray-600 dark:text-gray-400 text-lg">
                    Discover and integrate with the world's best technology companies.
                </p>
            </div>

            <div className="flex flex-col md:flex-row gap-6 mb-12">
                <div className="relative flex-1">
                    <Search className="absolute left-4 top-3.5 text-gray-400" size={20} />
                    <input
                        type="text"
                        placeholder="Search providers..."
                        className="glass-input w-full pl-12 pr-4 py-3 rounded-xl text-lg"
                    />
                </div>
                <button className="btn btn-outline gap-2 px-6">
                    <Filter size={20} /> Categories
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {MOCK_PROVIDERS.map((provider) => (
                    <div key={provider.name} className="card group hover:-translate-y-1 hover:shadow-xl hover:shadow-blue-500/10 cursor-pointer">
                        <div className="flex justify-between items-start mb-4">
                            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-100 to-indigo-100 dark:from-blue-900/30 dark:to-indigo-900/30 flex items-center justify-center text-xl font-bold text-blue-600 dark:text-blue-400">
                                {provider.name[0]}
                            </div>
                            <div className="flex items-center gap-1 bg-amber-50 dark:bg-amber-900/20 text-amber-500 px-2 py-1 rounded-lg text-xs font-bold">
                                <Star size={12} fill="currentColor" /> {provider.rating}
                            </div>
                        </div>
                        <h3 className="text-xl font-bold mb-1">{provider.name}</h3>
                        <p className="text-sm text-blue-600 dark:text-blue-400 font-medium mb-3">{provider.category}</p>
                        <p className="text-gray-500 text-sm mb-6 line-clamp-2">{provider.description}</p>
                        <div className="flex items-center justify-between pt-4 border-t border-gray-100 dark:border-slate-800">
                            <span className="text-xs font-semibold text-gray-500">{provider.apis} APIs available</span>
                            <span className="text-sm font-bold text-gray-900 dark:text-white group-hover:text-blue-600 transition-colors">View Profile →</span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
