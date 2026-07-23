import { prisma } from "@/lib/db";
import type { DateRange } from "@/lib/date-range";

// Flag campaigns spending above this ACOS as needing attention.
export const ALERT_ACOS_THRESHOLD = 40;
// Ignore near-zero spend when flagging — a single lucky/unlucky click
// shouldn't trigger an alert.
export const ALERT_MIN_SPEND = 10;

// A search term is a "wasted spend" candidate if it's spent enough to be
// meaningful but never converted.
export const MIN_WASTED_SPEND = 5;

// A search term is a keyword-harvest candidate if it converted with enough
// clicks to not just be a fluke — worth promoting to its own exact-match
// keyword for tighter bid control (mirrors MIN_WASTED_SPEND's logic in the
// opposite direction).
export const HARVEST_MIN_CLICKS = 2;
export const HARVEST_MIN_ORDERS = 1;

// Flag a campaign as budget-constrained if its most recent day's spend hit
// this fraction of its daily budget — a sign it likely ran out of budget
// and lost bidding time later in the day.
export const BUDGET_UTILIZATION_THRESHOLD = 0.9;

// Filters by a single profile (one Amazon marketplace/country), not by
// account — an account with multiple marketplaces (e.g. an EU-region login
// with separate US/UK/India/... profiles) was otherwise only filterable at
// the account level, blending every country's numbers together with no way
// to look at just one.
function profileWhere(profileId?: string) {
  return profileId ? { profileId } : {};
}

// Uses the single most recent synced day, not live intraday pacing — sync
// only pulls "yesterday" once a day, there's no same-day spend data to
// project a live pace from. Still a useful signal at daily granularity.
export async function getBudgetConstrainedCampaigns(profileId?: string) {
  const campaigns = await prisma.campaign.findMany({ where: { state: "enabled", ...profileWhere(profileId) } });
  if (campaigns.length === 0) return [];

  const latest = await prisma.metricSnapshot.findFirst({
    where: { entityType: "campaign", campaignId: { in: campaigns.map((c) => c.id) } },
    orderBy: { date: "desc" },
    select: { date: true },
  });
  if (!latest) return [];

  const latestMetrics = await prisma.metricSnapshot.findMany({
    where: {
      entityType: "campaign",
      campaignId: { in: campaigns.map((c) => c.id) },
      date: latest.date,
    },
  });
  const spendByCampaign = new Map(latestMetrics.map((m) => [m.campaignId, m.spend]));

  return campaigns
    .map((campaign) => ({
      campaign,
      date: latest.date,
      spend: spendByCampaign.get(campaign.id) ?? 0,
      utilization: campaign.dailyBudget > 0 ? (spendByCampaign.get(campaign.id) ?? 0) / campaign.dailyBudget : 0,
    }))
    .filter((r) => r.utilization >= BUDGET_UTILIZATION_THRESHOLD)
    .sort((a, b) => b.utilization - a.utilization);
}

export type SearchTermSortBy = "spend" | "clicks" | "orders" | "acos" | "roas";

export async function getSearchTermRows(
  range: DateRange,
  options: { campaignId?: string; search?: string; sortBy?: SearchTermSortBy; sortDir?: "asc" | "desc" } = {}
) {
  const { campaignId, search, sortBy = "spend", sortDir = "desc" } = options;

  const rows = await prisma.searchTermReport.findMany({
    where: {
      date: { gte: range.since, lte: range.until },
      ...(campaignId ? { campaignId } : {}),
      ...(search ? { searchTerm: { contains: search, mode: "insensitive" } } : {}),
    },
    // DB-level orderBy just keeps the biggest-spend rows if this ever hits
    // the cap below — acos/roas/clicks/orders sorting happens in JS after,
    // since those aren't sortable at the query level without extra columns.
    orderBy: { spend: "desc" },
    take: 5000,
  });

  const campaignIds = [...new Set(rows.map((r) => r.campaignId))];
  const adGroupIds = [...new Set(rows.map((r) => r.adGroupId))];
  const [campaigns, adGroups] = await Promise.all([
    prisma.campaign.findMany({ where: { campaignId: { in: campaignIds } }, include: { profile: true } }),
    prisma.adGroup.findMany({ where: { adGroupId: { in: adGroupIds } } }),
  ]);
  const campaignByAmazonId = new Map(campaigns.map((c) => [c.campaignId, c]));
  const adGroupByAmazonId = new Map(adGroups.map((a) => [a.adGroupId, a]));

  const enriched = rows.map((row) => ({
    row,
    currencyCode: campaignByAmazonId.get(row.campaignId)?.profile.currencyCode ?? null,
    campaignName: campaignByAmazonId.get(row.campaignId)?.name ?? row.campaignId,
    adGroupName: adGroupByAmazonId.get(row.adGroupId)?.name ?? row.adGroupId,
    acos: row.sales > 0 ? (row.spend / row.sales) * 100 : 0,
    roas: row.spend > 0 ? row.sales / row.spend : 0,
    isWastedSpend: row.orders === 0 && row.spend >= MIN_WASTED_SPEND,
    isHarvestCandidate: row.orders >= HARVEST_MIN_ORDERS && row.clicks >= HARVEST_MIN_CLICKS,
  }));

  const sortValue = (r: (typeof enriched)[number]) => {
    switch (sortBy) {
      case "clicks":
        return r.row.clicks;
      case "orders":
        return r.row.orders;
      case "acos":
        return r.acos;
      case "roas":
        return r.roas;
      case "spend":
      default:
        return r.row.spend;
    }
  };
  enriched.sort((a, b) => (sortDir === "asc" ? sortValue(a) - sortValue(b) : sortValue(b) - sortValue(a)));

  return enriched.slice(0, 200);
}

