import { getUserNotificationDetails } from "./kv";

type SendNotificationResult =
  | { state: "success" }
  | { state: "error"; error: string }
  | { state: "rate_limit" };

export async function sendFrameNotification({
  fid,
  title,
  body,
}: {
  fid: number;
  title: string;
  body: string;
}): Promise<SendNotificationResult> {
  const details = await getUserNotificationDetails(fid);
  if (!details) {
    return { state: "error", error: "No notification details found" };
  }

  try {
    const response = await fetch(details.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        notificationId: `${fid}-${Date.now()}`,
        title,
        body,
        targetUrl: process.env.NEXT_PUBLIC_HOST,
        tokens: [details.token],
      }),
    });

    const data = await response.json();

    if (data.result.successfulTokens.includes(details.token)) {
      return { state: "success" };
    } else if (data.result.rateLimitedTokens.includes(details.token)) {
      return { state: "rate_limit" };
    } else {
      return {
        state: "error",
        error: "Failed to send notification",
      };
    }
  } catch (error) {
    return {
      state: "error",
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
