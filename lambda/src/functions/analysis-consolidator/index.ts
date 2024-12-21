import { Handler } from 'aws-lambda';
import { S3 } from '@aws-sdk/client-s3';
import { getAnalysisFromOpenAI } from '../../utils/api/openai';

// Initialize S3 client
const s3 = new S3({
  region: 'us-east-2'
});

export interface AnalysisConsolidatorEvent {
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

export interface AnalysisConsolidatorResponse {
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

export const handler: Handler<AnalysisConsolidatorEvent, AnalysisConsolidatorResponse> = async (event) => {
  try {
    // Get the address from the S3 key (remove prefix and -final.json suffix)
    const key = event.Records[0].s3.object.key;
    const bucket = event.Records[0].s3.bucket.name;
    const address = key.replace('wrapped-2024-analysis-chunks/', '').replace('-final.json', '');
    const jobId = address;

    console.log(`Starting analysis consolidation for jobId: ${jobId}, address: ${address}`);
    await updateJobStatus(bucket, address, 'CONSOLIDATING_ANALYSIS');

    // Get the final marker file
    const finalMarkerResponse = await s3.getObject({
      Bucket: process.env.S3_BUCKET!,
      Key: key
    });

    const finalMarker = JSON.parse(await finalMarkerResponse.Body!.transformToString());
    const { chunkKeys } = finalMarker;

    console.log(`Processing ${chunkKeys.length} chunks for consolidation`);

    // Get all chunk data
    const chunks = [];
    for (let i = 0; i < chunkKeys.length; i++) {
      const chunkKey = chunkKeys[i];
      const chunkResponse = await s3.getObject({
        Bucket: process.env.S3_BUCKET!,
        Key: chunkKey
      });
      const chunk = JSON.parse(await chunkResponse.Body!.transformToString());
      chunks.push(chunk);
      await updateJobStatus(bucket, address, 'CONSOLIDATING_ANALYSIS', `Processed ${i + 1}/${chunkKeys.length} chunks`);
    }

    // Consolidate all chunks into one analysis
    const allTransactions = chunks.flat();
    const finalAnalysis = await getAnalysisFromOpenAI(allTransactions);

    // Write final analysis to S3
    const finalAnalysisKey = `wrapped-2024-final/${address}.json`;
    await s3.putObject({
      Bucket: process.env.S3_BUCKET!,
      Key: finalAnalysisKey,
      Body: JSON.stringify({
        jobId,
        address,
        analysis: finalAnalysis,
        completedAt: new Date().toISOString()
      }),
      ContentType: 'application/json'
    });

    await updateJobStatus(bucket, address, 'COMPLETED');
    console.log(`Successfully consolidated analysis for ${address}`);

    return {
      status: 'success',
      jobId,
      s3Key: finalAnalysisKey
    };
  } catch (error) {
    const address = event.Records[0].s3.object.key
      .replace('wrapped-2024-analysis-chunks/', '')
      .replace('-final.json', '');
    await updateJobStatus(event.Records[0].s3.bucket.name, address, 'ERROR', error instanceof Error ? error.message : 'Unknown error occurred');
    
    console.error('Error in analysis consolidator:', error);
    return {
      status: 'error',
      jobId: 'unknown',
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}; 