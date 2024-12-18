import { NextRequest } from 'next/server';
import { analysisQueue } from "~/lib/queues/analysis-queue";
import { getFromS3Cache } from '~/utils/api/s3';

export async function GET(request: NextRequest) {
  const jobId = request.nextUrl.searchParams.get('jobId');
  
  if (!jobId) {
    return Response.json({ error: 'Missing jobId parameter' }, { status: 400 });
  }

  console.log("Received job status request for job:", jobId);

  try {
    const address = jobId.toLowerCase();
    const analysisCacheKey = `wrapped-2024-analysis/${address}.json`;
    
    // Check if analysis exists in cache
    const analysisResult = await getFromS3Cache(analysisCacheKey);
    
    if (analysisResult) {
      return Response.json(analysisResult);
    }

    // Check if job is still pending
    const job = await analysisQueue.getById(address);
    
    if (job) {
      return Response.json({ status: 'processing' });
    }

    return Response.json({ status: 'not_found' }, { status: 404 });
  } catch (error) {
    console.error('Failed to get job status:', error);
    return Response.json(
      { error: 'Failed to get analysis status' },
      { status: 500 }
    );
  }
}