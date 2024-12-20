import { NextResponse } from 'next/server';
import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";
import { getFromS3Cache, saveToS3Cache } from '~/utils/api/s3';

// Initialize Lambda client
const lambda = new LambdaClient({
  region: "us-east-2",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!
  }
});

export async function POST(request: Request) {
  try {
    const { address, fid } = await request.json();
    const normalizedAddress = address.toLowerCase();
    console.log(`Received request for address: ${normalizedAddress}`);

    // Check if analysis already exists
    const analysisKey = `wrapped-2024-analysis/${normalizedAddress}.json`;
    const analysis = await getFromS3Cache(analysisKey);
    console.log('Analysis cache check result:', { exists: !!analysis, key: analysisKey });

    if (analysis) {
      return NextResponse.json({
        status: 'complete',
        jobId: normalizedAddress,
        step: 3,
        totalSteps: 3,
        message: 'Analysis complete!',
        result: { analysis }
      });
    }

    // Check if a job is already in progress
    const jobStatusKey = `job-status/${normalizedAddress}.json`;
    const existingStatus = await getFromS3Cache(jobStatusKey);
    
    if (existingStatus) {
      console.log('Found existing job status:', existingStatus);
      return NextResponse.json(existingStatus);
    }

    // Start a new job
    const jobStatus = {
      status: 'processing',
      jobId: normalizedAddress,
      step: 1,
      totalSteps: 3,
      message: 'Fetching your transaction history...',
      startedAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString()
    };

    // Save initial job status
    await saveToS3Cache(jobStatusKey, jobStatus);
    console.log('Saved initial job status:', jobStatus);

    // Start the fetch job asynchronously
    await lambda.send(new InvokeCommand({
      FunctionName: process.env.TRANSACTION_FETCHER_LAMBDA!,
      InvocationType: 'Event',
      Payload: JSON.stringify({
        address: normalizedAddress,
        fid,
        jobId: normalizedAddress,
        step: 'fetch'
      })
    }));

    console.log('Job started successfully');
    return NextResponse.json(jobStatus);
  } catch (error) {
    console.error('Error starting job:', error);
    return NextResponse.json(
      { error: 'Failed to start job', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
} 