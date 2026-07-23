import { prisma } from "@/lib/db";
import { AmazonAdsClient, type AdsCampaign, type AdsAdGroup, type AdsKeyword } from "@/lib/amazon-ads";
import { getValidAccessToken, forceRefreshAccessToken } from "@/lib/amazon-account";
import { createAndDownloadReport } from "@/lib/amazon-reports";

// UTC calendar date, not local — mixing local-time arithmetic with a
// UTC-labeled date string (toISOString()) can land on the wrong day
// depending on server timezone. (Doesn't account for the advertiser's
// marketplace timezone either, but that's a separate, harder problem —
// this at least keeps the string internally consistent.)
function yesterday(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

// Every metrics report was requesting a single day (SUMMARY) — every sync
// only ever had "yesterday" to show, so date-range controls and trend
// charts throughout the app had exactly one data point no matter what
// range was picked. Pulling a rolling window with DAILY granularity
// instead means each sync backfills real history (upserts are idempotent,
// so overlapping windows across daily syncs just re-confirm old days).
const BACKFILL_DAYS = 30;
// Once a profile has history, a full 30-day re-pull every sync is wasted
// work — Amazon's report-generation time scales with the size of the
// report, and a smaller window generates faster. A few days (not just
// "yesterday") because ad-attributed sales can still shift for a day or
// two after the fact as orders settle.
const INCREMENTAL_DAYS = 3;

interface ReportDateRange {
  startDate: string;
  endDate: string;
}

function reportRange(hasHistory: boolean): ReportDateRange {
  const days = hasHistory ? INCREMENTAL_DAYS : BACKFILL_DAYS;
  const endDate = yesterday();
  const start = new Date(`${endDate}T00:00:00.000Z`);
  start.setUTCDate(start.getUTCDate() - (days - 1));
  return { startDate: start.toISOString().slice(0, 10), endDate };
}

// Amazon's v3 API returns state/matchType/targetingType as uppercase enums
// (ENABLED, PAUSED, BROAD, EXACT, MANUAL, ...) but the rest of this app
// (seed data, UI comparisons like `campaign.state === "enabled"`) assumes
// lowercase — normalize at the sync boundary rather than special-casing
// every comparison site.
function normalizeEnum(value: string): string {
  return value.toLowerCase();
}

// Node's fetch() collapses network-layer failures (ECONNRESET, TLS errors,
// timeouts) into a bare "fetch failed" message — the real reason lives on
// err.cause, which we were previously discarding, making these errors
// impossible to actually diagnose from sync output.
function errMsg(err: unknown): string {
  const e = err as Error & { cause?: unknown };
  return e.cause ? `${e.message}: ${String((e.cause as Error)?.message ?? e.cause)}` : e.message;
}

interface MetricSnapshotKey {
  date: Date;
  entityType: "campaign" | "adGroup" | "keyword";
  campaignId: string | null;
  adGroupId: string | null;
  keywordId: string | null;
}

interface MetricSnapshotValues {
  impressions: number;
  clicks: number;
  spend: number;
  sales: number;
  orders: number;
}

// Profile/report-level concurrency (see mapWithConcurrency below) is a real
// speed win for the network/report-polling side of sync, which is where
// almost all the wall-clock time goes — but running the DB-write phases of
// several profiles/report-types concurrently against the same PrismaClient
// (via @prisma/adapter-pg) produced real, reproducible corruption: "bind
// message supplies N parameters, but prepared statement requires M", and a
// separate TOCTOU race in upsertMetricSnapshot's find-then-write pattern
// (a concurrent write could delete/replace the row between the findFirst
// and the update). Bumping the pg.Pool size did not fix it — this is a
// concurrency bug in how statements get interleaved on pooled connections,
// not a pool-exhaustion problem. The real fix: keep fetching (network I/O)
// fully concurrent, but funnel every DB write through this single chain so
// only one write is ever in flight at a time, globally, regardless of how
// many profiles/reports are being fetched in parallel.
let dbWriteChain: Promise<unknown> = Promise.resolve();
function serialized<T>(fn: () => Promise<T>): Promise<T> {
  const result = dbWriteChain.then(fn, fn);
  dbWriteChain = result.then(
    () => undefined,
    () => undefined
  );
  return result;
}

// Prisma 7's compound-unique input for this key doesn't accept null for the
// nullable id columns (only the plain WhereInput filters do), so upsert()
// can't target it directly — find-then-create/update instead.
async function upsertMetricSnapshot(key: MetricSnapshotKey, values: MetricSnapshotValues) {
  const data = {
    ...values,
    acos: values.sales > 0 ? (values.spend / values.sales) * 100 : 0,
    ctr: values.impressions > 0 ? (values.clicks / values.impressions) * 100 : 0,
  };

  const existing = await prisma.metricSnapshot.findFirst({ where: key });
  if (existing) {
    await prisma.metricSnapshot.update({ where: { id: existing.id }, data });
  } else {
    await prisma.metricSnapshot.create({ data: { ...key, ...data } });
  }
}

async function syncStructure(client: AmazonAdsClient, dbProfileId: string) {
  const [rawCampaigns, rawAdGroups, rawKeywords] = await Promise.all([
    client.listCampaigns(),
    client.listAdGroups(),
    client.listKeywords(),
  ]);

  return serialized(() => persistStructure(rawCampaigns, rawAdGroups, rawKeywords, dbProfileId));
}

async function persistStructure(
  rawCampaigns: AdsCampaign[],
  rawAdGroups: AdsAdGroup[],
  rawKeywords: AdsKeyword[],
  dbProfileId: string
) {
  // Archived campaigns (and everything under them) are never managed again —
  // skip persisting them so the DB and every list view stay free of clutter
  // that will never be un-archived.
  const campaigns = rawCampaigns.filter((c) => normalizeEnum(c.state) !== "archived");
  const activeCampaignIds = new Set(campaigns.map((c) => c.campaignId));
  const adGroups = rawAdGroups.filter((ag) => activeCampaignIds.has(ag.campaignId));
  const activeAdGroupIds = new Set(adGroups.map((ag) => ag.adGroupId));
  const keywords = rawKeywords.filter((kw) => activeAdGroupIds.has(kw.adGroupId));

  for (const c of campaigns) {
    const startDate = c.startDate ? new Date(c.startDate) : undefined;
    const biddingStrategy = c.dynamicBidding?.strategy ? normalizeEnum(c.dynamicBidding.strategy) : undefined;
    const placementBidding = c.dynamicBidding?.placementBidding ?? [];

    await prisma.campaign.upsert({
      where: { campaignId: c.campaignId },
      create: {
        campaignId: c.campaignId,
        name: c.name,
        state: normalizeEnum(c.state),
        targetingType: normalizeEnum(c.targetingType),
        dailyBudget: c.budget?.budget ?? 0,
        startDate,
        biddingStrategy: biddingStrategy ?? "legacy_for_sales",
        placementBidding,
        profileId: dbProfileId,
      },
      update: {
        name: c.name,
        state: normalizeEnum(c.state),
        targetingType: normalizeEnum(c.targetingType),
        dailyBudget: c.budget?.budget ?? 0,
        ...(startDate ? { startDate } : {}),
        ...(biddingStrategy ? { biddingStrategy } : {}),
        placementBidding,
      },
    });
  }

  // Batch-fetch existing campaigns/adGroups once instead of one findUnique
  // per row inside the loops below — for a real account with thousands of
  // ad groups/keywords, per-row lookups turned a few thousand DB round
  // trips into minutes of sync time.
  const dbCampaigns = await prisma.campaign.findMany({
    where: { campaignId: { in: adGroups.map((ag) => ag.campaignId) } },
    select: { id: true, campaignId: true },
  });
  const campaignIdByAmazonId = new Map(dbCampaigns.map((c) => [c.campaignId, c.id]));

  for (const ag of adGroups) {
    const campaignDbId = campaignIdByAmazonId.get(ag.campaignId);
    if (!campaignDbId) continue; // belongs to a campaign we didn't just sync — skip
    await prisma.adGroup.upsert({
      where: { adGroupId: ag.adGroupId },
      create: {
        adGroupId: ag.adGroupId,
        name: ag.name,
        state: normalizeEnum(ag.state),
        defaultBid: ag.defaultBid ?? 0,
        campaignId: campaignDbId,
      },
      update: { name: ag.name, state: normalizeEnum(ag.state), defaultBid: ag.defaultBid ?? 0 },
    });
  }

  const dbAdGroups = await prisma.adGroup.findMany({
    where: { adGroupId: { in: keywords.map((kw) => kw.adGroupId) } },
    select: { id: true, adGroupId: true },
  });
  const adGroupIdByAmazonId = new Map(dbAdGroups.map((a) => [a.adGroupId, a.id]));

  for (const kw of keywords) {
    const adGroupDbId = adGroupIdByAmazonId.get(kw.adGroupId);
    if (!adGroupDbId) continue;
    await prisma.keyword.upsert({
      where: { keywordId: kw.keywordId },
      create: {
        keywordId: kw.keywordId,
        keywordText: kw.keywordText,
        matchType: normalizeEnum(kw.matchType),
        state: normalizeEnum(kw.state),
        bid: kw.bid ?? 0,
        adGroupId: adGroupDbId,
      },
      update: {
        keywordText: kw.keywordText,
        matchType: normalizeEnum(kw.matchType),
        state: normalizeEnum(kw.state),
        bid: kw.bid ?? 0,
      },
    });
  }

  return { campaigns: campaigns.length, adGroups: adGroups.length, keywords: keywords.length };
}

interface CampaignMetricRow {
  // Verified against a real report download: campaignId comes back as a
  // JSON number here, unlike the string IDs from the list (/sp/campaigns)
  // endpoints — must be stringified before matching our String-typed column.
  // Report files can also include a trailing summary row with no campaignId
  // at all, which must be skipped rather than passed to findUnique (an
  // explicit `undefined` there throws a validation error, not a miss).
  campaignId?: string | number;
  date?: string; // YYYY-MM-DD, present because timeUnit is DAILY
  impressions?: number;
  clicks?: number;
  cost?: number;
  sales7d?: number;
  purchases7d?: number;
}

async function syncCampaignMetrics(client: AmazonAdsClient, { startDate, endDate }: ReportDateRange) {
  const rows = (await createAndDownloadReport(client, {
    name: `campaign-metrics-${startDate}_${endDate}`,
    startDate,
    endDate,
    configuration: {
      adProduct: "SPONSORED_PRODUCTS",
      groupBy: ["campaign"],
      columns: ["campaignId", "date", "impressions", "clicks", "cost", "sales7d", "purchases7d"],
      reportTypeId: "spCampaigns",
      timeUnit: "DAILY",
      format: "GZIP_JSON",
    },
  })) as unknown as CampaignMetricRow[];

  return serialized(async () => {
    let count = 0;
    for (const row of rows) {
      if (row.campaignId == null || !row.date) continue;
      const campaign = await prisma.campaign.findUnique({ where: { campaignId: String(row.campaignId) } });
      if (!campaign) continue;

      await upsertMetricSnapshot(
        { date: new Date(row.date), entityType: "campaign", campaignId: campaign.id, adGroupId: null, keywordId: null },
        {
          impressions: row.impressions ?? 0,
          clicks: row.clicks ?? 0,
          spend: row.cost ?? 0,
          sales: row.sales7d ?? 0,
          orders: row.purchases7d ?? 0,
        }
      );
      count++;
    }
    return count;
  });
}

interface AdGroupMetricRow {
  // Same report-vs-list ID type/shape mismatch as CampaignMetricRow above.
  campaignId?: string | number;
  adGroupId?: string | number;
  date?: string;
  impressions?: number;
  clicks?: number;
  cost?: number;
  sales7d?: number;
  purchases7d?: number;
}

async function syncAdGroupMetrics(client: AmazonAdsClient, { startDate, endDate }: ReportDateRange) {
  const rows = (await createAndDownloadReport(client, {
    name: `adgroup-metrics-${startDate}_${endDate}`,
    startDate,
    endDate,
    configuration: {
      adProduct: "SPONSORED_PRODUCTS",
      // "spAdGroup" isn't a real reportTypeId (confirmed 400 from a live
      // request) — ad-group-level rows come from the same spCampaigns report
      // type, grouped by ["campaign","adGroup"] instead of ["campaign"].
      groupBy: ["campaign", "adGroup"],
      columns: ["campaignId", "adGroupId", "date", "impressions", "clicks", "cost", "sales7d", "purchases7d"],
      reportTypeId: "spCampaigns",
      timeUnit: "DAILY",
      format: "GZIP_JSON",
    },
  })) as unknown as AdGroupMetricRow[];

  return serialized(async () => {
    let count = 0;
    for (const row of rows) {
      if (row.adGroupId == null || !row.date) continue;
      const adGroup = await prisma.adGroup.findUnique({ where: { adGroupId: String(row.adGroupId) } });
      if (!adGroup) continue;

      await upsertMetricSnapshot(
        { date: new Date(row.date), entityType: "adGroup", campaignId: null, adGroupId: adGroup.id, keywordId: null },
        {
          impressions: row.impressions ?? 0,
          clicks: row.clicks ?? 0,
          spend: row.cost ?? 0,
          sales: row.sales7d ?? 0,
          orders: row.purchases7d ?? 0,
        }
      );
      count++;
    }
    return count;
  });
}

interface KeywordMetricRow {
  keywordId?: string | number;
  date?: string;
  impressions?: number;
  clicks?: number;
  cost?: number;
  sales7d?: number;
  purchases7d?: number;
}

// Keyword-level performance was never synced at all — the Keywords page had
// bid/state/matchType but no spend/sales/ACOS/ROAS to actually act on.
// Per Amazon's own examples, keyword rows come from spTargeting grouped by
// "targeting", filtered to the three real keyword match types (this report
// type also covers product/category targeting, which isn't wanted here).
async function syncKeywordMetrics(client: AmazonAdsClient, { startDate, endDate }: ReportDateRange) {
  const rows = (await createAndDownloadReport(client, {
    name: `keyword-metrics-${startDate}_${endDate}`,
    startDate,
    endDate,
    configuration: {
      adProduct: "SPONSORED_PRODUCTS",
      groupBy: ["targeting"],
      columns: ["keywordId", "date", "impressions", "clicks", "cost", "sales7d", "purchases7d"],
      filters: [{ field: "keywordType", values: ["BROAD", "PHRASE", "EXACT"] }],
      reportTypeId: "spTargeting",
      timeUnit: "DAILY",
      format: "GZIP_JSON",
    },
  })) as unknown as KeywordMetricRow[];

  return serialized(async () => {
    let count = 0;
    for (const row of rows) {
      if (row.keywordId == null || !row.date) continue;
      const keyword = await prisma.keyword.findUnique({ where: { keywordId: String(row.keywordId) } });
      if (!keyword) continue;

      await upsertMetricSnapshot(
        { date: new Date(row.date), entityType: "keyword", campaignId: null, adGroupId: null, keywordId: keyword.id },
        {
          impressions: row.impressions ?? 0,
          clicks: row.clicks ?? 0,
          spend: row.cost ?? 0,
          sales: row.sales7d ?? 0,
          orders: row.purchases7d ?? 0,
        }
      );
      count++;
    }
    return count;
  });
}

interface SearchTermRow {
  // Same report-vs-list ID type/shape mismatch as the metric rows above.
  campaignId?: string | number;
  adGroupId?: string | number;
  keywordId?: string | number;
  searchTerm?: string;
  date?: string;
  impressions?: number;
  clicks?: number;
  cost?: number;
  sales7d?: number;
  purchases7d?: number;
}

async function syncSearchTerms(client: AmazonAdsClient, { startDate, endDate }: ReportDateRange, profileDbId: string) {
  const rows = (await createAndDownloadReport(client, {
    name: `search-terms-${startDate}_${endDate}`,
    startDate,
    endDate,
    configuration: {
      adProduct: "SPONSORED_PRODUCTS",
      groupBy: ["searchTerm"],
      columns: [
        "campaignId",
        "adGroupId",
        "keywordId",
        "searchTerm",
        "date",
        "impressions",
        "clicks",
        "cost",
        "sales7d",
        "purchases7d",
      ],
      reportTypeId: "spSearchTerm",
      timeUnit: "DAILY",
      format: "GZIP_JSON",
    },
  })) as unknown as SearchTermRow[];

  return serialized(async () => {
    // Re-running sync for this window should replace, not duplicate, those
    // days -- but ONLY for this profile's own campaigns. Profiles sync one
    // at a time (see PROFILE_SYNC_CONCURRENCY below), so an unscoped delete
    // here would wipe every other profile's search-term rows for this date
    // range and never restore them until that profile's own sync ran again.
    const profileCampaigns = await prisma.campaign.findMany({
      where: { profileId: profileDbId },
      select: { campaignId: true },
    });
    const campaignIds = profileCampaigns.map((c) => c.campaignId);
    await prisma.searchTermReport.deleteMany({
      where: { date: { gte: new Date(startDate), lte: new Date(endDate) }, campaignId: { in: campaignIds } },
    });

    // Skip rows missing a campaign/ad group/date (e.g. a trailing summary row) —
    // campaignId/adGroupId/date are required (non-nullable) columns on this table.
    const validRows = rows.filter(
      (row) => row.campaignId != null && row.adGroupId != null && row.searchTerm != null && row.date
    );
    if (validRows.length === 0) return 0;
    await prisma.searchTermReport.createMany({
      data: validRows.map((row) => ({
        date: new Date(row.date!),
        searchTerm: row.searchTerm!,
        keywordId: row.keywordId != null ? String(row.keywordId) : undefined,
        campaignId: String(row.campaignId),
        adGroupId: String(row.adGroupId),
        impressions: row.impressions ?? 0,
        clicks: row.clicks ?? 0,
        spend: row.cost ?? 0,
        sales: row.sales7d ?? 0,
        orders: row.purchases7d ?? 0,
      })),
    });
    return validRows.length;
  });
}

interface ProfileSyncResult {
  profileId: string;
  structure?: { campaigns: number; adGroups: number; keywords: number };
  campaignMetrics?: number;
  adGroupMetrics?: number;
  keywordMetrics?: number;
  searchTerms?: number;
  errors: string[];
}

// Runs `fn` over `items` with at most `limit` in flight at once, instead of
// either fully sequential (slow) or fully parallel (risks tripping Amazon's
// per-account rate limits when an account has many profiles — an EU-region
// login can easily have a dozen+ country profiles). 3 is a conservative
// starting point, not a measured limit; raise it if Amazon never 429s.
async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function syncProfile(
  client: AmazonAdsClient,
  profile: { id: string; profileId: string },
  syncRunProfileId?: string
): Promise<ProfileSyncResult> {
  if (syncRunProfileId) {
    await serialized(() =>
      prisma.syncRunProfile.update({
        where: { id: syncRunProfileId },
        data: { status: "running", startedAt: new Date() },
      })
    );
  }
  const result: ProfileSyncResult = { profileId: profile.profileId, errors: [] };

  try {
    result.structure = await syncStructure(client, profile.id);
  } catch (err) {
    result.errors.push(`structure sync failed: ${errMsg(err)}`);
  }

  // A full 30-day backfill only needs to happen once per profile — once
  // any keyword-metric history exists, later syncs only need a short
  // trailing window (see reportRange), which generates far faster.
  const hasHistory =
    (await serialized(() =>
      prisma.metricSnapshot.count({
        where: { entityType: "keyword", keyword: { adGroup: { campaign: { profileId: profile.id } } } },
        take: 1,
      })
    )) > 0;
  const range = reportRange(hasHistory);

  // The 4 report types are independent Amazon API calls — requesting them
  // one after another turned "however long the slowest report takes" into
  // "the sum of all 4", which was most of the actual wait. Running them
  // concurrently is the single biggest sync-time win available to us;
  // Amazon's own report-generation time (the real bottleneck, especially
  // for large accounts) is outside our control either way.
  const [campaignRes, adGroupRes, keywordRes, searchTermRes] = await Promise.allSettled([
    syncCampaignMetrics(client, range),
    syncAdGroupMetrics(client, range),
    syncKeywordMetrics(client, range),
    syncSearchTerms(client, range, profile.id),
  ]);

  if (campaignRes.status === "fulfilled") result.campaignMetrics = campaignRes.value;
  else result.errors.push(`campaign metrics failed: ${errMsg(campaignRes.reason)}`);

  if (adGroupRes.status === "fulfilled") result.adGroupMetrics = adGroupRes.value;
  else result.errors.push(`ad group metrics failed: ${errMsg(adGroupRes.reason)}`);

  if (keywordRes.status === "fulfilled") result.keywordMetrics = keywordRes.value;
  else result.errors.push(`keyword metrics failed: ${errMsg(keywordRes.reason)}`);

  if (searchTermRes.status === "fulfilled") result.searchTerms = searchTermRes.value;
  else result.errors.push(`search terms failed: ${errMsg(searchTermRes.reason)}`);

  if (syncRunProfileId) {
    await serialized(() =>
      prisma.syncRunProfile.update({
        where: { id: syncRunProfileId },
        data: {
          status: result.errors.length > 0 ? "failed" : "done",
          finishedAt: new Date(),
          error: result.errors.length > 0 ? result.errors.join("; ") : null,
        },
      })
    );
  }

  return result;
}

// Profiles are independent Amazon accounts from the reporting API's
// perspective, so in principle syncing several at once should be a real
// win. In practice, concurrency > 1 here reproducibly corrupted queries
// against this Prisma 7 + @prisma/adapter-pg combination — "bind message
// supplies N parameters, but prepared statement requires M" — even after
// serializing every DB write through `serialized()` above; it recurred on
// reads too, and once as an uncaught engine-level crash. That's a
// concurrency limitation in the client/adapter itself, not something app-
// level query serialization fully papers over. 1 (fully sequential
// profiles) is the only concurrency level that didn't reproduce it in
// testing. The per-profile 4-report-type fetch below stays concurrent —
// that's pure network I/O (Amazon report creation/polling) with its DB
// writes already serialized, and never showed this failure mode.
const PROFILE_SYNC_CONCURRENCY = 1;

interface ProfileTask {
  accountId: string;
  accountName: string;
  region: "NA" | "EU" | "FE";
  accessToken: string;
  profile: { id: string; profileId: string; entityName: string | null; countryCode: string };
}

export async function syncAllAccounts(): Promise<Record<string, ProfileSyncResult[]>> {
  const accounts = await prisma.amazonAccount.findMany({ include: { profiles: true } });
  const syncRun = await prisma.syncRun.create({ data: { status: "running" } });

  const tasks: ProfileTask[] = [];
  const tokenErrors: Record<string, string> = {};
  for (const account of accounts) {
    // One account failing to even get a valid token (revoked/fake refresh
    // token) shouldn't abort every other account's sync.
    try {
      const accessToken = await getValidAccessToken(account);
      for (const profile of account.profiles) {
        if (!profile.syncEnabled) continue;
        tasks.push({ accountId: account.id, accountName: account.name, region: account.region as ProfileTask["region"], accessToken, profile });
      }
    } catch (err) {
      tokenErrors[account.name] = errMsg(err);
    }
  }

  // Created up front (sequentially — this is just N cheap inserts) so the
  // dashboard can show every profile's status from the moment the run
  // starts, not just the ones that have started so far.
  const syncRunProfileIds: string[] = [];
  for (const t of tasks) {
    const row = await prisma.syncRunProfile.create({
      data: { syncRunId: syncRun.id, label: `${t.accountName} — ${t.profile.entityName ?? t.profile.countryCode}` },
    });
    syncRunProfileIds.push(row.id);
  }

  const profileResults = await mapWithConcurrency(tasks, PROFILE_SYNC_CONCURRENCY, (task, i) => {
    const client = new AmazonAdsClient(task.region, task.accessToken, task.profile.profileId, () =>
      forceRefreshAccessToken(task.accountId)
    );
    return syncProfile(client, task.profile, syncRunProfileIds[i]);
  });

  const results: Record<string, ProfileSyncResult[]> = {};
  tasks.forEach((t, i) => {
    (results[t.accountName] ??= []).push(profileResults[i]);
  });
  for (const [accountName, message] of Object.entries(tokenErrors)) {
    results[accountName] = [{ profileId: "", errors: [`account sync failed: ${message}`] }];
  }

  const anyFailed = profileResults.some((r) => r.errors.length > 0) || Object.keys(tokenErrors).length > 0;
  await prisma.syncRun.update({
    where: { id: syncRun.id },
    data: { status: anyFailed ? "failed" : "completed", finishedAt: new Date() },
  });

  return results;
}
