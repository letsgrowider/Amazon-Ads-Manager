import { prisma } from "@/lib/db";
import type { DateRange } from "@/lib/date-range";

// Cap suggested bid changes to ±30% per cycle — avoids wild swings from a
// single noisy day and matches common PPC-tool convention.
export const MAX_BID_CHANGE_RATIO = 0.3;
export const MIN_BID = 0.02;

export interface BidSuggestion {
  // Holds a Keyword.id or a Target.id depending on entityType — the API
  // route to push a suggestion to Amazon differs accordingly
  // (/api/keywords/[id]/bid vs /api/targets/[id]/bid).
  entityType: "keyword" | "target";
  keywordId: string;
  keywordText: string;
  adGroupName: string;
  currentBid: number;
  // The suggestion formula deliberately still runs on ad-group ACOS (see
  // getBidSuggestions below) — these per-row numbers are for a human to
  // sanity-check the suggestion against, not an input to it.
  adGroupAcos: number | null;
  keywordSpend: number;
  keywordOrders: number;
  keywordAcos: number | null;
  suggestedBid: number | null;
}

function suggestBid(currentBid: number, adGroupAcos: number | null, targetAcos: number): number | null {
  if (adGroupAcos === null || adGroupAcos <= 0) return null;
  const ratio = targetAcos / adGroupAcos;
  const clampedRatio = Math.min(1 + MAX_BID_CHANGE_RATIO, Math.max(1 - MAX_BID_CHANGE_RATIO, ratio));
  return Math.max(MIN_BID, Number((currentBid * clampedRatio).toFixed(2)));
}

// Standard target-ACOS bid formula: newBid = currentBid * (targetAcos / actualAcos),
// clamped to ±MAX_BID_CHANGE_RATIO and a minimum bid floor. Covers both real
// keywords and product/category/auto targets (Amazon's other targeting
// resource, /sp/targets) — both bid the same way within a manual ad group,
// so the same formula and ad-group ACOS input apply to either.
export async function getBidSuggestions(campaignId: string, range: DateRange): Promise<BidSuggestion[]> {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: { adGroups: { include: { keywords: true, targets: true } } },
  });
  if (!campaign || campaign.targetAcos == null) return [];

  const adGroupIds = campaign.adGroups.map((a) => a.id);
  const sums = await prisma.metricSnapshot.groupBy({
    by: ["adGroupId"],
    where: { entityType: "adGroup", adGroupId: { in: adGroupIds }, date: { gte: range.since, lte: range.until } },
    _sum: { spend: true, sales: true },
  });
  const acosByAdGroup = new Map(
    sums.map((s) => {
      const spend = s._sum.spend ?? 0;
      const sales = s._sum.sales ?? 0;
      return [s.adGroupId, sales > 0 ? (spend / sales) * 100 : null] as const;
    })
  );

  const keywordIds = campaign.adGroups.flatMap((a) => a.keywords.map((k) => k.id));
  const keywordSums = await prisma.metricSnapshot.groupBy({
    by: ["keywordId"],
    where: { entityType: "keyword", keywordId: { in: keywordIds }, date: { gte: range.since, lte: range.until } },
    _sum: { spend: true, sales: true, orders: true },
  });
  const metricsByKeyword = new Map(
    keywordSums.map((s) => {
      const spend = s._sum.spend ?? 0;
      const sales = s._sum.sales ?? 0;
      const orders = s._sum.orders ?? 0;
      return [s.keywordId, { spend, orders, acos: sales > 0 ? (spend / sales) * 100 : null }] as const;
    })
  );

  const targetIds = campaign.adGroups.flatMap((a) => a.targets.map((t) => t.id));
  const targetSums = await prisma.metricSnapshot.groupBy({
    by: ["targetId"],
    where: { entityType: "target", targetId: { in: targetIds }, date: { gte: range.since, lte: range.until } },
    _sum: { spend: true, sales: true, orders: true },
  });
  const metricsByTarget = new Map(
    targetSums.map((s) => {
      const spend = s._sum.spend ?? 0;
      const sales = s._sum.sales ?? 0;
      const orders = s._sum.orders ?? 0;
      return [s.targetId, { spend, orders, acos: sales > 0 ? (spend / sales) * 100 : null }] as const;
    })
  );

  const targetAcos = campaign.targetAcos;
  const suggestions: BidSuggestion[] = [];
  for (const adGroup of campaign.adGroups) {
    const acos = acosByAdGroup.get(adGroup.id) ?? null;
    for (const kw of adGroup.keywords) {
      const kwMetrics = metricsByKeyword.get(kw.id);
      suggestions.push({
        entityType: "keyword",
        keywordId: kw.id,
        keywordText: kw.keywordText,
        adGroupName: adGroup.name,
        currentBid: kw.bid,
        adGroupAcos: acos,
        keywordSpend: kwMetrics?.spend ?? 0,
        keywordOrders: kwMetrics?.orders ?? 0,
        keywordAcos: kwMetrics?.acos ?? null,
        suggestedBid: suggestBid(kw.bid, acos, targetAcos),
      });
    }
    for (const t of adGroup.targets) {
      if (t.bid == null) continue; // no current bid to adjust from (ad-group default applies)
      const tMetrics = metricsByTarget.get(t.id);
      suggestions.push({
        entityType: "target",
        keywordId: t.id,
        keywordText: t.expressionSummary,
        adGroupName: adGroup.name,
        currentBid: t.bid,
        adGroupAcos: acos,
        keywordSpend: tMetrics?.spend ?? 0,
        keywordOrders: tMetrics?.orders ?? 0,
        keywordAcos: tMetrics?.acos ?? null,
        suggestedBid: suggestBid(t.bid, acos, targetAcos),
      });
    }
  }
  return suggestions;
}
