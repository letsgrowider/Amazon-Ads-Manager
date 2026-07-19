import { prisma } from "@/lib/db";
import {
  getAccountSummary,
  getBudgetConstrainedCampaigns,
  ALERT_ACOS_THRESHOLD,
  ALERT_MIN_SPEND,
} from "@/lib/reporting";
import { resolveDateRange, previousPeriod, type DateRange } from "@/lib/date-range";

// Estimated $ saved from bid cuts you've actually made. For each logged bid
// decrease, we take the click volume that keyword saw in the 30 days after
// the change and multiply by the per-click amount shaved off — an
// approximation (real savings depend on the auction, not just your bid),
// but a defensible, honestly-documented one, not a made-up number.
const SAVINGS_WINDOW_DAYS = 30;

export async function getEstimatedSavings(profileId?: string): Promise<number> {
  const bidChanges = await prisma.changeLog.findMany({
    where: { entityType: "keyword", field: "bid" },
  });

  let total = 0;
  for (const entry of bidChanges) {
    const oldBid = entry.oldValue ? Number(entry.oldValue) : null;
    const newBid = entry.newValue ? Number(entry.newValue) : null;
    if (oldBid == null || newBid == null || newBid >= oldBid) continue;

    const keyword = await prisma.keyword.findUnique({
      where: { id: entry.entityId },
      select: { id: true, adGroup: { select: { campaign: { select: { profileId: true } } } } },
    });
    if (!keyword) continue;
    if (profileId && keyword.adGroup.campaign.profileId !== profileId) continue;

    const windowEnd = new Date(entry.createdAt);
    windowEnd.setUTCDate(windowEnd.getUTCDate() + SAVINGS_WINDOW_DAYS);

    const clicksAfter = await prisma.metricSnapshot.aggregate({
      where: { entityType: "keyword", keywordId: keyword.id, date: { gt: entry.createdAt, lte: windowEnd } },
      _sum: { clicks: true },
    });

    total += (oldBid - newBid) * (clicksAfter._sum.clicks ?? 0);
  }
  return total;
}

export interface AcosStreak {
  campaign: { id: string; name: string; targetAcos: number | null };
  days: number;
}

// Consecutive most-recent days a campaign's daily ACOS has stayed at or
// under its target — counts backward from the latest synced day, stopping
// at the first miss (or the first day with no data at all).
export async function getAcosStreaks(profileId?: string): Promise<AcosStreak[]> {
  const campaigns = await prisma.campaign.findMany({
    where: { targetAcos: { not: null }, ...(profileId ? { profileId } : {}) },
    select: { id: true, name: true, targetAcos: true },
  });
  if (campaigns.length === 0) return [];

  const results: AcosStreak[] = [];
  for (const campaign of campaigns) {
    const days = await prisma.metricSnapshot.findMany({
      where: { entityType: "campaign", campaignId: campaign.id },
      orderBy: { date: "desc" },
      take: 60,
      select: { acos: true },
    });
    let streak = 0;
    for (const day of days) {
      if (day.acos <= campaign.targetAcos!) streak++;
      else break;
    }
    if (streak > 0) results.push({ campaign, days: streak });
  }
  return results.sort((a, b) => b.days - a.days);
}

export interface OptimizationScore {
  score: number; // 0-100
  healthyPct: number; // campaigns not in an ACOS alert
  managedPct: number; // campaigns with a target ACOS set (under active bid management)
  notConstrainedPct: number; // campaigns not budget-constrained
}

// A single 0-100 number blending three things that are each independently
// tracked elsewhere on the dashboard (ACOS alerts, target-ACOS coverage,
// budget headroom) — not a new signal, just a scoreboard-friendly rollup
// of signals that already exist.
export async function getOptimizationScore(profileId?: string): Promise<OptimizationScore> {
  const range = resolveDateRange({ days: "30" });
  const summary = await getAccountSummary(range, profileId);
  const campaigns = await prisma.campaign.findMany({
    where: { state: { in: ["enabled", "paused"] }, ...(profileId ? { profileId } : {}) },
    select: { id: true, targetAcos: true },
  });
  const budgetConstrained = await getBudgetConstrainedCampaigns(profileId);

  if (campaigns.length === 0) {
    return { score: 0, healthyPct: 0, managedPct: 0, notConstrainedPct: 0 };
  }

  const alertedIds = new Set(summary.alerts.map((a) => a.campaign.id));
  const healthyPct = 1 - alertedIds.size / Math.max(1, summary.totalCampaigns || campaigns.length);
  const managedPct = campaigns.filter((c) => c.targetAcos !== null).length / campaigns.length;
  const notConstrainedPct = 1 - budgetConstrained.length / campaigns.length;

  const score = Math.round(
    Math.max(0, healthyPct) * 40 + Math.max(0, managedPct) * 30 + Math.max(0, notConstrainedPct) * 30
  );
  return { score, healthyPct, managedPct, notConstrainedPct };
}

