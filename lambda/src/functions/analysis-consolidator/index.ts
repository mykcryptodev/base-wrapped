import { Handler } from 'aws-lambda';
import { S3 } from '@aws-sdk/client-s3';
import OpenAI from 'openai';

const s3 = new S3({
  region: 'us-east-2'
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

export interface AnalysisConsolidatorEvent {
  Records: [{
    s3: {
      bucket: { name: string };
      object: { key: string };
    };
  }];
}

export interface AnalysisConsolidatorResponse {
  status: 'success' | 'error';
  jobId: string;
  finalAnalysisKey?: string;
  error?: string;
}

export const handler: Handler<AnalysisConsolidatorEvent, AnalysisConsolidatorResponse> = async (event) => {
  try {
    // Get the final marker file info from S3 event
    const bucket = event.Records[0].s3.bucket.name;
    const finalChunkKey = event.Records[0].s3.object.key;
    
    console.log('Processing final chunk:', finalChunkKey);

    // Read the final chunk file which contains metadata and the last chunk's analysis
    const finalChunkData = await s3.getObject({
      Bucket: bucket,
      Key: finalChunkKey
    });
    
    const { jobId, address, chunkKeys, analysis: lastChunkAnalysis } = JSON.parse(
      await finalChunkData.Body!.transformToString()
    );
    
    const finalAnalysisKey = `wrapped-2024-analysis/${address.toLowerCase()}.json`;
    console.log(`Starting analysis consolidation for jobId: ${jobId}, address: ${address}`);

    // Fetch all previous chunk results from S3 (excluding the final chunk)
    const previousChunkResults = await Promise.all(
      chunkKeys.slice(0, -1).map(async (key: string) => {
        const data = await s3.getObject({
          Bucket: bucket,
          Key: key
        });
        return JSON.parse(await data.Body!.transformToString());
      })
    );

    // Combine all chunk results including the last chunk's analysis
    const combinedAnalysis = [...previousChunkResults, lastChunkAnalysis].reduce((acc, curr) => {
      ['popularTokens', 'popularActions', 'popularUsers', 'otherStories'].forEach(category => {
        if (curr[category]) {
          if (!acc[category]) acc[category] = [];
          acc[category] = [...acc[category], ...curr[category]];
        }
      });
      return acc;
    }, {} as Record<string, unknown[]>);

    // Create a new thread for final consolidation
    const thread = await openai.beta.threads.create();

    // Send combined analysis for final consolidation
    await openai.beta.threads.messages.create(thread.id, {
      role: "user",
      content: `Please provide a final consolidated analysis, removing any duplicates and keeping only the most significant items in each category. Here's all the data: ${JSON.stringify(combinedAnalysis)}`
    });

    const run = await openai.beta.threads.runs.create(thread.id, {
      assistant_id: process.env.OPENAI_ASSISTANT_ID!,
    });

    // Wait for completion
    let runStatus = await openai.beta.threads.runs.retrieve(thread.id, run.id);
    while (runStatus.status !== 'completed') {
      if (runStatus.status === 'failed') {
        throw new Error('Final analysis run failed');
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
      runStatus = await openai.beta.threads.runs.retrieve(thread.id, run.id);
    }

    // Get final analysis
    const messages = await openai.beta.threads.messages.list(thread.id);
    const finalMessage = messages.data[0];
    const finalAnalysis = JSON.parse(
      finalMessage.content[0].type === 'text' ? finalMessage.content[0].text.value : '{}'
    );

    // Store final analysis in S3
    await s3.putObject({
      Bucket: bucket,
      Key: finalAnalysisKey,
      Body: JSON.stringify(finalAnalysis),
      ContentType: 'application/json'
    });

    // Clean up the thread
    await openai.beta.threads.del(thread.id);

    return {
      status: 'success',
      jobId,
      finalAnalysisKey
    };
  } catch (error) {
    console.error('Error in analysis consolidator:', error);
    return {
      status: 'error',
      jobId: 'unknown',
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}; 