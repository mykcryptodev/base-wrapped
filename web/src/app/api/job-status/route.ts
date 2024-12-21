import { NextRequest, NextResponse } from "next/server";
import { S3, NotFound } from "@aws-sdk/client-s3";

const s3 = new S3({
  region: process.env.AWS_REGION,
});

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const address = searchParams.get("address")?.toLowerCase();

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
          let message = "Fetching your transactions...";
          
          if (jobStatus.status === 'TRANSACTIONS_FETCHED' || jobStatus.status === 'CHUNKING_TRANSACTIONS') {
            step = 2;
            message = jobStatus.error || "Processing your transactions...";
          } else if (jobStatus.status === 'CHUNKS_READY' || jobStatus.status === 'CONSOLIDATING_ANALYSIS') {
            step = 3;
            message = jobStatus.error || "Analyzing your transactions...";
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
          // If job status doesn't exist, the job hasn't started or failed to start
          return NextResponse.json({
            status: "error",
            error: "Job not found or failed to start"
          }, { status: 404 });
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