import { NextResponse } from 'next/server';
import { fetchTransactionsFromZapper } from '~/utils/api/zapper';
import { getFromS3Cache, saveToS3Cache } from '~/utils/api/s3';
import { isValidApiKey } from '~/utils/api/validate';
import { activeAnalyses, getAnalysisFromOpenAI } from '~/utils/api/openai';
import { getUserNotificationDetails } from "~/lib/kv";
import { sendFrameNotification } from "~/lib/notifs";
import { isAddressEqual } from 'viem';
import { zeroAddress } from 'viem';

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

    // Check if analysis is already in progress
    if (activeAnalyses.has(normalizedAddress)) {
      console.log(`Analysis already in progress for ${normalizedAddress}, skipping duplicate request`);
      return NextResponse.json({ 
        status: 'processing',
        message: 'Analysis already in progress'
      });
    }

    // Start the background processing
    processInBackground(normalizedAddress, fid).catch(console.error);

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

async function processInBackground(address: string, fid?: number) {
  const rawCacheKey = `wrapped-2024-raw/${address}.json`;
  const analysisCacheKey = `wrapped-2024-analysis/${address}.json`;

  console.log(`Starting background process for ${address}`);
  console.log({rawCacheKey, analysisCacheKey});

  try {
    // Double-check the lock before proceeding
    if (activeAnalyses.has(address)) {
      console.log(`Analysis already in progress for ${address}, aborting duplicate process`);
      return;
    }

    // Add to active analyses before starting
    activeAnalyses.add(address);
    console.log(`Added ${address} to active analyses`);

    // First check if we already have raw transactions
    let transactions = await getFromS3Cache(rawCacheKey);
    console.log({cacheTxs: transactions});
    
    // If no cached transactions, fetch from Zapper
    if (!transactions) {
      console.log('No cached transactions found, fetching from Zapper');
      transactions = await fetchTransactionsFromZapper(address);
      if (!transactions || transactions.length === 0) {
        console.log('No transactions found from Zapper');
        throw new Error('No transactions found');
      }
      console.log(`Found ${transactions.length} transactions from Zapper`);
      // Store the raw transactions in S3
      await saveToS3Cache(rawCacheKey, transactions);
      console.log('Saved raw transactions to S3');
    } else {
      console.log(`Using ${transactions.length} cached transactions`);
    }

    // Get analysis from OpenAI
    console.log('Starting OpenAI analysis');
    const analysis = await getAnalysisFromOpenAI(transactions, address);
    if (!analysis) {
      throw new Error('OpenAI analysis returned null');
    }
    console.log('Completed OpenAI analysis');

    // Store the analysis in S3
    await saveToS3Cache(analysisCacheKey, analysis);
    console.log('Saved analysis to S3');

    // After analysis is complete, send notification if user has enabled them
    if (fid) {
      const notificationDetails = await getUserNotificationDetails(fid);
      if (notificationDetails) {
        await sendFrameNotification({
          fid,
          title: "Analysis Complete! 🎉",
          body: "Your Base Wrapped analysis is ready to view",
        });
        console.log('Sent completion notification');
      }
    }
  } catch (error) {
    console.error('Error in background processing:', error);
    // Attempt to clean up S3 if we failed
    try {
      // If we have raw transactions but analysis failed, we should clean up
      const hasRawTransactions = await getFromS3Cache(rawCacheKey);
      if (hasRawTransactions) {
        console.log('Cleaning up failed analysis data');
        // clean up raw transactions
        await saveToS3Cache(rawCacheKey, null);
      }
    } catch (cleanupError) {
      console.error('Error during cleanup:', cleanupError);
    }
  } finally {
    // Remove the lock when processing is complete
    activeAnalyses.delete(address);
    console.log(`Completed analysis for ${address} (success or failure)`);
  }
} 