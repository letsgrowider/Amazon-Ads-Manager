import { prisma } from "@/lib/db";
import type { DateRange } from "@/lib/date-range";

// Cap suggested bid changes to ±30% per cycle — avoids wild swings from a
// single noisy day and matches common PPC-tool convention.
export const MAX_BID_CHANGE_RATIO = 0.3;
export const MIN_BID = 0.02;

export interface BidSuggestion {
  keywordId: string;
  keywordText: string;
  adGroupName: string;
  currentBid: number;
  // ACOS is tracked at ad-group granularity (not per-keyword — Amazon's
  // keyword-level report, spTargeting, isn't synced yet), so every keyword
  // in an ad group shares the same ACOS input to the suggestion formula.
  adGroupAcos: number | null;
  suggestedBid: number | null;
}

// Standard target-ACOS bid formula: newBid = currentBid * (targetAcos / actualAcos),
// clamped to ±MAX_BID_CHANGE_RATIO and a minimum bid floor.
export async function getBidSuggestions(campaignId: string, range: DateRange): Promise<BidSuggestion[]> {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: { adGroups: { include: { keywords: true } } },
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

  const targetAcos = campaign.targetAcos;
  const suggestions: BidSuggestion[] = [];
  for (const adGroup of campaign.adGroups) {
    const acos = acosByAdGroup.get(adGroup.id) ?? null;
    for (const kw of adGroup.keywords) {
      let suggestedBid: number | null = null;
      if (acos !== null && acos > 0) {
        const ratio = targetAcos / acos;
        const clampedRatio = Math.min(1 + MAX_BID_CHANGE_RATIO, Math.max(1 - MAX_BID_CHANGE_RATIO, ratio));
        suggestedBid = Math.max(MIN_BID, Number((kw.bid * clampedRatio).toFixed(2)));
      }
      suggestions.push({
        keywordId: kw.id,
        keywordText: kw.keywordText,
        adGroupName: adGroup.name,
        currentBid: kw.bid,
        adGroupAcos: acos,
        suggestedBid,
      });
    }
  }
  return suggestions;
}
