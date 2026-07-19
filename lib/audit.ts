import { prisma } from "@/lib/db";

// Logs a field change after it succeeds. Only writes a row if the value
// actually changed — avoids noise from no-op saves (e.g. re-saving the
// same budget).
export async function logChange(
  entityType: string,
  entityId: string,
  field: string,
  oldValue: unknown,
  newValue: unknown,
  changedBy?: string | null
) {
  const oldStr = oldValue === undefined || oldValue === null ? null : String(oldValue);
  const newStr = newValue === undefined || newValue === null ? null : String(newValue);
  if (oldStr === newStr) return;

  await prisma.changeLog.create({
    data: { entityType, entityId, field, oldValue: oldStr, newValue: newStr, changedBy: changedBy ?? null },
  });
}

// Resolves each log row's entityId to a human label + link, batched per
// entity type to avoid N+1 queries.
export async function getChangeHistory(limit = 200) {
  const logs = await prisma.changeLog.findMany({ orderBy: { createdAt: "desc" }, take: limit });

  const campaignIds = logs.filter((l) => l.entityType === "campaign").map((l) => l.entityId);
  const keywordIds = logs.filter((l) => l.entityType === "keyword").map((l) => l.entityId);
  const suggestionIds = logs.filter((l) => l.entityType === "negativeKeywordSuggestion").map((l) => l.entityId);

  const [campaigns, keywords, suggestions] = await Promise.all([
    prisma.campaign.findMany({ where: { id: { in: campaignIds } }, include: { profile: true } }),
    prisma.keyword.findMany({
      where: { id: { in: keywordIds } },
      include: { adGroup: { include: { campaign: { include: { profile: true } } } } },
    }),
    prisma.negativeKeywordSuggestion.findMany({ where: { id: { in: suggestionIds } } }),
  ]);

  const campaignById = new Map(campaigns.map((c) => [c.id, c]));
  const keywordById = new Map(keywords.map((k) => [k.id, k]));
  const suggestionById = new Map(suggestions.map((s) => [s.id, s]));

  return logs.map((log) => {
    let label = log.entityId;
    let href: string | null = null;
    // bid/dailyBudget values are only meaningful with the right currency —
    // both branches below resolve it from the real profile when found.
    let currencyCode: string | null = null;

    if (log.entityType === "campaign") {
      const c = campaignById.get(log.entityId);
      if (c) {
        label = c.name;
        href = `/campaigns/${c.id}`;
        currencyCode = c.profile.currencyCode;
      }
    } else if (log.entityType === "keyword") {
      const k = keywordById.get(log.entityId);
      if (k) {
        label = k.keywordText;
        href = `/keywords/${k.id}`;
        currencyCode = k.adGroup.campaign.profile.currencyCode;
      }
    } else if (log.entityType === "negativeKeywordSuggestion") {
      const s = suggestionById.get(log.entityId);
      if (s) label = s.keywordText;
    }

    return { ...log, label, href, currencyCode };
  });
}

// Bid change points for a single keyword, oldest first — enough to plot a
// step chart of bid value over time.
export async function getKeywordBidHistory(keywordId: string) {
  const logs = await prisma.changeLog.findMany({
    where: { entityType: "keyword", entityId: keywordId, field: "bid" },
    orderBy: { createdAt: "asc" },
  });

  return logs.map((log) => ({
    date: log.createdAt,
    oldBid: log.oldValue ? Number(log.oldValue) : null,
    newBid: log.newValue ? Number(log.newValue) : null,
  }));
}
