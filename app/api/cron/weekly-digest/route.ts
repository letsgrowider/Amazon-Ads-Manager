import { NextRequest, NextResponse } from "next/server";
import { computeWeeklyDigest, formatDigestText } from "@/lib/digest";

// Scheduled weekly summary — same CRON_SECRET bearer-token guard as
// /api/cron/sync. Posts to Slack when SLACK_WEBHOOK_URL is configured;
// otherwise just returns the computed digest so it's still inspectable
// (e.g. by hitting this from a browser or curl) before a delivery channel
// is wired up.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const digest = await computeWeeklyDigest();
  const text = formatDigestText(digest);

  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  let delivered = false;
  if (webhookUrl) {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    delivered = res.ok;
  }

  return NextResponse.json({ digest, text, delivered });
}
