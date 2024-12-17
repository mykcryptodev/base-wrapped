import 'dotenv/config';
import { Job, Queue, JobOptions } from 'bull';
import { getQueue } from './src/lib/queue';
import { fetchTransactionsFromZapper } from './src/utils/api/zapper';
import { getFromS3Cache, saveToS3Cache } from './src/utils/api/s3';
import { getAnalysisFromOpenAI } from './src/utils/api/openai';
import { getUserNotificationDetails } from "./src/lib/kv";
import { sendFrameNotification } from "./src/lib/notifs";

// Add startup logging immediately
console.log('Worker script starting...', {
  nodeVersion: process.version,
  nodeEnv: process.env.NODE_ENV,
  cwd: process.cwd(),
  dirname: __dirname
});

// Verify required environment variables
const requiredEnvVars = [
  'KV_REST_API_URL',
  'KV_REST_API_TOKEN',
  'OPENAI_API_KEY'
];

const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);
if (missingEnvVars.length > 0) {
  console.error('Missing required environment variables:', missingEnvVars);
  process.exit(1);
}

// Define types for our job data and return value
interface JobData {
  address: string;
  fid?: number;
}

// Define the Zapper transaction type based on their API response
interface ZapperTransaction {
  node: {
    key: string;
    timestamp: number;
    transaction: {
      toUser: {
        displayName: {
          value: string;
        };
      };
      fromUser: {
        displayName: {
          value: string;
        };
      };
      value: string;
      hash?: string; // Make hash optional since it might not always be present
    };
    app: {
      tags: string[];
      app: {
        imgUrl: string;
        category: {
          name: string;
          description: string;
        };
      };
    };
    interpretation: {
      processedDescription: string;
    };
    interpreter: {
      category: string;
    };
  };
}

// Our normalized transaction type
interface Transaction {
  hash: string;
  timestamp: number;
  description: string;
  category: string;
  tags: string[];
  fromUser?: string;
  toUser?: string;
  value?: string;
  [key: string]: unknown;
}

interface JobProgress {
  status: 'fetching' | 'analyzing';
  step: number;
  totalSteps: number;
  chunkProgress?: {
    currentChunk: number;
    totalChunks: number;
  };
}

interface JobResult {
  status: 'complete';
  analysis: {
    popularTokens: unknown[];
    popularActions: unknown[];
    popularUsers: unknown[];
    otherStories: Array<{
      name: string;
      stat: string;
      description: string;
      category: string;
    }>;
  };
}

const fetchWithTimeout = async <T>(promise: Promise<T>, timeoutMs: number): Promise<T> => {
  const timeout = new Promise<never>((_, reject) => 
    setTimeout(() => reject(new Error('Operation timeout')), timeoutMs)
  );
  return Promise.race([promise, timeout]);
};

// Convert Zapper transaction to our normalized format
function normalizeTransaction(zapperTx: ZapperTransaction): Transaction {
  return {
    hash: zapperTx.node.transaction.hash || zapperTx.node.key, // Fallback to key if hash is not present
    timestamp: zapperTx.node.timestamp,
    description: zapperTx.node.interpretation.processedDescription || '',
    category: zapperTx.node.interpreter.category || '',
    tags: zapperTx.node.app?.tags || [],
    fromUser: zapperTx.node.transaction.fromUser?.displayName?.value || '',
    toUser: zapperTx.node.transaction.toUser?.displayName?.value || '',
    value: zapperTx.node.transaction.value || '0',
    raw: zapperTx // Keep the raw data for reference
  };
}

