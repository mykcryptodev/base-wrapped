import { NextResponse } from 'next/server';
import { isValidApiKey } from '~/utils/api/validate';
import { getFromS3Cache } from '~/utils/api/s3';
import { isAddressEqual, zeroAddress } from 'viem';

function getFetchingMessage(pollAttempts: number): string {
  if (pollAttempts > 16) {
    return "You can come back later, I'm still fetching your txs...";
  }
  if (pollAttempts > 14) {
    return "Jeez Louise. Ok I'm gonna keep fetching your txs...";
  }
  if (pollAttempts > 12) {
    return "Wow, you've been really active on Base! Still working on fetching all your transactions...";
  }
  if (pollAttempts > 10) {
    return "Anyways that myk.eth guy is pretty cool, huh? Still fetching your txs...";
  }
  if (pollAttempts > 8) {
    return "This is taking longer than usual. You must have been busy on Base!";
  }
  if (pollAttempts > 8) {
    return "Mint anything cool lately?";
  }
  if (pollAttempts > 6) {
    return "While we wait, who did you onboard today?";
  }
  if (pollAttempts > 4) {
    return "Still fetching your transactions... You've done quite a bit on Base!";
  }
  if (pollAttempts > 2) {
    return "We're still working on fetching your transactions...";
  }
  return "Fetching your transaction history...";
}

function getAnalyzingMessage(pollAttempts: number, chunkProgress?: { currentChunk: number, totalChunks: number }): string {
  if (chunkProgress) {
    return `Analyzing transaction batch ${chunkProgress.currentChunk + 1} of ${chunkProgress.totalChunks + 1}...`;
  }
  
  if (pollAttempts > 16) {
    return "You can come back later, I'm still crunching the numbers...";
  }
  if (pollAttempts > 14) {
    return "The numbers are crunching, stay tuned...";
  }
  if (pollAttempts > 10) {
    return "You've been really active on Base! Still analyzing...";
  }
  if (pollAttempts > 8) {
    return "Our AI is fascinated by your transaction history! Still analyzing...";
  }
  if (pollAttempts > 6) {
    return "There's a lot to analyze here! The AI is working hard...";
  }
  if (pollAttempts > 4) {
    return "Still crunching the numbers... You've had an interesting year!";
  }
  if (pollAttempts > 2) {
    return "The AI is carefully analyzing your transactions...";
  }
  return "Analyzing your transactions with AI...";
}

export async function POST(request: Request) {
  try {
    if (!isValidApiKey(request)) {
      return NextResponse.json(
        { error: 'Unauthorized - Invalid or missing API key' },
        { status: 401 }
      );
    }

    const { address, fid, pollAttempts = 0 } = await request.json();

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

    // Start or get status of job
    const jobResponse = await fetch(new URL('/api/start-job', process.env.APP_URL!).toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.API_ROUTE_SECRET!
      },
      body: JSON.stringify({ address: normalizedAddress, fid })
    });

    if (!jobResponse.ok) {
      throw new Error('Failed to start job');
    }

    const jobData = await jobResponse.json();
    const { jobId, status, progress } = jobData;

    // Return appropriate message based on status
    return NextResponse.json({
      jobId,
      status,
      message: status === 'analyzing' 
        ? getAnalyzingMessage(pollAttempts, progress?.chunkProgress)
        : getFetchingMessage(pollAttempts),
      step: progress?.step || 1,
      totalSteps: progress?.totalSteps || 3,
      progress: progress?.chunkProgress
    });

  } catch (error) {
    console.error('Error processing request:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 