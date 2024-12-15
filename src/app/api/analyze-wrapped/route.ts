import { NextResponse } from 'next/server';
import { isValidApiKey } from '~/utils/api/validate';
import { getFromS3Cache } from '~/utils/api/s3';
import { activeAnalyses, analysisProgress } from '~/utils/api/openai';
import { isAddressEqual, zeroAddress } from 'viem';
export async function POST(request: Request) {
  try {
    if (!isValidApiKey(request)) {
      return NextResponse.json(
        { error: 'Unauthorized - Invalid or missing API key' },
        { status: 401 }
      );
    }

    const { address, fid } = await request.json();

    if (!address || typeof address !== 'string') {
      return NextResponse.json(
        { error: 'Invalid address parameter' },
        { status: 400 }
      );
    }

    const normalizedAddress = address.toLowerCase();
    
    // Add zero address check
    if (isAddressEqual(normalizedAddress as `0x${string}`, zeroAddress)) {
      return NextResponse.json(
        { error: 'Cannot analyze zero address' },
        { status: 400 }
      );
    }

    // Check if we have cached analysis in S3
    const analysisCacheKey = `wrapped-2024-analysis/${normalizedAddress}.json`;
    const cachedAnalysis = await getFromS3Cache(analysisCacheKey);
    
    if (cachedAnalysis) {
      console.log('Analysis cache hit for address:', address);
      return NextResponse.json({ 
        status: 'complete',
        analysis: cachedAnalysis 
      });
    }

    // Check if analysis is already in progress
    if (activeAnalyses.has(normalizedAddress)) {
      console.log(`Analysis already in progress for ${normalizedAddress}`);
      const chunkProgress = analysisProgress.get(normalizedAddress);
      
      // Get cached transactions to determine the actual state
      const rawCacheKey = `wrapped-2024-raw/${normalizedAddress}.json`;
      const hasCachedTransactions = await getFromS3Cache(rawCacheKey);
      
      // If we don't have transactions yet, we're still in fetching state
      if (!hasCachedTransactions) {
        return NextResponse.json({
          status: 'fetching',
          message: 'Fetching your transaction history...',
          step: 1,
          totalSteps: 3
        });
      }
      
      // If we have transactions, we're analyzing
      return NextResponse.json({
        status: 'analyzing',
        message: chunkProgress 
          ? `Analyzing transaction batch ${chunkProgress.currentChunk + 1} of ${chunkProgress.totalChunks + 1}...`
          : 'Analyzing your transactions with AI...',
        step: 2,
        totalSteps: 3,
        progress: chunkProgress ? {
          current: chunkProgress.currentChunk,
          total: chunkProgress.totalChunks
        } : undefined
      });
    }

    // Check if we have cached raw transactions
    const rawCacheKey = `wrapped-2024-raw/${normalizedAddress}.json`;
    let transactions;
    let status: 'fetching' | 'analyzing' = 'fetching';
    let step = 1;
    
    try {
      transactions = await getFromS3Cache(rawCacheKey);
      if (transactions) {
        status = 'analyzing';
        step = 2;
      }
    } catch (error) {
      console.error('Error getting transactions from S3:', error);
    }
    
    // Start the background process
    activeAnalyses.add(normalizedAddress);
    console.log(`Starting analysis for ${normalizedAddress}`);
    
    try {
      const processUrl = new URL(`/api/process-wrapped`, process.env.APP_URL!).toString();
      fetch(processUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.API_ROUTE_SECRET!
        },
        body: JSON.stringify({ address: normalizedAddress, fid })
      }).catch((error) => {
        console.error('Error triggering background process:', error);
        activeAnalyses.delete(normalizedAddress);
      });
    } catch (error) {
      console.error('Error triggering background process:', error);
      activeAnalyses.delete(normalizedAddress);
    }

    return NextResponse.json({
      status,
      message: status === 'analyzing' 
        ? 'Starting analysis of your transactions...'
        : 'Fetching your transaction history... (Step 1 of 3)',
      step,
      totalSteps: 3
    });

  } catch (error) {
    console.error('Error processing request:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 