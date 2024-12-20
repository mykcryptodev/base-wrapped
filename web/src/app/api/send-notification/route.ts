import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { notificationDetailsSchema } from "@farcaster/frame-sdk";
import { sendFrameNotification } from "~/lib/notifs";
import { setUserNotificationDetails } from "~/lib/kv";

const requestSchema = z.object({
  fid: z.number(),
  notificationDetails: notificationDetailsSchema,
});

export async function POST(request: NextRequest) {
  const requestJson = await request.json();
  const requestBody = requestSchema.safeParse(requestJson);

  if (requestBody.success === false) {
    return Response.json(
      { success: false, errors: requestBody.error.errors },
      { status: 400 }
    );
  }

  await setUserNotificationDetails(
    requestBody.data.fid,
    requestBody.data.notificationDetails
  );

  const sendResult = await sendFrameNotification({
    fid: requestBody.data.fid,
    title: "Your Base Wrapped is ready!",
    body: "Tap to view your results",
  });

  if (sendResult.state === "error") {
    return Response.json(
      { success: false, error: sendResult.error },
      { status: 500 }
    );
  }
}
