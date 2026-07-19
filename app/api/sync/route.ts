import { NextResponse } from "next/server";
import { syncAllAccounts } from "@/lib/sync";

const DISPATCH_REPO = "letsgrowider/Amazon-Ads-Manager";
const DISPATCH_WORKFLOW = "sync.yml";

// Manual trigger for the dashboard's "Sync now" button.
//
// On a long-lived Node process (local dev, a real server) fire-and-forget
// works fine: the process keeps running after the response is sent. On
// serverless (Vercel) the function freezes the instant the response goes
// out, silently killing the in-flight sync — so when GITHUB_DISPATCH_TOKEN
// is configured, dispatch the same GitHub Actions workflow the cron uses
// instead of running the sync in this request's process.
export async function POST() {
  const token = process.env.GITHUB_DISPATCH_TOKEN;
  if (token) {
    const res = await fetch(
      `https://api.github.com/repos/${DISPATCH_REPO}/actions/workflows/${DISPATCH_WORKFLOW}/dispatches`,
      {
        method: "POST",
        headers: {
          Authorization: `token ${token}`,
          Accept: "application/vnd.github+json",
        },
        body: JSON.stringify({ ref: "main" }),
      }
    );
    if (!res.ok) {
      return NextResponse.json({ error: await res.text() }, { status: 502 });
    }
    return NextResponse.json({ started: true, via: "github-actions" });
  }

  syncAllAccounts().catch((err) => {
    console.error("sync failed:", err);
  });
  return NextResponse.json({ started: true, via: "in-process" });
}
