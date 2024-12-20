import { Handler } from 'aws-lambda';
import { S3 } from '@aws-sdk/client-s3';
import { fetchTransactionsFromZapper } from '../../utils/api/zapper';

// Initialize S3 client
const s3 = new S3({
  region: 'us-east-2'
});

export interface TransactionFetcherEvent {
  address: string;
  jobId: string;
}

export interface TransactionFetcherResponse {
  status: 'success' | 'error';
  jobId: string;
  s3Key?: string;
  error?: string;
}

export const handler: Handler<TransactionFetcherEvent, TransactionFetcherResponse> = async (event) => {
  const { address, jobId } = event;
  const s3Key = `wrapped-2024-raw/${address.toLowerCase()}.json`;

  try {
    console.log(`Starting transaction fetch for address: ${address}, jobId: ${jobId}`);
    
    // Fetch transactions from Zapper
    const transactions = await fetchTransactionsFromZapper(address);
    
    if (!transactions || transactions.length === 0) {
      return {
        status: 'success',
        jobId,
        s3Key,
        error: 'No transactions found'
      };
    }

    // Store transactions in S3
    await s3.putObject({
      Bucket: process.env.S3_BUCKET!,
      Key: s3Key,
      Body: JSON.stringify(transactions),
      ContentType: 'application/json'
    });

    console.log(`Successfully stored transactions for ${address} in S3`);

    return {
      status: 'success',
      jobId,
      s3Key
    };
  } catch (error) {
    console.error('Error in transaction fetcher:', error);
    return {
      status: 'error',
      jobId,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}; 