import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  const result = await db.execute(
    "SELECT id, url, dir, created_at FROM sessions ORDER BY created_at DESC LIMIT 20"
  );
  return NextResponse.json(result.rows);
}
