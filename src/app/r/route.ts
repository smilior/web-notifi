import { redirect } from "next/navigation";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const to = searchParams.get("to");

  if (to && to.startsWith("https://claude.ai/code/session_")) {
    redirect(to);
  }

  redirect("/");
}
