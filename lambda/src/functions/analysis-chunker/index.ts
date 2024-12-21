import { Handler } from 'aws-lambda';
import { S3 } from '@aws-sdk/client-s3';
import { getAnalysisFromOpenAI } from '../../utils/api/openai';

const s3 = new S3({
  region: 'us-east-2'
});

export interface AnalysisChunkerEvent {
  Records: [{
    s3: {
      bucket: { name: string };
      object: { key: string };
    };
  }];
}

export interface AnalysisChunkerResponse {
  status: 'success' | 'error';
  jobId: string;
  chunkResults?: string[];  // S3 keys for chunk results
  error?: string;
}

// Function to chunk transactions
function chunkTransactions(transactions: unknown[], chunkSize = 200) {
  const chunks = [];
  for (let i = 0; i < transactions.length; i += chunkSize) {
    chunks.push(transactions.slice(i, i + chunkSize));
  }
  return chunks;
}

export const handler: Handler<AnalysisChunkerEvent, AnalysisChunkerResponse> = async (event) => {
  try {
    // Get raw transactions file info from S3 event
    const bucket = event.Records[0].s3.bucket.name;
    const rawTransactionsS3Key = event.Records[0].s3.object.key;
    
    // Extract address from the key (format: wrapped-2024-raw/{address}.json)
    const address = rawTransactionsS3Key.split('/')[1].replace('.json', '');
    const jobId = address; // Using address as job ID
    
    console.log(`Starting analysis chunking for jobId: ${jobId}, address: ${address}`);

    // Get raw transactions from S3
    const rawData = await s3.getObject({
      Bucket: bucket,
      Key: rawTransactionsS3Key
    });

    const transactions = JSON.parse(await rawData.Body!.transformToString());
    const chunks = chunkTransactions(transactions, 200);
    const chunkResults: string[] = [];

    console.log(`Processing ${chunks.length} chunks for analysis`);

    // Process each chunk with OpenAI
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const isLastChunk = i === chunks.length - 1;
      
      // Regular chunk file
      if (!isLastChunk) {
        const chunkKey = `wrapped-2024-analysis-chunks/${address.toLowerCase()}-${i}.json`;
        const analysis = await getAnalysisFromOpenAI(chunk);
        
        await s3.putObject({
          Bucket: bucket,
          Key: chunkKey,
          Body: JSON.stringify(analysis),
          ContentType: 'application/json'
        });
        
        chunkResults.push(chunkKey);
        console.log(`Completed analysis for chunk ${i + 1}/${chunks.length}`);
      } 
      // Last chunk becomes the final marker
      else {
        const finalKey = `wrapped-2024-analysis-chunks/${address.toLowerCase()}-final.json`;
        const analysis = await getAnalysisFromOpenAI(chunk);
        
        await s3.putObject({
          Bucket: bucket,
          Key: finalKey,
          Body: JSON.stringify({
            jobId,
            address: address.toLowerCase(),
            totalChunks: chunks.length,
            chunkKeys: [...chunkResults, finalKey],
            completedAt: new Date().toISOString(),
            analysis
          }),
          ContentType: 'application/json'
        });
        
        chunkResults.push(finalKey);
        console.log(`Completed final chunk and wrote marker`);
      }
    }

    return {
      status: 'success',
      jobId,
      chunkResults
    };
  } catch (error) {
    console.error('Error in analysis chunker:', error);
    return {
      status: 'error',
      jobId: 'unknown',
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}; 