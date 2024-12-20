import { NextResponse } from 'next/server';
import { getFromS3Cache, saveToS3Cache } from '~/utils/api/s3';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get('jobId')?.toLowerCase();
    console.log('Received job status request for jobId:', jobId);

    if (!jobId) {
      return NextResponse.json({ error: 'Job ID is required' }, { status: 400 });
    }

    // Parse job status from job ID (which is now the address)
    const [baseAddress, step] = jobId.split('-');
    const isChunkJob = step?.startsWith('chunk');
    const isConsolidateJob = step === 'consolidate';
    console.log('Job type:', { isChunkJob, isConsolidateJob, baseAddress, step });

    // Check if the final analysis exists first
    const analysisKey = `wrapped-2024-analysis/${baseAddress}.json`;
    const analysis = await getFromS3Cache(analysisKey);
    console.log('Analysis check result:', { exists: !!analysis, key: analysisKey });
    if (analysis) {
      const completedStatus = {
        status: 'complete',
        jobId: baseAddress,
        step: 3,
        totalSteps: 3,
        message: 'Analysis complete!',
        result: { analysis },
        completedAt: new Date().toISOString(),
        lastUpdated: new Date().toISOString()
      };
      await saveToS3Cache(`job-status/${baseAddress}.json`, completedStatus);
      return NextResponse.json(completedStatus);
    }

    // Get current job status
    const jobStatusKey = `job-status/${baseAddress}.json`;
    const currentStatus = await getFromS3Cache(jobStatusKey);
    console.log('Current job status:', currentStatus);

    // Check if raw transactions exist
    if (!isChunkJob && !isConsolidateJob) {
      try {
        const rawKey = `wrapped-2024-raw/${baseAddress}.json`;
        const rawData = await getFromS3Cache(rawKey);
        console.log('Raw data check result:', { exists: !!rawData, key: rawKey });
        
        if (rawData) {
          // Check for chunk files
          const chunkKey = `wrapped-2024-analysis-chunks/${baseAddress}-0.json`;
          const chunkData = await getFromS3Cache(chunkKey);
          console.log('Chunk data check result:', { exists: !!chunkData, key: chunkKey });

          if (chunkData && (!currentStatus || currentStatus.step !== 3)) {
            // Update status to consolidating if chunk exists
            const consolidatingStatus = {
              status: 'processing',
              jobId: baseAddress,
              step: 3,
              totalSteps: 3,
              message: 'Consolidating results...',
              lastUpdated: new Date().toISOString()
            };
            await saveToS3Cache(jobStatusKey, consolidatingStatus);
            return NextResponse.json(consolidatingStatus);
          } else if (!currentStatus || currentStatus.step !== 2) {
            // Update status to analyzing if raw data exists but no chunks
            const analyzingStatus = {
              status: 'processing',
              jobId: baseAddress,
              step: 2,
              totalSteps: 3,
              message: 'Analyzing your transactions...',
              lastUpdated: new Date().toISOString()
            };
            await saveToS3Cache(jobStatusKey, analyzingStatus);
            return NextResponse.json(analyzingStatus);
          }
        } else if (!currentStatus || currentStatus.step !== 1) {
          // Create initial fetching status if no raw data exists
          const fetchingStatus = {
            status: 'processing',
            jobId: baseAddress,
            step: 1,
            totalSteps: 3,
            message: 'Fetching your transaction history...',
            lastUpdated: new Date().toISOString()
          };
          await saveToS3Cache(jobStatusKey, fetchingStatus);
          return NextResponse.json(fetchingStatus);
        }
      } catch (error) {
        console.error('Error checking data files:', error);
      }
    }

    // Return current status if no updates
    if (currentStatus) {
      return NextResponse.json(currentStatus);
    }

    // If no status exists, return a generic processing status
    const status = {
      jobId: baseAddress,
      status: 'processing',
      step: isConsolidateJob ? 3 : isChunkJob ? 2 : 1,
      totalSteps: 3,
      message: isConsolidateJob ? 'Consolidating results...' : 
               isChunkJob ? 'Analyzing your transactions...' : 
               'Fetching your transaction history...',
      progress: isChunkJob ? {
        currentChunk: parseInt(step.split('-')[1]),
        totalChunks: 1
      } : undefined,
      lastUpdated: new Date().toISOString()
    };

    console.log('Returning job status:', status);
    await saveToS3Cache(jobStatusKey, status);
    return NextResponse.json(status);
  } catch (error) {
    console.error('Error checking job status:', error);
    return NextResponse.json(
      { error: 'Failed to check job status', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}