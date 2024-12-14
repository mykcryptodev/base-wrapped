'use client';

import { useState } from 'react';
import { Swiper, SwiperSlide } from 'swiper/react';
import { EffectCards } from 'swiper/modules';
import { analyzeWrapped } from './actions';
import Image from 'next/image';

// Import Swiper styles
import 'swiper/css';
import 'swiper/css/effect-cards';

interface TitleCard {
  type: 'title';
  title: string;
  description: string;
  icon?: string;
}

interface AnalysisItem {
  type?: 'analysis';
  symbol?: string;
  name: string;
  stat: string;
  description: string;
  category?: string;
  imgUrl?: string;
}

interface Analysis {
  popularTokens: AnalysisItem[];
  popularActions: AnalysisItem[];
  popularUsers: AnalysisItem[];
  otherStories: AnalysisItem[];
}

type CardItem = TitleCard | (AnalysisItem & { type: 'analysis' });

function TitleCard({ title, description, icon }: { title: string; description: string; icon?: string }) {
  return (
    <div className="analysis-card min-h-[400px] flex flex-col items-center justify-center text-center px-8">
      <h2 className="text-4xl font-bold mb-6 text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-purple-600 flex flex-col items-center">
        {icon && <span className="text-4xl">{icon}</span>}
        {title}
      </h2>
      <p className="text-xl text-gray-600 leading-relaxed">
        {description}
      </p>
    </div>
  );
}

function AnalysisCard({ item }: { item: AnalysisItem }) {
  return (
    <div className="analysis-card min-h-[400px] flex flex-col justify-between">
      <div>
        <div className="flex items-center gap-4 mb-6">
          {item.imgUrl && (
            <div className="w-12 h-12 rounded-full overflow-hidden flex-shrink-0 bg-gray-100">
              <Image
                src={item.imgUrl} 
                alt={item.name}
                width={48}
                height={48}
                className="w-full h-full object-cover"
                onError={(e) => {
                  // Hide the image on error
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            </div>
          )}
          <h3 className="text-3xl font-bold text-gray-800">
            {item.symbol || item.name}
          </h3>
        </div>
        <div className="text-lg font-medium text-gray-600 mb-4">
          {item.stat}
        </div>
        <p className="text-gray-700 text-xl leading-relaxed">
          {item.description}
        </p>
      </div>
      {item.category && (
        <div className="mt-4 inline-block px-4 py-2 bg-blue-50 text-blue-600 rounded-full text-sm font-medium w-fit">
          {item.category.toLowerCase()}
        </div>
      )}
    </div>
  );
}

function Card({ item }: { item: CardItem }) {
  if (item.type === 'title') {
    return <TitleCard title={item.title} description={item.description} icon={item.icon} />;
  }
  return <AnalysisCard item={item} />;
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

  // Create an array with title cards and analysis items
  const allItems: CardItem[] = analysis ? [
    // Intro Card
    {
      type: 'title',
      title: 'Your Base 2024 Wrapped',
      description: "Let's take a journey through your year on Base. We've analyzed your transactions to uncover some interesting insights about your onchain activity. Swipe to begin! →"
    },

    // Popular Tokens Section
    {
      type: 'title',
      icon: '🪙',
      title: 'Popular Tokens',
      description: "Discover the tokens that defined your journey on Base"
    },
    ...analysis.popularTokens.map(item => ({ ...item, type: 'analysis' as const })),
    
    // Popular Actions Section
    {
      type: 'title',
      icon: '⚡',
      title: 'Your Actions',
      description: "A look at how you've been interacting with Base"
    },
    ...analysis.popularActions.map(item => ({ ...item, type: 'analysis' as const })),
    
    // Popular Users Section
    {
      type: 'title',
      icon: '🤝',
      title: 'Your Network',
      description: "The addresses you've interacted with the most"
    },
    ...analysis.popularUsers.map(item => ({ ...item, type: 'analysis' as const })),
    
    // Other Stories Section
    {
      type: 'title',
      icon: '✨',
      title: 'Highlights',
      description: "Special moments from your Base journey"
    },
    ...analysis.otherStories.map(item => ({ ...item, type: 'analysis' as const })),

    // Final Card
    {
      type: 'title',
      icon: '🎊',
      title: 'Happy New Year!',
      description: "Thank you for being part of the Base ecosystem in 2024. Here's to an even more exciting 2025 filled with new achievements and milestones. Keep building! 🚀"
    },
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
              autoComplete="off"
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
                  <Card item={item} />
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
