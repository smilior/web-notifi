import { NextResponse } from "next/server";
import webpush, { type PushSubscription } from "web-push";
import { getSubscriptions } from "../subscribe/route";

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT!,
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
);

export async function POST(request: Request) {
  const { title, body } = await request.json();
  const subscriptions = getSubscriptions();

  if (subscriptions.length === 0) {
    return NextResponse.json(
      { error: "No subscriptions found" },
      { status: 400 }
    );
  }

  const results = await Promise.allSettled(
    subscriptions.map((sub) =>
      webpush.sendNotification(
        sub as unknown as PushSubscription,
        JSON.stringify({ title: title || "テスト通知", body: body || "Hello!" })
      )
    )
  );

  const succeeded = results.filter((r) => r.status === "fulfilled").length;
  const failed = results.filter((r) => r.status === "rejected").length;

  return NextResponse.json({ succeeded, failed, total: subscriptions.length });
}
