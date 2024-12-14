import { NextResponse } from 'next/server';
import { fetchTransactionsFromZapper, getAnalysisFromOpenAI, saveToS3Cache, isValidApiKey, getFromS3Cache, activeAnalyses } from '../analyze-wrapped/route';

export async function POST(request: Request) {
  try {
    if (!isValidApiKey(request)) {
      return NextResponse.json(
        { error: 'Unauthorized - Invalid or missing API key' },
        { status: 401 }
      );
    }

    const { address } = await request.json();

    if (!address || typeof address !== 'string') {
      return NextResponse.json(
        { error: 'Invalid address parameter' },
        { status: 400 }
      );
    }

    const normalizedAddress = address.toLowerCase();

    // Check if analysis is already in progress
    if (activeAnalyses.has(normalizedAddress)) {
      console.log(`Analysis already in progress for ${normalizedAddress}, skipping duplicate request`);
      return NextResponse.json({ 
        status: 'processing',
        message: 'Analysis already in progress'
      });
    }

    // Start the background processing
    processInBackground(normalizedAddress).catch(console.error);

    return NextResponse.json({ 
      status: 'processing',
      message: 'Started processing your request'
    });
  } catch (error) {
    console.error('Error starting process:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

async function processInBackground(address: string) {
  const rawCacheKey = `wrapped-2024-raw/${address}.json`;
  const analysisCacheKey = `wrapped-2024-analysis/${address}.json`;

  console.log({rawCacheKey, analysisCacheKey});

  try {
    // Double-check the lock before proceeding
    if (activeAnalyses.has(address)) {
      console.log(`Analysis already in progress for ${address}, aborting duplicate process`);
      return;
    }

    // First check if we already have raw transactions
    let transactions = await getFromS3Cache(rawCacheKey);
    
    // If no cached transactions, fetch from Zapper
    if (!transactions) {
      console.log('No cached transactions found, fetching from Zapper');
      transactions = await fetchTransactionsFromZapper(address);
      // Store the raw transactions in S3
      await saveToS3Cache(rawCacheKey, transactions);
    } else {
      console.log('Using cached transactions');
    }

    // Get analysis from OpenAI
    const analysis = await getAnalysisFromOpenAI(transactions, address);

    // Store the analysis in S3
    await saveToS3Cache(analysisCacheKey, analysis);
  } catch (error) {
    console.error('Error in background processing:', error);
  } finally {
    // Remove the lock when processing is complete
    activeAnalyses.delete(address);
    console.log(`Completed analysis for ${address}`);
  }
} 