import { NextRequest, NextResponse } from "next/server";
import { syncAllAccounts } from "@/lib/sync";

// Scheduled-sync entry point — call this from an external scheduler (local
// cron/launchd, Vercel Cron, GitHub Actions, etc) instead of depending on
// someone remembering to click "Sync now". Guarded by CRON_SECRET as a
// bearer token so the URL alone isn't enough to trigger it.
//
// Note: this awaits the full sync before responding, which can take
// minutes. That's fine for a scheduler with a generous timeout (a local
// cron job, or Vercel Cron on a plan with long function timeouts) but not
// for a short-timeout serverless invocation — same architecture caveat
// already flagged for hosting generally (this app has no job-queue layer
// to hand long-running work off to yet).
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const results = await syncAllAccounts();
  return NextResponse.json({ results });
}
