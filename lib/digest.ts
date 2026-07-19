import { getAccountSummary } from "@/lib/reporting";
import { getProfileLeaderboard } from "@/lib/gamification";
import { resolveDateRange, previousPeriod, percentChange } from "@/lib/date-range";

const TOP_MOVERS_COUNT = 3;

export interface WeeklyDigest {
  rangeLabel: string;
  spend: number;
  spendChangePct: number | null;
  acos: number;
  acosChangePct: number | null;
  alertCount: number;
  improved: { label: string; improvement: number }[];
  worsened: { label: string; improvement: number }[];
}

// One week's spend/ACOS delta plus the accounts that moved the most in
// either direction — the numbers a manager actually wants without opening
// the dashboard. Reuses the same summary/leaderboard math the dashboard
// itself uses, so this is never a second source of truth.
export async function computeWeeklyDigest(): Promise<WeeklyDigest> {
  const range = resolveDateRange({ days: "7" });
  const prevRange = previousPeriod(range);

  const summary = await getAccountSummary(range);
  const prevSummary = await getAccountSummary(prevRange);
  const leaderboard = await getProfileLeaderboard(range);

  const sorted = [...leaderboard].sort((a, b) => b.improvement - a.improvement);
  const improved = sorted.filter((e) => e.improvement > 0).slice(0, TOP_MOVERS_COUNT);
  const worsened = sorted
    .filter((e) => e.improvement < 0)
    .slice(-TOP_MOVERS_COUNT)
    .reverse();

  return {
    rangeLabel: range.label,
    spend: summary.spend,
    spendChangePct: percentChange(summary.spend, prevSummary.spend),
    acos: summary.acos,
    acosChangePct: percentChange(summary.acos, prevSummary.acos),
    alertCount: summary.alerts.length,
    improved: improved.map((e) => ({ label: e.label, improvement: e.improvement })),
    worsened: worsened.map((e) => ({ label: e.label, improvement: e.improvement })),
  };
}

function formatPct(pct: number | null): string {
  if (pct === null) return "n/a";
  return `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`;
}

export function formatDigestText(digest: WeeklyDigest): string {
  const lines = [
    `RankWider weekly digest — ${digest.rangeLabel}`,
    ``,
    `Spend: ${digest.spend.toFixed(2)} (${formatPct(digest.spendChangePct)} vs prior week)`,
    `ACOS: ${digest.acos.toFixed(1)}% (${formatPct(digest.acosChangePct)} vs prior week)`,
    `Campaigns currently alerted: ${digest.alertCount}`,
  ];

  if (digest.improved.length > 0) {
    lines.push(``, `Most improved ACOS:`);
    for (const e of digest.improved) lines.push(`  ${e.label}: -${e.improvement.toFixed(1)}pp`);
  }
  if (digest.worsened.length > 0) {
    lines.push(``, `Most worsened ACOS:`);
    for (const e of digest.worsened) lines.push(`  ${e.label}: +${Math.abs(e.improvement).toFixed(1)}pp`);
  }

  return lines.join("\n");
}
