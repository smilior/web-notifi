import { NextResponse } from "next/server";
import webpush from "web-push";

export async function POST(request: Request) {
  const { title, body, subscription } = await request.json();

  if (!subscription?.endpoint) {
    return NextResponse.json(
      { error: "No subscription provided" },
      { status: 400 }
    );
  }

  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT!,
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
  );

  try {
    await webpush.sendNotification(
      subscription as never,
      JSON.stringify({ title: title || "テスト通知", body: body || "Hello!" })
    );
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Push failed:", err);
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
