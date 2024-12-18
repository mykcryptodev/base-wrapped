import { Queue } from "quirrel/next";
import { fetchTransactionsFromZapper } from '~/utils/api/zapper.js';
import { getFromS3Cache, saveToS3Cache } from '~/utils/api/s3';
import { getAnalysisFromOpenAI } from '~/utils/api/openai';
import { getUserNotificationDetails } from "~/lib/kv";
import { sendFrameNotification } from "~/lib/notifs";

// Define types
interface JobData {
  address: string;
  fid?: number;
}

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

interface ZapperTransaction {
  node: {
    key: string;
    timestamp: number;
    transaction: {
      toUser: { displayName: { value: string } };
      fromUser: { displayName: { value: string } };
      value: string;
      hash?: string;
    };
    app: {
      tags: string[];
      app: {
        imgUrl: string;
        category: { name: string; description: string };
      };
    };
    interpretation: { processedDescription: string };
    interpreter: { category: string };
  };
}

// Helper function to normalize transactions
function normalizeTransaction(zapperTx: ZapperTransaction): Transaction {
  return {
    hash: zapperTx.node.transaction.hash || zapperTx.node.key,
    timestamp: zapperTx.node.timestamp,
    description: zapperTx.node.interpretation.processedDescription || '',
    category: zapperTx.node.interpreter.category || '',
    tags: zapperTx.node.app?.tags || [],
    fromUser: zapperTx.node.transaction.fromUser?.displayName?.value || '',
    toUser: zapperTx.node.transaction.toUser?.displayName?.value || '',
    value: zapperTx.node.transaction.value || '0',
    raw: zapperTx
  };
}

// Create the queue
export default Queue(
  "api/queues/analysis",
  async (job: JobData): Promise<void> => {
    const { address, fid } = job;
    const normalizedAddress = address?.toLowerCase();

    if (!normalizedAddress) {
      throw new Error('Invalid address provided');
    }

    try {
      console.log(`Processing analysis for address ${normalizedAddress}`);
      
      const analysisCacheKey = `wrapped-2024-analysis/${normalizedAddress}.json`;
      const rawCacheKey = `wrapped-2024-raw/${normalizedAddress}.json`;
      let transactions = await getFromS3Cache(rawCacheKey) as Transaction[] | null;

      if (!transactions) {
        console.log('Fetching transactions from Zapper...');
        const zapperTransactions = await fetchTransactionsFromZapper(normalizedAddress) as ZapperTransaction[];
        
        if (!zapperTransactions || zapperTransactions.length === 0) {
          await saveToS3Cache(analysisCacheKey, {
            status: 'complete',
            analysis: {
              popularTokens: [],
              popularActions: [],
              popularUsers: [],
              otherStories: [{
                name: "No Activity Found",
                stat: "0 transactions",
                description: "We couldn't find any transactions for this address on Base in 2024.",
                category: "info"
              }]
            }
          });
          return;
        }

        transactions = zapperTransactions.map(normalizeTransaction);
        await saveToS3Cache(rawCacheKey, transactions);
      }

      // Get analysis from OpenAI
      const analysis = await getAnalysisFromOpenAI(transactions, normalizedAddress);

      if (!analysis) {
        throw new Error('OpenAI analysis returned null');
      }

      // Store the analysis in S3
      await saveToS3Cache(analysisCacheKey, { status: 'complete', analysis });

      // Send notification if user has enabled them
      if (fid) {
        const notificationDetails = await getUserNotificationDetails(fid);
        if (notificationDetails) {
          await sendFrameNotification({
            fid,
            title: "Analysis Complete! 🎉",
            body: "Your Base Wrapped analysis is ready to view",
          });
        }
      }

      console.log(`Analysis completed for address ${normalizedAddress}`);
    } catch (error) {
      console.error(`Error processing job for address ${normalizedAddress}:`, error);
      throw error;
    }
  },
  {
    retry: ['1min', '5min', '10min', '30min', '1h'],
    exclusive: true,
  }
); 