export type KeywordSortBy = "spend" | "clicks" | "orders" | "acos" | "roas" | "bid";

export async function getKeywordRows(
  range: DateRange,
  options: { campaignId?: string; search?: string; sortBy?: KeywordSortBy; sortDir?: "asc" | "desc" } = {}
) {
  const { campaignId, search, sortBy = "spend", sortDir = "desc" } = options;

  const keywords = await prisma.keyword.findMany({
    where: {
      ...(campaignId ? { adGroup: { campaign: { campaignId } } } : {}),
      ...(search ? { keywordText: { contains: search, mode: "insensitive" } } : {}),
    },
    include: { adGroup: { include: { campaign: { include: { profile: true } } } } },
  });

  const metricSums = await prisma.metricSnapshot.groupBy({
    by: ["keywordId"],
    where: {
      entityType: "keyword",
      keywordId: { in: keywords.map((k) => k.id) },
      date: { gte: range.since, lte: range.until },
    },
    _sum: { impressions: true, clicks: true, spend: true, sales: true, orders: true },
  });
  const sumsByKeyword = new Map(metricSums.map((m) => [m.keywordId, m._sum]));

  const enriched = keywords.map((kw) => {
    const sums = sumsByKeyword.get(kw.id);
    const impressions = sums?.impressions ?? 0;
    const clicks = sums?.clicks ?? 0;
    const spend = sums?.spend ?? 0;
    const sales = sums?.sales ?? 0;
    const orders = sums?.orders ?? 0;
    return {
      keyword: kw,
      campaignName: kw.adGroup.campaign.name,
      adGroupName: kw.adGroup.name,
      currencyCode: kw.adGroup.campaign.profile.currencyCode,
      impressions,
      clicks,
      spend,
      sales,
      orders,
      acos: sales > 0 ? (spend / sales) * 100 : 0,
      roas: spend > 0 ? sales / spend : 0,
    };
  });

  const sortValue = (r: (typeof enriched)[number]) => {
    switch (sortBy) {
      case "clicks":
        return r.clicks;
      case "orders":
        return r.orders;
      case "acos":
        return r.acos;
      case "roas":
        return r.roas;
      case "bid":
        return r.keyword.bid;
      case "spend":
      default:
        return r.spend;
    }
  };
  enriched.sort((a, b) => (sortDir === "asc" ? sortValue(a) - sortValue(b) : sortValue(b) - sortValue(a)));

  return enriched;
}

export type CampaignStateFilter = "enabled" | "paused" | "both";

// Archived campaigns are never shown — nobody manages them, and the
// enabled/paused/both filter below is deliberately the full set of options.
function stateWhere(stateFilter: CampaignStateFilter) {
  return stateFilter === "both" ? { in: ["enabled", "paused"] } : stateFilter;
}

export type CampaignSortBy = "spend" | "sales" | "acos" | "ctr" | "orders";

