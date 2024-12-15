import { NextResponse } from 'next/server';
import { getQueue } from '~/lib/queue';
import { isValidApiKey } from '~/utils/api/validate';

export async function GET(
  req: Request,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  { params }: { params: any }
) {
  try {
    const typedParams = params as { jobId: string };
    console.log('Received job status request for job:', typedParams.jobId);

    if (!isValidApiKey(req)) {
      console.log('API key validation failed');
      return NextResponse.json(
        { error: 'Unauthorized - Invalid or missing API key' },
        { status: 401 }
      );
    }
    
    const { jobId } = params as { jobId: string };
    const jobQueue = getQueue();
    const job = await jobQueue.getJob(jobId);
    
    if (!job) {
      console.log('Job not found:', jobId);
      return NextResponse.json(
        { error: 'Job not found' },
        { status: 404 }
      );
    }
    
    const state = await job.getState();
    const progress = await job.progress();
    
    console.log('Job status:', { id: job.id, state, progress });
    
    return NextResponse.json({
      id: job.id,
      state,
      progress,
      data: job.data,
      result: job.returnvalue,
      failedReason: job.failedReason,
    });
  } catch (error) {
    console.error('Error getting job status:', error);
    return NextResponse.json(
      { error: 'Failed to get job status', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
} 