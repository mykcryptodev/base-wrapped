import { analysisQueue } from "~/lib/queues/analysis-queue";
import { getFromS3Cache } from '~/utils/api/s3';

export async function GET(
  request: Request,
  props: unknown,
): Promise<Response> {
  // @ts-expect-error any
  const { jobId } = props.params as { jobId: string };
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