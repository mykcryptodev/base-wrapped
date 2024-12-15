import 'dotenv/config';
import { getQueue } from './src/lib/queue';
import { fetchTransactionsFromZapper } from './src/utils/api/zapper';
import { getFromS3Cache, saveToS3Cache } from './src/utils/api/s3';
import { getAnalysisFromOpenAI } from './src/utils/api/openai';
import { getUserNotificationDetails } from "./src/lib/kv";
import { sendFrameNotification } from "./src/lib/notifs";

console.log('Starting worker process...');
console.log('Environment check:', {
  redisUrl: process.env.KV_REST_API_URL ? 'set' : 'not set',
  redisToken: process.env.KV_REST_API_TOKEN ? 'set' : 'not set'
});

const jobQueue = getQueue();

// Process jobs in the queue
jobQueue.process(async (job) => {
  const { address, fid } = job.data;
  const normalizedAddress = address.toLowerCase();
  
  try {
    console.log(`Processing job ${job.id} for address ${normalizedAddress}`);
    
    // Update status to fetching
    await job.progress({
      status: 'fetching',
      step: 1,
      totalSteps: 3
    });

    // First check if we already have raw transactions
    const rawCacheKey = `wrapped-2024-raw/${normalizedAddress}.json`;
    let transactions = await getFromS3Cache(rawCacheKey);
    
    // If no cached transactions, fetch from Zapper
    if (!transactions) {
      console.log('Fetching transactions from Zapper...');
      transactions = await fetchTransactionsFromZapper(normalizedAddress);
      if (!transactions || transactions.length === 0) {
        throw new Error('No transactions found');
      }
      // Store the raw transactions in S3
      await saveToS3Cache(rawCacheKey, transactions);
      console.log('Saved transactions to S3');
    }

    // Get analysis from OpenAI
    const analysisCacheKey = `wrapped-2024-analysis/${normalizedAddress}.json`;
    const chunks = chunkTransactions(transactions);
    
    console.log(`Processing ${chunks.length} chunks...`);
    for (let i = 0; i < chunks.length; i++) {
      // Update progress with chunk information
      await job.progress({
        status: 'analyzing',
        step: 2,
        totalSteps: 3,
        chunkProgress: {
          currentChunk: i,
          totalChunks: chunks.length
        }
      });

      // Process this chunk
      await processChunk(chunks[i]);
      console.log(`Processed chunk ${i + 1}/${chunks.length}`);
    }

    // Final analysis
    console.log('Getting final analysis from OpenAI...');
    const analysis = await getAnalysisFromOpenAI(transactions, normalizedAddress);
    if (!analysis) {
      throw new Error('OpenAI analysis returned null');
    }

    // Store the analysis in S3
    await saveToS3Cache(analysisCacheKey, analysis);
    console.log('Saved analysis to S3');

    // Send notification if user has enabled them
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

    console.log(`Job ${job.id} completed successfully`);
    // Return the final analysis
    return { status: 'complete', analysis };
  } catch (error) {
    console.error(`Error processing job ${job.id}:`, error);
    throw error;
  }
});

// Helper function to chunk transactions
function chunkTransactions(transactions: any[], size = 200) {
  const chunks = [];
  for (let i = 0; i < transactions.length; i += size) {
    chunks.push(transactions.slice(i, i + size));
  }
  return chunks;
}

// Helper function to process a chunk
async function processChunk(chunk: any[]) {
  // Add your chunk processing logic here
  await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate processing time
}

// Keep the process running
process.on('SIGTERM', async () => {
  console.log('Shutting down worker...');
  await jobQueue.close();
  process.exit(0);
});

console.log('Worker ready to process jobs'); 