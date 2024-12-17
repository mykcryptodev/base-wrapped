import { NextResponse } from 'next/server';
import { getQueue } from '~/lib/queue';
import { isValidApiKey } from '~/utils/api/validate';

export async function POST(req: Request) {
  try {
    console.log('Received start-job request');
    
    if (!isValidApiKey(req)) {
      console.log('API key validation failed');
      return NextResponse.json(
        { error: 'Unauthorized - Invalid or missing API key' },
        { status: 401 }
      );
    }

    const { address, fid } = await req.json();
    console.log('Request payload:', { address, fid });

    if (!address) {
      console.log('Missing address in request');
      return NextResponse.json(
        { error: 'Address is required' },
        { status: 400 }
      );
    }

    const normalizedAddress = address?.toLowerCase();
    console.log('Normalized address:', normalizedAddress);

    const jobQueue = getQueue();

    // Check if a job is already in progress
    const existingJobs = await jobQueue.getJobs(['active', 'waiting']);
    console.log('Existing jobs:', existingJobs.length);
    
    const existingJob = existingJobs.find(job => 
      job.data.address?.toLowerCase() === normalizedAddress
    );

    if (existingJob) {
      console.log('Found existing job:', existingJob.id);
      // Get job progress
      const progress = await existingJob.progress();
      return NextResponse.json({
        jobId: existingJob.id,
        status: progress.status,
        progress
      });
    }

    // Start a new job
    console.log('Creating new job for address:', normalizedAddress);
    const job = await jobQueue.add({ 
      address: normalizedAddress,
      fid 
    });
    console.log('Created new job:', job.id);

    // Return initial status
    return NextResponse.json({
      jobId: job.id,
      status: 'fetching',
      progress: {
        status: 'fetching',
        step: 1,
        totalSteps: 3
      }
    });

  } catch (error) {
    console.error('Error in start-job:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 