import { Handler } from 'aws-lambda';
import { S3 } from '@aws-sdk/client-s3';
import { OpenAI } from 'openai';

// Initialize S3 client
const s3 = new S3({
  region: 'us-east-2'
});

export interface AnalysisChunkerEvent {
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

export interface AnalysisChunkerResponse {
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

export const handler: Handler<AnalysisChunkerEvent, AnalysisChunkerResponse> = async (event) => {
  try {
    // Get the address from the S3 key (remove prefix and -data.json suffix)
    const key = event.Records[0].s3.object.key;
    const bucket = event.Records[0].s3.bucket.name;
    const address = key.replace('wrapped-2024-raw/', '').replace('-data.json', '');
    const jobId = address;

    console.log(`Starting analysis chunking for jobId: ${jobId}, address: ${address}`);
    await updateJobStatus(bucket, address, 'CHUNKING_TRANSACTIONS');

    // Get the raw data from S3
    const rawDataResponse = await s3.getObject({
      Bucket: process.env.S3_BUCKET!,
      Key: key
    });

    const rawData = JSON.parse(await rawDataResponse.Body!.transformToString());
    const transactions = rawData;

    // Process transactions in chunks
    const chunkSize = 100;
    const chunks = [];
    for (let i = 0; i < transactions.length; i += chunkSize) {
      const chunk = transactions.slice(i, i + chunkSize);
      chunks.push(chunk);
    }

    console.log(`Processing ${chunks.length} chunks for analysis`);

    // Write each chunk to S3
    for (let i = 0; i < chunks.length; i++) {
      const chunkKey = `wrapped-2024-analysis-chunks/${address}-chunk-${i}.json`;
      await s3.putObject({
        Bucket: process.env.S3_BUCKET!,
        Key: chunkKey,
        Body: JSON.stringify(chunks[i]),
        ContentType: 'application/json'
      });
      await updateJobStatus(bucket, address, 'CHUNKING_TRANSACTIONS', `Processed ${i + 1}/${chunks.length} chunks`);
    }

    // Write final marker file
    const finalKey = `wrapped-2024-analysis-chunks/${address}-final.json`;
    await s3.putObject({
      Bucket: process.env.S3_BUCKET!,
      Key: finalKey,
      Body: JSON.stringify({
        jobId,
        address,
        totalChunks: chunks.length,
        chunkKeys: chunks.map((_, i) => `wrapped-2024-analysis-chunks/${address}-chunk-${i}.json`)
      }),
      ContentType: 'application/json'
    });

    await updateJobStatus(bucket, address, 'CHUNKS_READY');

    return {
      status: 'success',
      jobId,
      s3Key: finalKey
    };
  } catch (error) {
    const address = event.Records[0].s3.object.key
      .replace('wrapped-2024-raw/', '')
      .replace('-data.json', '');
    await updateJobStatus(event.Records[0].s3.bucket.name, address, 'ERROR', error instanceof Error ? error.message : 'Unknown error occurred');
    
    console.error('Error in analysis chunker:', error);
    return {
      status: 'error',
      jobId: 'unknown',
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}; 