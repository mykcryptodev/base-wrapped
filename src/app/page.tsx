'use client';

import { useEffect, useState } from 'react';
import { Swiper, SwiperSlide } from 'swiper/react';
import { EffectCards } from 'swiper/modules';
import { analyzeWrapped, getJobStatus } from './actions';
import Image from 'next/image';
import { getAddressFromName } from '~/lib/getAddressFromName';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAccount } from 'wagmi';

// Import Swiper styles
import 'swiper/css';
import 'swiper/css/effect-cards';
import { Avatar, Name } from '@paperclip-labs/whisk-sdk/identity';
import { isAddressEqual, zeroAddress } from 'viem';
import Link from 'next/link';
import { truncateAddress } from '~/lib/truncateAddress';
import Share from '~/components/Share';
import useDebounce from '~/hooks/useDebounce';
import Frame from '~/components/Frame';

interface TitleCard {
  showIdentity?: boolean;
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

function TitleCard({ title, description, icon, showIdentity, address }: { title: string; description: string; icon?: string; showIdentity?: boolean; address?: `0x${string}` }) {
  return (
    <div className={`analysis-card h-[400px] flex flex-col items-center justify-center text-center px-8 ${showIdentity ? '!block md:flex' : 'flex'}`}>
      {showIdentity && (
        <div className="mb-4 grid grid-cols-1 gap-2">
          <div className="rounded-full overflow-hidden mx-auto bg-gray-100">
            <Avatar address={address ?? zeroAddress} size={64} className="rounded-full w-16 h-16 mx-auto" />
          </div>
          <div className="text-xl text-center font-bold text-gray-800">
            {address ? <Name address={address} /> : 'Unknown'}
          </div>
        </div>
      )}
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
    <div className="analysis-card min-h-[400px] flex flex-col overflow-y-auto block md:flex">
      <div>
        <div className="flex items-center gap-4 mb-6">
          {item.imgUrl && (
            <div className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0 bg-gray-100">
              <Image
                src={item.imgUrl} 
                alt={item.name}
                width={32}
                height={32}
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
        <div className="mt-auto mt-4 inline-block px-4 py-2 bg-blue-50 text-blue-600 rounded-full text-sm font-medium w-fit">
          {item.category.toLowerCase()}
        </div>
      )}
    </div>
  );
}

function Card({ item, address }: { item: CardItem, address?: `0x${string}` }) {
  if (item.type === 'title') {
    return <TitleCard title={item.title} description={item.description} icon={item.icon} showIdentity={item.showIdentity} address={address} />;
  }
  return <AnalysisCard item={item} />;
}

interface LoadingState {
  status: 'fetching' | 'analyzing' | 'complete';
  message: string;
  step: number;
  totalSteps: number;
  progress?: {
    current: number;
    total: number;
  };
  pollAttempts?: number;
}

export default function Home() {
  const { address } = useAccount();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [inputAddress, setInputAddress] = useState<`0x${string}`>();
  const debouncedInputAddress = useDebounce(inputAddress, 500);
  const [resolvedAddress, setResolvedAddress] = useState<`0x${string}`>();
  useEffect(() => {
    try {
      getAddressFromName(inputAddress as string).then(
        (resolved) => {
          setResolvedAddress(resolved as `0x${string}`);
        }
      ) 
    } catch (err) {
      console.error(err);
    }
  }, [debouncedInputAddress]);
  const [loading, setLoading] = useState(false);
  const [loadingState, setLoadingState] = useState<LoadingState | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [error, setError] = useState('');
  const [pollAttempts, setPollAttempts] = useState(0);

  useEffect(() => {
    const addressParam = searchParams.get('a');
    if (addressParam && !inputAddress) {
      setInputAddress(addressParam as `0x${string}`);
    }
  }, [searchParams, inputAddress]);

  useEffect(() => {
    if (resolvedAddress) {
      const url = new URL(window.location.href);
      url.searchParams.set('a', resolvedAddress);
      router.replace(url.pathname + url.search);
    }
  }, [resolvedAddress, router]);

  const pollForResults = async (address: string, currentAttempts: number = 0) => {
    try {
      const data = await analyzeWrapped(address, currentAttempts);
      
      if (data.status === 'complete') {
        setAnalysis(data.analysis);
        setLoadingState(null);
        setLoading(false);
        setPollAttempts(0);
        return;
      }

      const nextAttempt = currentAttempts + 1;
      setPollAttempts(nextAttempt);

      // If we have a job ID, use it to get status
      if (data.jobId) {
        const jobStatus = await getJobStatus(data.jobId);
        if (jobStatus.status === 'complete') {
          setAnalysis(jobStatus.result.analysis);
          setLoadingState(null);
          setLoading(false);
          setPollAttempts(0);
          return;
        }
      }

      setLoadingState({
        status: data.status,
        message: data.message,
        step: data.step,
        totalSteps: data.totalSteps,
        progress: data.progress,
        pollAttempts: nextAttempt
      });

      // Pass the incremented attempts count to the next call
      setTimeout(() => pollForResults(address, nextAttempt), 5000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setLoading(false);
      setLoadingState(null);
      setPollAttempts(0);
    }
  };

  const startAnalysis = async (address: string) => {
    setLoading(true);
    setError('');
    setAnalysis(null);
    
    try {
      // Make initial analysis request
      const data = await analyzeWrapped(address, 0);
      
      if (data.status === 'complete') {
        setAnalysis(data.analysis);
        setLoadingState(null);
        setLoading(false);
        return;
      }

      setLoadingState({
        status: data.status,
        message: data.message,
        step: data.step,
        totalSteps: data.totalSteps,
        progress: data.progress,
        pollAttempts: 0
      });

      // Start polling if not complete
      pollForResults(address);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setLoading(false);
      setLoadingState(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!resolvedAddress) {
      setError('Please enter a valid address or ENS name');
      return;
    }

    startAnalysis(resolvedAddress);
  };

  function LoadingCard() {
    const progress = loadingState?.progress;
    
    // Calculate the overall progress percentage
    const progressPercentage = progress 
      ? ((loadingState?.step - 1) / loadingState?.totalSteps * 100) + 
        (progress.current / progress.total * (100 / loadingState?.totalSteps))
      : ((loadingState?.step || 0) / (loadingState?.totalSteps || 1) * 100);
    
    return (
      <div className="analysis-card h-[400px] flex flex-col items-center justify-center text-center px-8">
        <div className="mb-8">
          <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
        </div>
        <h2 className="text-2xl font-bold mb-4 text-gray-800">
          {loadingState?.message || 'Loading...'}
        </h2>
        <div className="w-full max-w-xs bg-gray-200 rounded-full h-2 mb-4">
          <div 
            className="bg-blue-600 h-2 rounded-full transition-all duration-500"
            style={{ width: `${progressPercentage}%` }}
          ></div>
        </div>
        <p className="text-gray-600 mb-4">
          Step {loadingState?.step} of {loadingState?.totalSteps}
        </p>
        {pollAttempts > 0 && (
          <p className="text-sm text-gray-500 mt-2">
            You can leave this page and come back later. Your results will be ready when you return.
          </p>
        )}
      </div>
    );
  }

  // Create an array with title cards and analysis items
  const allItems: CardItem[] = analysis ? [
    // Intro Card
    {
      showIdentity: true,
      type: 'title',
      title: `Base 2024 Wrapped`,
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
      showIdentity: true,
      type: 'title',
      icon: '🎊',
      title: 'Happy New Year!',
      description: "Thank you for being part of the Base ecosystem in 2024. Here's to an even more exciting 2025 filled with new achievements and milestones. Keep building! 🚀"
    },
  ] : [];

  // Add this effect to handle automatic analysis on page load
  useEffect(() => {
    const addressParam = searchParams.get('a');
    if (addressParam && !loading && !analysis) {
      getAddressFromName(addressParam).then((resolved) => {
        if (resolved) {
          setInputAddress(addressParam as `0x${string}`);
          setResolvedAddress(resolved as `0x${string}`);
          startAnalysis(resolved as string);
        }
      }).catch((err) => {
        console.error(err);
        setError('Invalid address or ENS name');
      });
    }
  }, [searchParams]); // Only run on initial load and when search params change

  const setConnectedAddress = (address: `0x${string}`) => {
    setInputAddress(address);
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
      <div className="max-w-4xl mx-auto p-8">
        <Image
          priority
          src="/splash.png"
          alt="Base Wrapped Logo"
          width={128}
          height={128}
          className="w-24 h-24 mx-auto"
        />
        <h1 className="text-5xl font-bold text-center bg-clip-text text-transparent bg-gradient-to-r from-blue-600 via-blue-500 to-purple-600 tracking-tighter">
          Base Wrapped 2024
        </h1>
        <div className="flex justify-center items-center w-full gap-2 text-gray-500 text-sm block text-center mb-2">
          <span className="text-lg">built by</span> 
          <div className="flex items-center gap-1">
            <div className="rounded-full overflow-hidden bg-gray-100 w-6 h-6">
              <Avatar address="0x653Ff253b0c7C1cc52f484e891b71f9f1F010Bfb" size={24} className="rounded-full" />
            </div>
            <Link href="https://warpcast.com/myk" target="_blank" className="text-lg font-bold text-blue-600 hover:text-blue-700 transition-colors">myk.eth</Link>
          </div>
        </div>

        <p className="text-gray-500 text-sm mt-4 text-center mb-4 max-w-sm text-center mx-auto">
          Discover what you did onchain in 2024! Look back on your swaps, mints, sends, and more!
        </p>

        <Share />
        
        <form onSubmit={handleSubmit} className="mb-12">
          <div className="flex flex-col md:flex-row gap-4 max-w-xl mx-auto items-start items-stretch">
            <input
              type="text"
              value={inputAddress}
              onChange={(e) => setInputAddress(e.target.value as `0x${string}`)}
              onBlur={(e) => setInputAddress(e.target.value as `0x${string}`)}
              placeholder="Enter address or name"
              autoComplete="off"
              disabled={loading}
              className="flex-1 p-4 border rounded-xl text-lg shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={loading || !resolvedAddress}
              className="px-8 py-4 bg-blue-600 text-white rounded-xl disabled:opacity-50 hover:bg-blue-700 transition-colors shadow-sm"
            >
              {loading ? 'Loading...' : 'Wrap!'}
            </button>
          </div>
          {resolvedAddress && (
            <span className="text-gray-500 text-sm mt-2 block text-center md:pr-8">
              {truncateAddress(resolvedAddress)}
            </span>
          )}
          {address && !isAddressEqual(address, (resolvedAddress ?? zeroAddress)) && (
            <button 
              onClick={() => setConnectedAddress(address)} 
              className="text-xs mx-auto bg-blue-600 text-white rounded-xl px-4 py-2 mt-2 block text-center"
            >
              Set your address
            </button>
          )}
        </form>


        {error && (
          <div className="text-red-500 mb-4 text-center">
            {error}
          </div>
        )}

        <div className="max-w-md mx-auto">
          {loading && !analysis && (
            <LoadingCard />
          )}

          {analysis && (
            <>
              <Swiper
                effect={'cards'}
                grabCursor={true}
                modules={[EffectCards]}
                className="h-[500px]"
              >
                {allItems.map((item, index) => (
                  <SwiperSlide key={index}>
                    <Card item={item} address={resolvedAddress} />
                  </SwiperSlide>
                ))}
              </Swiper>
              <div className="text-center mt-6 text-gray-500">
                Swipe to see more insights
              </div>
            </>
          )}
        </div>
      </div>
      <Frame />
    </main>
  );
}
