import { NextResponse } from "next/server";
import { getLatestSyncRun } from "@/lib/reporting";

// Polled by the dashboard's live progress widget — cheap read of the most
// recent SyncRun, not the sync itself.
export async function GET() {
  const run = await getLatestSyncRun();
  return NextResponse.json({ run });
}