async function startWorker() {
  try {
    const jobQueue = await getQueue();
    if (!jobQueue) {
      throw new Error('Failed to initialize job queue');
    }

    const activeJobs = new Set<string>();

    // Add startup logging
    console.log('Worker process starting...', {
      nodeEnv: process.env.NODE_ENV,
      redisUrl: process.env.KV_REST_API_URL ? 'Set' : 'Not set',
      redisToken: process.env.KV_REST_API_TOKEN ? 'Set' : 'Not set',
      openaiKey: process.env.OPENAI_API_KEY ? 'Set' : 'Not set',
      pid: process.pid,
      startTime: new Date().toISOString()
    });

    // Clean up old jobs on startup
    const TWENTY_MINUTES = 20 * 60 * 1000;
    console.log('Cleaning up old jobs (older than 20 minutes)...');
    await jobQueue.clean(TWENTY_MINUTES, 'wait');
    await jobQueue.clean(TWENTY_MINUTES, 'active');
    await jobQueue.clean(TWENTY_MINUTES, 'failed');
    console.log('Cleanup complete');

    // Process jobs in the queue
    jobQueue.process(async (job: Job<JobData>): Promise<JobResult> => {
      console.log(`Starting to process job ${job.id}`);
      
      // Set job options for long-running jobs
      job.opts.timeout = 1200000; // 20 minutes timeout
      job.opts.removeOnComplete = true; // Remove completed jobs
      job.opts.removeOnFail = false; // Keep failed jobs for debugging
      
      const { address, fid } = job.data;
      const normalizedAddress = address?.toLowerCase();
      
      if (!normalizedAddress) {
        throw new Error('Invalid address provided');
      }

      // Check if job is already being processed
      if (activeJobs.has(normalizedAddress)) {
        console.log(`Job already in progress for ${normalizedAddress}, skipping`);
        // Create an empty result instead of using moveToCompleted
        return {
          status: 'complete',
          analysis: {
            popularTokens: [],
            popularActions: [],
            popularUsers: [],
            otherStories: []
          }
        };
      }
      
      try {
        activeJobs.add(normalizedAddress);
        console.log(`Processing job ${job.id} for address ${normalizedAddress}`);
        
        // Update status to fetching
        await job.progress({
          status: 'fetching',
          step: 1,
          totalSteps: 3
        } as JobProgress);

        // First check if we already have raw transactions
        const rawCacheKey = `wrapped-2024-raw/${normalizedAddress}.json`;
        let transactions = await getFromS3Cache(rawCacheKey) as Transaction[] | null;
        
        // If no cached transactions, fetch from Zapper
        if (!transactions) {
          console.log('Fetching transactions from Zapper...');
          const zapperTransactions = await fetchWithTimeout(
            fetchTransactionsFromZapper(normalizedAddress),
            300000 // 5 minute timeout
          ) as ZapperTransaction[];
          
          if (!zapperTransactions || zapperTransactions.length === 0) {
            console.log('No transactions found for address:', normalizedAddress);
            return {
              status: 'complete',
              analysis: {
                popularTokens: [],
                popularActions: [],
                popularUsers: [],
                otherStories: [{
                  name: "No Activity Found",
                  stat: "0 transactions",
                  description: "We couldn't find any transactions for this address on Base in 2024. This could mean you haven't made any transactions yet, or you might be using a different address.",
                  category: "info"
                }]
              }
            };
          }
          
          // Normalize the transactions
          transactions = zapperTransactions.map(normalizeTransaction);
          
          // Store the normalized transactions in S3
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
          } as JobProgress);

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
        // Instead of throwing, retry the same job
        const attempts = job.attemptsMade;
        if (attempts < 5) { // Max 5 retries
          const delay = Math.min(1000 * Math.pow(2, attempts), 30000); // Exponential backoff
          // Use the proper Bull method to delay the job
          await jobQueue.add(job.data, { 
            delay,
            jobId: job.id,
            attempts: attempts + 1
          } as JobOptions);
          console.log(`Retrying job ${job.id} attempt ${attempts + 1} in ${delay}ms`);
        }
        throw error; // Throw to mark the current job as failed
      } finally {
        activeJobs.delete(normalizedAddress);
      }
    });

    // Set up error handling and automatic restart
    let isShuttingDown = false;
    
    async function restartWorker() {
      if (isShuttingDown) return;
      
      console.log('Attempting to restart worker...');
      try {
        await jobQueue.close();
      } catch (error) {
        console.error('Error closing queue during restart:', error);
      }
      
      // Wait a bit before restarting
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      // Exit and let Railway restart the process
      process.exit(1);
    }

    // Add handlers for fatal errors
    process.on('uncaughtException', async (error) => {
      console.error('Uncaught Exception:', error);
      await restartWorker();
    });

    process.on('unhandledRejection', async (reason, promise) => {
      console.error('Unhandled Rejection at:', promise, 'reason:', reason);
      await restartWorker();
    });

    // Graceful shutdown handlers
    process.on('SIGTERM', async () => {
      console.log('Received SIGTERM signal. Starting graceful shutdown...');
      isShuttingDown = true;
      try {
        await jobQueue.close();
        console.log('Queue closed successfully');
        process.exit(0);
      } catch (error) {
        console.error('Error during shutdown:', error);
        process.exit(1);
      }
    });

    process.on('SIGINT', async () => {
      console.log('Received SIGINT signal. Starting graceful shutdown...');
      isShuttingDown = true;
      try {
        await jobQueue.close();
        console.log('Queue closed successfully');
        process.exit(0);
      } catch (error) {
        console.error('Error during shutdown:', error);
        process.exit(1);
      }
    });

    console.log('Worker ready to process jobs');
  } catch (error) {
    console.error('Failed to start worker:', error);
    process.exit(1);
  }
}

// Helper function to chunk transactions
function chunkTransactions(transactions: Transaction[], size = 200): Transaction[][] {
  const chunks: Transaction[][] = [];
  for (let i = 0; i < transactions.length; i += size) {
    chunks.push(transactions.slice(i, i + size));
  }
  return chunks;
}

// Helper function to process a chunk
async function processChunk(chunk: Transaction[]): Promise<void> {
  // Add your chunk processing logic here
  await new Promise(resolve => setTimeout(resolve, 500)); // Simulate processing time
}

// Start the worker with proper error handling
console.log('Starting worker process...');
startWorker().catch(error => {
  console.error('Critical error starting worker:', error);
  process.exit(1);
}); 