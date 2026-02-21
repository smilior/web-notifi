import { NextResponse } from "next/server";
import webpush from "web-push";

export async function POST(request: Request) {
  try {
    const json = await request.json();
    console.log("Received:", JSON.stringify(json).slice(0, 500));
    const { title, body, subscription } = json;

    if (!subscription?.endpoint || !subscription?.keys) {
      return NextResponse.json(
        { error: "Invalid subscription", received: JSON.stringify(json).slice(0, 200) },
        { status: 400 }
      );
    }

    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT!,
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
      process.env.VAPID_PRIVATE_KEY!
    );

    await webpush.sendNotification(
      subscription as never,
      JSON.stringify({ title: title || "テスト通知", body: body || "Hello!" })
    );

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    console.error("Push failed:", message, stack);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
