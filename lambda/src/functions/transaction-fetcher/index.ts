import { Handler } from 'aws-lambda';
import { S3 } from '@aws-sdk/client-s3';
import { fetchTransactionsFromZapper } from '../../utils/api/zapper';

// Initialize S3 client
const s3 = new S3({
  region: 'us-east-2'
});

export interface TransactionFetcherEvent {
  Records: {
    s3: {
      bucket: {
        name: string;
      };
      object: {
        key: string;
      };
    };
  }[];
}

export interface TransactionFetcherResponse {
  status: 'success' | 'error';
  jobId: string;
  s3Key?: string;
  error?: string;
}

async function updateJobStatus(bucket: string, address: string, status: string, error?: string) {
  const jobStatusKey = `job-status/${address}.json`;
  await s3.putObject({
    Bucket: bucket,
    Key: jobStatusKey,
    Body: JSON.stringify({
      address,
      jobId: address,
      status,
      error,
      lastUpdated: new Date().toISOString(),
    }),
    ContentType: 'application/json'
  });
}

export const handler: Handler<TransactionFetcherEvent, TransactionFetcherResponse> = async (event) => {
  try {
    // Get the address from the S3 key (remove prefix and -init.json suffix)
    const key = event.Records[0].s3.object.key;
    const bucket = event.Records[0].s3.bucket.name;
    const address = key.replace('wrapped-2024-raw/', '').replace('-init.json', '');
    const jobId = address;
    const s3Key = `wrapped-2024-raw/${address}-data.json`;

    console.log(`Starting transaction fetch for address: ${address}, jobId: ${jobId}`);
    
    await updateJobStatus(bucket, address, 'FETCHING_TRANSACTIONS');
    
    // Fetch transactions from Zapper
    const transactions = await fetchTransactionsFromZapper(address);
    
    if (!transactions || transactions.length === 0) {
      await updateJobStatus(bucket, address, 'ERROR', 'No transactions found');
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

    await updateJobStatus(bucket, address, 'TRANSACTIONS_FETCHED');
    console.log(`Successfully stored transactions for ${address} in S3`);

    return {
      status: 'success',
      jobId,
      s3Key
    };
  } catch (error) {
    const address = event.Records[0].s3.object.key
      .replace('wrapped-2024-raw/', '')
      .replace('-init.json', '');
    await updateJobStatus(event.Records[0].s3.bucket.name, address, 'ERROR', error instanceof Error ? error.message : 'Unknown error occurred');
    
    console.error('Error in transaction fetcher:', error);
    return {
      status: 'error',
      jobId: 'unknown',
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}; 