export interface LeaderboardEntry {
  profileId: string;
  label: string;
  acos: number;
  prevAcos: number;
  improvement: number; // percentage points; positive = ACOS went down = improved
  spend: number;
}

// Ranks every connected profile by ACOS improvement over the previous
// equivalent period — a friendly "who's optimizing best" view now that a
// single account can hold many brands/marketplaces.
export async function getProfileLeaderboard(range: DateRange): Promise<LeaderboardEntry[]> {
  const profiles = await prisma.profile.findMany({ include: { account: true } });
  const prevRange = previousPeriod(range);

  const entries: LeaderboardEntry[] = [];
  for (const profile of profiles) {
    const current = await getAccountSummary(range, profile.id);
    const prev = await getAccountSummary(prevRange, profile.id);
    if (current.totalCampaigns === 0) continue;
    entries.push({
      profileId: profile.id,
      label: profile.entityName ?? `${profile.countryCode} — ${profile.account.name}`,
      acos: current.acos,
      prevAcos: prev.acos,
      improvement: prev.acos > 0 ? prev.acos - current.acos : 0,
      spend: current.spend,
    });
  }
  return entries.sort((a, b) => b.improvement - a.improvement);
}

export interface Achievement {
  id: string;
  label: string;
  description: string;
  achieved: boolean;
}

// Fixed, computed-live achievement list — no separate table to keep in
// sync, "achieved" is just a live read of state that's already tracked
// elsewhere (suggestion statuses, streaks, alert counts).
export async function getAchievements(): Promise<Achievement[]> {
  const range = resolveDateRange({ days: "30" });
  const pushedNegatives = await prisma.negativeKeywordSuggestion.count({ where: { status: "pushed" } });
  const addedKeywords = await prisma.keywordHarvestSuggestion.count({ where: { status: "added" } });
  const totalCampaigns = await prisma.campaign.count({ where: { state: { in: ["enabled", "paused"] } } });
  const taggedCampaigns = await prisma.campaign.count({
    where: { state: { in: ["enabled", "paused"] }, tags: { isEmpty: false } },
  });
  const budgetConstrained = await getBudgetConstrainedCampaigns();
  const streaks = await getAcosStreaks();
  const summary = await getAccountSummary(range);

  const longestStreak = streaks[0]?.days ?? 0;

  return [
    {
      id: "first-push",
      label: "First Push",
      description: "Push a negative keyword or harvested keyword to Amazon",
      achieved: pushedNegatives + addedKeywords > 0,
    },
    {
      id: "negative-ninja",
      label: "Negative Ninja",
      description: "Push 10 negative keywords live",
      achieved: pushedNegatives >= 10,
    },
    {
      id: "keyword-harvester",
      label: "Keyword Harvester",
      description: "Add 10 harvested keywords live",
      achieved: addedKeywords >= 10,
    },
    {
      id: "budget-boss",
      label: "Budget Boss",
      description: "Zero campaigns budget-constrained right now",
      achieved: totalCampaigns > 0 && budgetConstrained.length === 0,
    },
    {
      id: "streak-master",
      label: "Streak Master",
      description: "Keep a campaign under target ACOS for 7 days straight",
      achieved: longestStreak >= 7,
    },
    {
      id: "tagger",
      label: "Well Organized",
      description: "Tag at least half your active campaigns",
      achieved: totalCampaigns > 0 && taggedCampaigns / totalCampaigns >= 0.5,
    },
    {
      id: "clean-sweep",
      label: "Clean Sweep",
      description: `Zero campaigns above ${ALERT_ACOS_THRESHOLD}% ACOS (spend ≥ ${ALERT_MIN_SPEND})`,
      achieved: totalCampaigns > 0 && summary.alerts.length === 0,
    },
  ];
}
