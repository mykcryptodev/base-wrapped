import { NextRequest, NextResponse } from "next/server";
import { S3, NotFound } from "@aws-sdk/client-s3";

function getFetchingMessage(pollAttempts: number): string {
  if (pollAttempts > 18) {
    return "You can come back later, I'm still fetching your txs...";
  }
  if (pollAttempts > 16) {
    return "Jeez Louise. Ok I'm gonna keep fetching your txs...";
  }
  if (pollAttempts > 14) {
    return "Wow, you've been really active on Base! Still working on fetching all your transactions...";
  }
  if (pollAttempts > 12) {
    return "Anyways that myk.eth guy is pretty cool, huh? Still fetching your txs...";
  }
  if (pollAttempts > 10) {
    return "This is taking longer than usual. You must have been busy on Base!";
  }
  if (pollAttempts > 8) {
    return "Mint anything cool lately?";
  }
  if (pollAttempts > 6) {
    return "While we wait, who did you onboard today?";
  }
  if (pollAttempts > 4) {
    return "Still fetching your transactions... You've done quite a bit on Base!";
  }
  if (pollAttempts > 2) {
    return "We're still working on fetching your transactions...";
  }
  return "Fetching your transaction history...";
}

function getAnalyzingMessage(pollAttempts: number, chunkProgress?: { currentChunk: number, totalChunks: number }): string {
  if (chunkProgress) {
    return `Analyzing transaction batch ${chunkProgress.currentChunk + 1} of ${chunkProgress.totalChunks + 1}...`;
  }
  
  if (pollAttempts > 16) {
    return "You can come back later, I'm still crunching the numbers...";
  }
  if (pollAttempts > 14) {
    return "The numbers are crunching, stay tuned...";
  }
  if (pollAttempts > 10) {
    return "You've been really active on Base! Still analyzing...";
  }
  if (pollAttempts > 8) {
    return "Our AI is fascinated by your transaction history! Still analyzing...";
  }
  if (pollAttempts > 6) {
    return "There's a lot to analyze here! The AI is working hard...";
  }
  if (pollAttempts > 4) {
    return "Still crunching the numbers... You've had an interesting year!";
  }
  if (pollAttempts > 2) {
    return "The AI is carefully analyzing your transactions...";
  }
  return "Analyzing your transactions with AI...";
}

const s3 = new S3({
  region: process.env.AWS_REGION,
});

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const address = searchParams.get("address")?.toLowerCase();
    const pollAttempts = parseInt(searchParams.get("pollAttempts") || "0");

    if (!address) {
      return NextResponse.json(
        { error: "No address provided" },
        { status: 400 }
      );
    }

    // Check for analysis file first
    const finalAnalysisKey = `wrapped-2024-analysis/${address}.json`;
    try {
      const analysisResponse = await s3.getObject({
        Bucket: process.env.S3_BUCKET_NAME!,
        Key: finalAnalysisKey,
      });
      
      const finalAnalysis = JSON.parse(await analysisResponse.Body!.transformToString());
      
      return NextResponse.json({
        status: "complete",
        step: 3,
        totalSteps: 3,
        message: "Analysis complete!",
        lastUpdated: finalAnalysis.completedAt,
        result: finalAnalysis
      });
    } catch (error) {
      // If analysis file doesn't exist, check job status
      if (error instanceof NotFound || (error as Error)?.name === 'NoSuchKey') {
        // Check job status
        const jobStatusKey = `job-status/${address}.json`;
        try {
          const jobStatusResponse = await s3.getObject({
            Bucket: process.env.S3_BUCKET_NAME!,
            Key: jobStatusKey,
          });
          
          const jobStatus = JSON.parse(await jobStatusResponse.Body!.transformToString());
          
          // If there's an error, return it
          if (jobStatus.status === 'ERROR') {
            return NextResponse.json({
              status: "error",
              error: jobStatus.error || "An error occurred",
              lastUpdated: jobStatus.lastUpdated
            });
          }
          
          // Map job status to progress
          let step = 1;
          let message;
          
          if (jobStatus.status === 'TRANSACTIONS_FETCHED' || jobStatus.status === 'CHUNKING_TRANSACTIONS') {
            step = 2;
            message = getAnalyzingMessage(pollAttempts);
          } else if (jobStatus.status === 'CHUNKS_READY' || jobStatus.status === 'CONSOLIDATING_ANALYSIS') {
            step = 3;
            // Try to parse chunk progress from error message
            const chunkMatch = jobStatus.error?.match(/Processed (\d+) of (\d+) chunks/);
            const chunkProgress = chunkMatch ? {
              currentChunk: parseInt(chunkMatch[1]),
              totalChunks: parseInt(chunkMatch[2])
            } : undefined;
            message = getAnalyzingMessage(pollAttempts, chunkProgress);
          } else {
            message = getFetchingMessage(pollAttempts);
          }
          
          return NextResponse.json({
            status: "processing",
            step,
            totalSteps: 3,
            message,
            lastUpdated: jobStatus.lastUpdated
          });
          
        } catch (jobStatusError) {
          console.error("Error checking job status:", jobStatusError);
          // If job status doesn't exist, assume the job is just starting
          return NextResponse.json({
            status: "processing",
            step: 1,
            totalSteps: 3,
            message: getFetchingMessage(pollAttempts),
            lastUpdated: new Date().toISOString()
          });
        }
      }
      
      // If it's some other error fetching the analysis file
      console.error("Error fetching final analysis:", error);
      return NextResponse.json({
        status: "error",
        error: "Failed to fetch analysis"
      }, { status: 500 });
    }
  } catch (error) {
    console.error("Error in job status route:", error);
    return NextResponse.json(
      { error: "Failed to check job status" },
      { status: 500 }
    );
  }
}