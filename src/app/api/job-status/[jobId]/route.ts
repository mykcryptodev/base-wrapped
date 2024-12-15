import { NextRequest, NextResponse } from 'next/server';
import { getQueue } from '~/lib/queue';
import { isValidApiKey } from '~/utils/api/validate';

export async function GET(
  req: NextRequest,
  context: { params: { jobId: string } }
) {
  try {
    console.log('Received job status request for job:', context.params.jobId);

    if (!isValidApiKey(req)) {
      console.log('API key validation failed');
      return NextResponse.json(
        { error: 'Unauthorized - Invalid or missing API key' },
        { status: 401 }
      );
    }
    
    const { jobId } = context.params;
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