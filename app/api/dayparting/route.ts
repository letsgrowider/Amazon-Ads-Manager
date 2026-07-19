import { NextResponse } from "next/server";
import { applyDaypartingSchedule } from "@/lib/dayparting";

// Manual trigger for testing/on-demand runs. For unattended scheduling, run
// `npm run dayparting` from cron/launchd instead of hitting this over HTTP.
export async function POST() {
  const results = await applyDaypartingSchedule();
  return NextResponse.json({ results });
}
