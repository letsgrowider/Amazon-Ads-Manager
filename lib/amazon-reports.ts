import { gunzipSync } from "node:zlib";
import { fetchWithRetry, type AmazonAdsClient, type CreateReportRequest, type ReportStatus } from "@/lib/amazon-ads";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Reports are generated async by Amazon; poll until COMPLETED/FAILED.
// Small (seed-data-sized) accounts finish in well under 2 minutes, but a
// real account with ~2,000 campaigns/13,000 keywords was still PENDING
// after a full 30-minute poll (120 attempts) for the search-terms report
// specifically — that's the heaviest report this account generates.
// 60 minutes is a real, tested-for ceiling, not a guess.
export async function pollReport(
  client: AmazonAdsClient,
  reportId: string,
  { intervalMs = 15000, maxAttempts = 240 }: { intervalMs?: number; maxAttempts?: number } = {}
): Promise<ReportStatus> {
  let lastError: Error | undefined;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const status = await client.getReport(reportId);
      lastError = undefined;
      if (status.status === "COMPLETED" || status.status === "FAILED") {
        return status;
      }
    } catch (err) {
      // fetchWithRetry already retries within a single call — a failure here
      // survived that. Over a poll that can run up to an hour, a DNS/network
      // blip outlasting those retries has been observed live; don't let one
      // bad attempt discard the rest of the poll budget.
      lastError = err as Error;
    }
    await sleep(intervalMs);
  }
  if (lastError) throw lastError;
  throw new Error(`Report ${reportId} did not complete after ${maxAttempts} attempts`);
}

// Report body is a gzipped file at a pre-signed URL (no auth headers
// needed). Verified against real downloads: despite "GZIP_JSON" in the
// name, the content isn't reliably JSON-lines (one object per line) — it
// can be a single whole-file JSON array with no newlines. Blindly
// splitting on "\n" then parsing each "line" silently produced one row
// containing the whole array (as a non-object with no expected fields)
// instead of throwing, which is why matched-row counts came back as 0
// with no error. Try whole-file JSON first, fall back to JSON-lines.
export async function downloadReport(url: string): Promise<Record<string, unknown>[]> {
  const res = await fetchWithRetry(url, {});
  if (!res.ok) {
    throw new Error(`Report download failed: ${res.status}`);
  }
  const gzipped = Buffer.from(await res.arrayBuffer());
  const text = gunzipSync(gzipped).toString("utf-8");

  const trimmed = text.trim();
  if (trimmed.startsWith("[")) {
    return JSON.parse(trimmed);
  }
  return trimmed
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line));
}

export async function createAndDownloadReport(
  client: AmazonAdsClient,
  body: CreateReportRequest
): Promise<Record<string, unknown>[]> {
  const { reportId } = await client.createReport(body);
  const status = await pollReport(client, reportId);
  if (status.status === "FAILED") {
    throw new Error(`Report ${reportId} failed: ${status.failureReason ?? "unknown reason"}`);
  }
  // Field name for the download link isn't consistent across Amazon's own
  // examples ("url" vs "location") — accept either.
  const downloadUrl = status.url ?? status.location;
  if (!downloadUrl) {
    throw new Error(`Report ${reportId} completed but no download URL was returned`);
  }
  return downloadReport(downloadUrl);
}
