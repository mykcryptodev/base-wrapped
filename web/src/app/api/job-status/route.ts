import { NextRequest, NextResponse } from "next/server";
import { S3 } from "@aws-sdk/client-s3";

const s3 = new S3({
  region: process.env.AWS_REGION,
});

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const address = searchParams.get("address");

    if (!address) {
      return NextResponse.json(
        { error: "No address provided" },
        { status: 400 }
      );
    }

    // Check if analysis exists
    const analysisKey = `wrapped-2024-analysis/${address.toLowerCase()}.json`;
    try {
      await s3.headObject({
        Bucket: process.env.S3_BUCKET_NAME!,
        Key: analysisKey,
      });
      return NextResponse.json({
        status: "complete",
        step: 3,
        totalSteps: 3,
        message: "Analysis complete!",
        lastUpdated: new Date().toISOString(),
      });
    } catch (error) {
      // Analysis doesn't exist, continue checking raw data
      console.error("Error checking analysis:", error);
    }

    // Check if raw data exists
    const rawDataKey = `wrapped-2024-raw/${address.toLowerCase()}.json`;
    try {
      await s3.headObject({
        Bucket: process.env.S3_BUCKET_NAME!,
        Key: rawDataKey,
      });
      return NextResponse.json({
        status: "processing",
        step: 2,
        totalSteps: 3,
        message: "Analyzing your transactions...",
        lastUpdated: new Date().toISOString(),
      });
    } catch (error) {
      console.error("Error saving raw data:", error);
      // Raw data doesn't exist, return fetching status
      return NextResponse.json({
        status: "processing",
        step: 1,
        totalSteps: 3,
        message: "Fetching your transactions...",
        lastUpdated: new Date().toISOString(),
      });
    }
  } catch (error) {
    console.error("Error checking job status:", error);
    return NextResponse.json(
      { error: "Failed to check job status" },
      { status: 500 }
    );
  }
}