export async function getCampaignRows(
  range: DateRange,
  profileId?: string,
  stateFilter: CampaignStateFilter = "both",
  options: { sortBy?: CampaignSortBy; sortDir?: "asc" | "desc" } = {}
) {
  const { sortBy, sortDir = "desc" } = options;

  const campaigns = await prisma.campaign.findMany({
    where: { state: stateWhere(stateFilter), ...profileWhere(profileId) },
    include: { profile: { include: { account: true } } },
    orderBy: { name: "asc" },
  });

  const metricSums = await prisma.metricSnapshot.groupBy({
    by: ["campaignId"],
    where: {
      entityType: "campaign",
      campaignId: { in: campaigns.map((c) => c.id) },
      date: { gte: range.since, lte: range.until },
    },
    _sum: { impressions: true, clicks: true, spend: true, sales: true, orders: true },
  });
  const metricsByCampaign = new Map(metricSums.map((m) => [m.campaignId, m._sum]));

  const rows = campaigns.map((campaign) => {
    const sums = metricsByCampaign.get(campaign.id);
    const impressions = sums?.impressions ?? 0;
    const clicks = sums?.clicks ?? 0;
    const spend = sums?.spend ?? 0;
    const sales = sums?.sales ?? 0;
    const orders = sums?.orders ?? 0;
    return {
      campaign,
      impressions,
      clicks,
      spend,
      sales,
      orders,
      acos: sales > 0 ? (spend / sales) * 100 : 0,
      ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
    };
  });

  if (sortBy) {
    const sortValue = (r: (typeof rows)[number]) => r[sortBy];
    rows.sort((a, b) => (sortDir === "asc" ? sortValue(a) - sortValue(b) : sortValue(b) - sortValue(a)));
  }

  return rows;
}

// Account-wide daily spend/sales trend, summed across all campaigns (or just
// the given account's, if provided).
export async function getAccountDailyTrend(range: DateRange, profileId?: string) {
  let campaignIdFilter: string[] | undefined;
  if (profileId) {
    const campaigns = await prisma.campaign.findMany({
      where: profileWhere(profileId),
      select: { id: true },
    });
    campaignIdFilter = campaigns.map((c) => c.id);
  }

  const rows = await prisma.metricSnapshot.groupBy({
    by: ["date"],
    where: {
      entityType: "campaign",
      date: { gte: range.since, lte: range.until },
      ...(campaignIdFilter ? { campaignId: { in: campaignIdFilter } } : {}),
    },
    _sum: { spend: true, sales: true, clicks: true, impressions: true, orders: true },
    orderBy: { date: "asc" },
  });

  return rows.map((r) => {
    const spend = r._sum.spend ?? 0;
    const sales = r._sum.sales ?? 0;
    return {
      date: r.date,
      spend,
      sales,
      orders: r._sum.orders ?? 0,
      acos: sales > 0 ? (spend / sales) * 100 : 0,
    };
  });
}

// Account-wide totals for the same window, plus campaigns whose ACOS is
// above ALERT_ACOS_THRESHOLD (worth a second look).
export async function getAccountSummary(range: DateRange, profileId?: string) {
  const rows = await getCampaignRows(range, profileId);

  const totals = rows.reduce(
    (acc, r) => ({
      spend: acc.spend + r.spend,
      sales: acc.sales + r.sales,
      orders: acc.orders + r.orders,
      impressions: acc.impressions + r.impressions,
      clicks: acc.clicks + r.clicks,
    }),
    { spend: 0, sales: 0, orders: 0, impressions: 0, clicks: 0 }
  );

  const alerts = rows.filter((r) => r.spend >= ALERT_MIN_SPEND && r.acos > ALERT_ACOS_THRESHOLD);

  return {
    ...totals,
    // NB: this is ad-attributed sales only (no organic sales from SP-API),
    // so it's really ACOS at the account level, not true TACOS. Labelled
    // as such in the UI.
    acos: totals.sales > 0 ? (totals.spend / totals.sales) * 100 : 0,
    activeCampaigns: rows.filter((r) => r.campaign.state === "enabled").length,
    totalCampaigns: rows.length,
    alerts,
  };
}

// Campaign.updatedAt is touched by every structure upsert in syncStructure,
// so its max is a reliable "last synced" signal without a dedicated column —
// null means this account (or the whole app) has never synced.
export async function getLastSyncedAt(profileId?: string): Promise<Date | null> {
  const result = await prisma.campaign.aggregate({
    where: profileWhere(profileId),
    _max: { updatedAt: true },
  });
  return result._max.updatedAt;
}

// Actionable (not yet acted on) suggestion counts, to turn the "Negative
// Keywords" / "Keyword Harvest" nav links into something worth clicking
// instead of a guess at what's behind them.
export async function getQueuedSuggestionCounts() {
  const [negativeKeywords, keywordHarvest] = await Promise.all([
    prisma.negativeKeywordSuggestion.count({ where: { status: "queued" } }),
    prisma.keywordHarvestSuggestion.count({ where: { status: "queued" } }),
  ]);
  return { negativeKeywords, keywordHarvest };
}

// Most recent sync run (any status) with its per-profile rows, so the
// dashboard can show live progress instead of a sync being a black box
// until it finishes.
export async function getLatestSyncRun() {
  return prisma.syncRun.findFirst({
    orderBy: { startedAt: "desc" },
    include: { profiles: { orderBy: { label: "asc" } } },
  });
}
