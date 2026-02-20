import { NextResponse } from "next/server";

// In-memory store (resets on redeploy — fine for testing)
const subscriptions: PushSubscriptionJSON[] = [];

export function getSubscriptions() {
  return subscriptions;
}

export async function POST(request: Request) {
  const subscription = await request.json();
  // Avoid duplicates
  const exists = subscriptions.some(
    (s) => s.endpoint === subscription.endpoint
  );
  if (!exists) {
    subscriptions.push(subscription);
  }
  console.log(`Subscriptions count: ${subscriptions.length}`);
  return NextResponse.json({ success: true, count: subscriptions.length });
}

export async function GET() {
  return NextResponse.json({ count: subscriptions.length });
}
