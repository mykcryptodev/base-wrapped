'use client';

import { useState } from 'react';
import { Swiper, SwiperSlide } from 'swiper/react';
import { EffectCards } from 'swiper/modules';
import { analyzeWrapped } from './actions';

// Import Swiper styles
import 'swiper/css';
import 'swiper/css/effect-cards';

interface AnalysisItem {
  symbol?: string;
  name: string;
  stat: string;
  description: string;
  category?: string;
}

interface Analysis {
  popularTokens: AnalysisItem[];
  popularActions: AnalysisItem[];
  popularUsers: AnalysisItem[];
  otherStories: AnalysisItem[];
}

function AnalysisCard({ item }: { item: AnalysisItem }) {
  return (
    <div className="analysis-card min-h-[400px] flex flex-col justify-between">
      <div>
        <h3 className="text-3xl font-bold mb-6 text-gray-800">
          {item.symbol || item.name}
        </h3>
        <div className="text-lg font-medium text-gray-600 mb-4">
          {item.stat}
        </div>
        <p className="text-gray-700 text-xl leading-relaxed">
          {item.description}
        </p>
      </div>
      {item.category && (
        <div className="mt-4 inline-block px-4 py-2 bg-blue-50 text-blue-600 rounded-full text-sm font-medium">
          {item.category}
        </div>
      )}
    </div>
  );
}

export default function Home() {
  const [address, setAddress] = useState('');
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    try {
      const data = await analyzeWrapped(address);
      setAnalysis(data.analysis);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  // Flatten all analysis items into a single array for the swiper
  const allItems = analysis ? [
    ...analysis.popularTokens,
    ...analysis.popularActions,
    ...analysis.popularUsers,
    ...analysis.otherStories
  ] : [];

  return (
    <main className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
      <div className="max-w-4xl mx-auto p-8">
        <h1 className="text-5xl font-bold mb-8 text-center bg-clip-text text-transparent bg-gradient-to-r from-blue-600 via-blue-800 to-purple-600">
          Base Wrapped 2024
        </h1>
        
        <form onSubmit={handleSubmit} className="mb-12">
          <div className="flex gap-4 max-w-xl mx-auto">
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Enter Ethereum address"
              className="flex-1 p-4 border rounded-xl text-lg shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
            <button
              type="submit"
              disabled={loading || !address}
              className="px-8 py-4 bg-blue-600 text-white rounded-xl disabled:opacity-50 hover:bg-blue-700 transition-colors shadow-sm"
            >
              {loading ? 'Loading...' : 'Analyze'}
            </button>
          </div>
        </form>

        {error && (
          <div className="text-red-500 mb-4 text-center">
            {error}
          </div>
        )}

        {analysis && (
          <div className="max-w-md mx-auto">
            <Swiper
              effect={'cards'}
              grabCursor={true}
              modules={[EffectCards]}
              className="h-[500px]"
            >
              {allItems.map((item, index) => (
                <SwiperSlide key={index}>
                  <AnalysisCard item={item} />
                </SwiperSlide>
              ))}
            </Swiper>
            <div className="text-center mt-6 text-gray-500">
              Swipe to see more insights
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
