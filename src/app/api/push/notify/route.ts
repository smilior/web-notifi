import { NextResponse } from "next/server";
import webpush from "web-push";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const data = searchParams.get("data");
  const title = searchParams.get("title") || "テスト通知";
  const body = searchParams.get("body") || "サーバーからの通知です";
  const url = searchParams.get("url") || null;

  if (!data) {
    return NextResponse.json(
      { error: "Missing ?data= parameter" },
      { status: 400 }
    );
  }

  try {
    const subscription = JSON.parse(
      Buffer.from(data, "base64url").toString("utf-8")
    );

    if (!subscription?.endpoint || !subscription?.keys) {
      return NextResponse.json(
        { error: "Invalid subscription data" },
        { status: 400 }
      );
    }

    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT!.trim(),
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!.trim(),
      process.env.VAPID_PRIVATE_KEY!.trim()
    );

    await webpush.sendNotification(
      subscription as never,
      JSON.stringify({ title, body, url })
    );

    return NextResponse.json({ success: true, title, body });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
