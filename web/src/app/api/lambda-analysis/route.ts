import { NextResponse } from 'next/server';
import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";

// Initialize Lambda client
const lambda = new LambdaClient({
  region: "us-east-2",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!
  }
});

// Map steps to Lambda function names
const LAMBDA_FUNCTIONS = {
  fetch: process.env.TRANSACTION_FETCHER_LAMBDA!,
  chunk: process.env.ANALYSIS_CHUNKER_LAMBDA!,
  consolidate: process.env.ANALYSIS_CONSOLIDATOR_LAMBDA!
};

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { address, step, jobId, fid, chunkProgress } = body;

    console.log(`Processing ${step} job:`, { jobId, address, chunkProgress });

    // Check if we have the required AWS credentials
    if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
      console.error('Missing AWS credentials');
      return NextResponse.json({ error: 'AWS credentials not configured' }, { status: 500 });
    }

    // Check if we have the Lambda function name
    const functionName = LAMBDA_FUNCTIONS[step as keyof typeof LAMBDA_FUNCTIONS];
    if (!functionName) {
      console.error(`No Lambda function configured for step: ${step}`);
      return NextResponse.json({ error: 'Lambda function not configured' }, { status: 500 });
    }

    console.log(`Invoking Lambda function: ${functionName}`);

    // Invoke the appropriate Lambda function
    const response = await lambda.send(new InvokeCommand({
      FunctionName: functionName,
      Payload: JSON.stringify({
        address,
        fid,
        jobId,
        ...(chunkProgress && { chunkProgress })
      })
    }));

    if (!response.Payload) {
      throw new Error(`No response from Lambda function for step ${step}`);
    }

    const result = JSON.parse(Buffer.from(response.Payload).toString());
    console.log(`Lambda response for step ${step}:`, result);

    if (result.error) {
      throw new Error(result.error);
    }

    // If this was the fetch step and we have chunks to process, invoke chunk jobs
    if (step === 'fetch' && result.chunks) {
      console.log(`Starting ${result.chunks.length} chunk jobs`);
      // Start chunk jobs
      for (let i = 0; i < result.chunks.length; i++) {
        await lambda.send(new InvokeCommand({
          FunctionName: LAMBDA_FUNCTIONS.chunk,
          InvocationType: 'Event', // Async invocation
          Payload: JSON.stringify({
            address,
            fid,
            jobId: `${jobId}-chunk-${i}`,
            chunkProgress: {
              currentChunk: i,
              totalChunks: result.chunks.length
            }
          })
        }));
      }
    }

    // If this was the last chunk, invoke the consolidate job
    if (step === 'chunk' && chunkProgress?.currentChunk === chunkProgress?.totalChunks - 1) {
      console.log('Starting consolidate job');
      await lambda.send(new InvokeCommand({
        FunctionName: LAMBDA_FUNCTIONS.consolidate,
        InvocationType: 'Event', // Async invocation
        Payload: JSON.stringify({
          address,
          fid,
          jobId: `${jobId.split('-chunk-')[0]}-consolidate`
        })
      }));
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error processing Lambda job:', error);
    return NextResponse.json(
      { error: 'Failed to process Lambda job', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
} 