import { NextResponse } from "next/server";
import { syncAllAccounts } from "@/lib/sync";

// Manual trigger for the dashboard's "Sync now" button. For unattended
// scheduling, run `npm run sync` (scripts/sync-all.ts) from cron/launchd,
// or GET /api/cron/sync from a scheduler, instead of hitting this by hand.
//
// Fire-and-forget: a sync can take several minutes even in the fast
// (incremental) path, and much longer for a profile's first-ever backfill —
// blocking this request until everything finishes made the button (and any
// caller of this route) hang for that whole time. Poll GET /api/sync-status
// for live progress instead. This still requires a long-lived Node process
// to keep running after the response is sent, which is true for local dev
// and a real server — the same architecture caveat already flagged for a
// serverless host applies here too (the function would be frozen once the
// response returns).
export async function POST() {
  syncAllAccounts().catch((err) => {
    console.error("sync failed:", err);
  });
  return NextResponse.json({ started: true });
}
