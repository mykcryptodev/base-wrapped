import { NextRequest, NextResponse } from "next/server";
import { S3 } from "@aws-sdk/client-s3";

const s3 = new S3({
  region: process.env.AWS_REGION,
});

export async function POST(request: NextRequest) {
  try {
    const requestJson = await request.json();
    const address = requestJson.address?.toLowerCase();

    if (!address) {
      return NextResponse.json(
        { error: "No address provided" },
        { status: 400 }
      );
    }

    // Create initial job status
    const jobStatusKey = `wrapped-2024-raw/${address}.json`;
    await s3.putObject({
      Bucket: process.env.S3_BUCKET_NAME!,
      Key: jobStatusKey,
      Body: JSON.stringify({
        address,
        transactions: [],
        lastUpdated: new Date().toISOString(),
      }),
      ContentType: "application/json",
    });

    return NextResponse.json({
      status: "success",
      address,
    });
  } catch (error) {
    console.error("Error processing wrapped request:", error);
    return NextResponse.json(
      { error: "Failed to process request" },
      { status: 500 }
    );
  }
} 