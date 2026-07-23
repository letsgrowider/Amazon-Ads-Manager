import Link from "next/link";
import { prisma } from "@/lib/db";
import { SyncButton } from "@/app/SyncButton";
import { SyncStatus } from "@/app/SyncStatus";
import { DaypartingRunButton } from "@/app/DaypartingRunButton";
import { DateRangeControl } from "@/app/DateRangeControl";
import { AccountSwitcher } from "@/app/AccountSwitcher";
import {
  getAccountSummary,
  getAccountDailyTrend,
  getBudgetConstrainedCampaigns,
  getLastSyncedAt,
  getQueuedSuggestionCounts,
  ALERT_ACOS_THRESHOLD,
} from "@/lib/reporting";
import { resolveDateRange, previousPeriod, percentChange, rangeToQuery } from "@/lib/date-range";
import { ChangeBadge } from "@/app/ChangeBadge";
import { TrendChart } from "@/app/TrendChart";
import { formatMoney, currencySymbol, uniformCurrency } from "@/lib/currency";
import {
  getEstimatedSavings,
  getOptimizationScore,
  getAchievements,
  getProfileLeaderboard,
} from "@/lib/gamification";

async function getAccounts() {
  try {
    return await prisma.amazonAccount.findMany({
      include: { profiles: { include: { _count: { select: { campaigns: true } } } } },
    });
  } catch {
    // DB not migrated/connected yet — scaffold still renders.
    return null;
  }
}

const STALE_SYNC_HOURS = 24;

function timeAgo(date: Date): string {
  const minutes = Math.round((Date.now() - date.getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export default async function Home({ searchParams }: PageProps<"/">) {
  const resolvedSearchParams = await searchParams;
  const range = resolveDateRange(resolvedSearchParams);
  const profileId = typeof resolvedSearchParams.profile === "string" ? resolvedSearchParams.profile : undefined;
  const accounts = await getAccounts();
  const hasAccounts = accounts !== null && accounts.length > 0;
  const connectedRegions = new Set((accounts ?? []).map((a) => a.region));
  const profileOptions = (accounts ?? []).flatMap((a) =>
    a.profiles.map((p) => ({
      id: p.id,
      countryCode: p.countryCode,
      accountName: a.name,
      entityName: p.entityName,
      currencyCode: p.currencyCode,
    }))
  );
  // A specific profile has one real currency; "All accounts" only gets one
  // if every connected profile happens to share the same currency — mixing
  // USD and INR totals under one symbol would just be wrong, not just
  // imprecise, so it falls back to the generic "$" rather than guess.
  const activeCurrency = profileId
    ? profileOptions.find((p) => p.id === profileId)?.currencyCode
    : uniformCurrency(profileOptions.map((p) => p.currencyCode));
  const summary = hasAccounts ? await getAccountSummary(range, profileId) : null;
  const prevSummary = hasAccounts ? await getAccountSummary(previousPeriod(range), profileId) : null;
  const trend = hasAccounts ? await getAccountDailyTrend(range, profileId) : [];
  const budgetConstrained = hasAccounts ? await getBudgetConstrainedCampaigns(profileId) : [];
  const lastSyncedAt = hasAccounts ? await getLastSyncedAt(profileId) : null;
  const suggestionCounts = hasAccounts ? await getQueuedSuggestionCounts() : { negativeKeywords: 0, keywordHarvest: 0 };
  const syncIsStale = lastSyncedAt !== null && Date.now() - lastSyncedAt.getTime() > STALE_SYNC_HOURS * 3600_000;
  const estimatedSavings = hasAccounts ? await getEstimatedSavings(profileId) : 0;
  const optimizationScore = hasAccounts ? await getOptimizationScore(profileId) : null;
  const achievements = hasAccounts ? await getAchievements() : [];
  const leaderboard = hasAccounts && !profileId && profileOptions.length > 1 ? await getProfileLeaderboard(range) : [];

  return (
    <div className="flex flex-col flex-1 items-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full max-w-4xl flex-col gap-8 py-16 px-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">
              RankWider
            </h1>
            {hasAccounts && (
              <p className={`mt-0.5 text-xs ${syncIsStale ? "text-amber-600 dark:text-amber-400" : "text-zinc-500"}`}>
                {lastSyncedAt ? (
                  <>
                    Last synced {timeAgo(lastSyncedAt)}
                    {syncIsStale ? " — data may be out of date" : ""}
                  </>
                ) : (
                  "Never synced"
                )}
              </p>
            )}
          </div>
          {hasAccounts && (
            <form method="GET" action="/search" className="flex items-center gap-2">
              <input
                type="text"
                name="q"
                placeholder="Search..."
                className="w-40 rounded-full border border-zinc-300 bg-transparent px-3 py-1.5 text-sm dark:border-zinc-700"
              />
            </form>
          )}
        </div>
        <div className="flex justify-end">
          <div className="flex flex-wrap justify-end gap-3">
            {accounts !== null && accounts.length > 0 && (
              <Link
                href="/campaigns"
                className="rounded-full border border-zinc-300 px-5 py-2.5 text-sm font-medium text-black transition-colors hover:bg-black/[.04] dark:border-zinc-700 dark:text-zinc-50 dark:hover:bg-white/[.06]"
              >
                View Campaigns
              </Link>
            )}
            {accounts !== null && accounts.length > 0 && (
              <Link
                href="/search-terms"
                className="rounded-full border border-zinc-300 px-5 py-2.5 text-sm font-medium text-black transition-colors hover:bg-black/[.04] dark:border-zinc-700 dark:text-zinc-50 dark:hover:bg-white/[.06]"
              >
                Search Terms
              </Link>
            )}
            {accounts !== null && accounts.length > 0 && (
              <Link
                href="/negative-keywords"
                className="rounded-full border border-zinc-300 px-5 py-2.5 text-sm font-medium text-black transition-colors hover:bg-black/[.04] dark:border-zinc-700 dark:text-zinc-50 dark:hover:bg-white/[.06]"
              >
                Negative Keywords
                {suggestionCounts.negativeKeywords > 0 && (
                  <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                    {suggestionCounts.negativeKeywords}
                  </span>
                )}
              </Link>
            )}
            {accounts !== null && accounts.length > 0 && (
              <Link
                href="/keyword-harvest"
                className="rounded-full border border-zinc-300 px-5 py-2.5 text-sm font-medium text-black transition-colors hover:bg-black/[.04] dark:border-zinc-700 dark:text-zinc-50 dark:hover:bg-white/[.06]"
              >
                Keyword Harvest
                {suggestionCounts.keywordHarvest > 0 && (
                  <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                    {suggestionCounts.keywordHarvest}
                  </span>
                )}
              </Link>
            )}
            {accounts !== null && accounts.length > 0 && (
              <Link
                href="/keywords"
                className="rounded-full border border-zinc-300 px-5 py-2.5 text-sm font-medium text-black transition-colors hover:bg-black/[.04] dark:border-zinc-700 dark:text-zinc-50 dark:hover:bg-white/[.06]"
              >
                Keywords
              </Link>
            )}
            {accounts !== null && accounts.length > 0 && (
              <Link
                href="/history"
                className="rounded-full border border-zinc-300 px-5 py-2.5 text-sm font-medium text-black transition-colors hover:bg-black/[.04] dark:border-zinc-700 dark:text-zinc-50 dark:hover:bg-white/[.06]"
              >
                History
              </Link>
            )}
            {accounts !== null && accounts.length > 0 && (
              <Link
                href="/accounts"
                className="rounded-full border border-zinc-300 px-5 py-2.5 text-sm font-medium text-black transition-colors hover:bg-black/[.04] dark:border-zinc-700 dark:text-zinc-50 dark:hover:bg-white/[.06]"
              >
                Manage Accounts
              </Link>
            )}
            {accounts !== null && accounts.length > 0 && <SyncButton />}
            {accounts !== null && accounts.length > 0 && <DaypartingRunButton />}
            <a
              href="/api/auth/amazon/authorize?region=NA"
              className="rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]"
            >
              Connect Amazon Ads Account
            </a>
            {/* Amazon Ads profiles are region-scoped (NA/EU/FE) — a login's
                other advertiser accounts only show up if they're in one of
                these regions AND that login has been granted access to them
                in Amazon Ads' own account settings. */}
            {!connectedRegions.has("EU") && (
              <a
                href="/api/auth/amazon/authorize?region=EU"
                className="rounded-full border border-zinc-300 px-4 py-2.5 text-xs font-medium text-zinc-600 transition-colors hover:bg-black/[.04] dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-white/[.06]"
              >
                + Connect EU account
              </a>
            )}
            {!connectedRegions.has("FE") && (
              <a
                href="/api/auth/amazon/authorize?region=FE"
                className="rounded-full border border-zinc-300 px-4 py-2.5 text-xs font-medium text-zinc-600 transition-colors hover:bg-black/[.04] dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-white/[.06]"
              >
                + Connect FE account
              </a>
            )}
          </div>
        </div>

        {hasAccounts && <SyncStatus />}

        {accounts === null && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
            Database not connected. Set <code>DATABASE_URL</code> in <code>.env</code> and run{" "}
            <code>npx prisma migrate dev</code> before connecting an account.
          </div>
        )}

        {accounts !== null && accounts.length === 0 && (
          <p className="text-zinc-600 dark:text-zinc-400">
            No Amazon Ads accounts connected yet. Click &quot;Connect Amazon Ads Account&quot; to start
            the LWA authorization flow.
          </p>
        )}

        {summary && (
          <section className="flex flex-col gap-6">
            <div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-sm font-medium text-zinc-500">Account summary — {range.label}</h2>
                <div className="flex flex-wrap items-center gap-3">
                  <AccountSwitcher
                    profiles={profileOptions}
                    activeProfileId={profileId}
                    basePath="/"
                    extraQuery={rangeToQuery(range)}
                  />
                  <DateRangeControl range={range} basePath="/" extraQuery={profileId ? `profile=${profileId}` : ""} />
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
                <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
                  <div className="text-xs text-zinc-500">Spend</div>
                  <div className="text-xl font-semibold text-black dark:text-zinc-50">
                    {formatMoney(summary.spend, activeCurrency)}
                  </div>
                  {prevSummary && (
                    <ChangeBadge pct={percentChange(summary.spend, prevSummary.spend)} neutral />
                  )}
                </div>
                <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
                  <div className="text-xs text-zinc-500">Sales</div>
                  <div className="text-xl font-semibold text-black dark:text-zinc-50">
                    {formatMoney(summary.sales, activeCurrency)}
                  </div>
                  {prevSummary && <ChangeBadge pct={percentChange(summary.sales, prevSummary.sales)} />}
                </div>
                <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
                  <div className="text-xs text-zinc-500" title="Ad-attributed sales only — not true TACOS, which needs organic sales from SP-API">
                    ACOS (ad-attributed)
                  </div>
                  <div
                    className={`text-xl font-semibold ${summary.acos > ALERT_ACOS_THRESHOLD ? "text-red-600 dark:text-red-400" : "text-black dark:text-zinc-50"}`}
                  >
                    {summary.acos.toFixed(1)}%
                  </div>
                  {prevSummary && <ChangeBadge pct={percentChange(summary.acos, prevSummary.acos)} invert />}
                </div>
                <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
                  <div className="text-xs text-zinc-500">Active campaigns</div>
                  <div className="text-xl font-semibold text-black dark:text-zinc-50">
                    {summary.activeCampaigns} / {summary.totalCampaigns}
                  </div>
                </div>
              </div>
            </div>

            {summary.alerts.length > 0 && (
              <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm dark:border-red-900 dark:bg-red-950">
                <div className="font-medium text-red-900 dark:text-red-200">
                  {summary.alerts.length} campaign{summary.alerts.length === 1 ? "" : "s"} above{" "}
                  {ALERT_ACOS_THRESHOLD}% ACOS
                </div>
                <ul className="mt-2 flex flex-col gap-1">
                  {summary.alerts.map((a) => (
                    <li key={a.campaign.id}>
                      <Link href={`/campaigns/${a.campaign.id}`} className="text-red-800 hover:underline dark:text-red-300">
                        {a.campaign.name}
                      </Link>{" "}
                      <span className="text-red-700 dark:text-red-400">
                        — {a.acos.toFixed(1)}% ACOS on {formatMoney(a.spend, activeCurrency)} spend
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {budgetConstrained.length > 0 && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm dark:border-amber-900 dark:bg-amber-950">
                <div className="font-medium text-amber-900 dark:text-amber-200">
                  {budgetConstrained.length} campaign{budgetConstrained.length === 1 ? "" : "s"} likely
                  budget-constrained
                </div>
                <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
                  Based on the most recent synced day only (spend ≥ 90% of daily budget) — not live
                  intraday pacing.
                </p>
                <ul className="mt-2 flex flex-col gap-1">
                  {budgetConstrained.map((b) => (
                    <li key={b.campaign.id}>
                      <Link
                        href={`/campaigns/${b.campaign.id}`}
                        className="text-amber-800 hover:underline dark:text-amber-300"
                      >
                        {b.campaign.name}
                      </Link>{" "}
                      <span className="text-amber-700 dark:text-amber-400">
                        — {formatMoney(b.spend, activeCurrency)} of {formatMoney(b.campaign.dailyBudget, activeCurrency)} budget (
                        {(b.utilization * 100).toFixed(0)}%) on {b.date.toISOString().slice(0, 10)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {trend.length > 0 && (
              <div className="flex flex-col gap-1">
                <h2 className="text-sm font-medium text-zinc-500">Daily spend &amp; ACOS trend</h2>
                <p className="text-xs text-zinc-500">
                  Sales use a 7-day attribution window — the last few days will keep rising as orders
                  settle, not just today.
                </p>
                <TrendChart
                  data={trend.map((t) => ({ date: t.date.toISOString().slice(0, 10), spend: t.spend, acos: t.acos }))}
                  barKey="spend"
                  lineKey="acos"
                  barLabel="Spend"
                  lineLabel="ACOS"
                  barUnit="currency"
                  lineUnit="percent"
                  currencySymbol={currencySymbol(activeCurrency)}
                />
              </div>
            )}
          </section>
        )}

        {hasAccounts && optimizationScore && (
          <section className="flex flex-col gap-4">
            <h2 className="text-sm font-medium text-zinc-500">Performance</h2>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
                <div className="text-xs text-zinc-500" title="Est. from bid cuts you've made — old bid minus new bid, times clicks in the 30 days after">
                  Estimated savings
                </div>
                <div className="text-xl font-semibold text-green-600 dark:text-green-400">
                  {formatMoney(estimatedSavings, activeCurrency)}
                </div>
              </div>
              <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
                <div className="text-xs text-zinc-500">Optimization score</div>
                <div className="flex items-center gap-2">
                  <div className="text-xl font-semibold text-black dark:text-zinc-50">
                    {optimizationScore.score}
                    <span className="text-sm text-zinc-400">/100</span>
                  </div>
                </div>
                <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                  <div
                    className={`h-full rounded-full ${optimizationScore.score >= 70 ? "bg-green-500" : optimizationScore.score >= 40 ? "bg-amber-500" : "bg-red-500"}`}
                    style={{ width: `${optimizationScore.score}%` }}
                  />
                </div>
              </div>
              <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
                <div className="text-xs text-zinc-500">Achievements</div>
                <div className="text-xl font-semibold text-black dark:text-zinc-50">
                  {achievements.filter((a) => a.achieved).length} / {achievements.length}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {achievements.map((a) => (
                <span
                  key={a.id}
                  title={a.description}
                  className={`rounded-full border px-3 py-1 text-xs font-medium ${
                    a.achieved
                      ? "border-green-300 bg-green-50 text-green-800 dark:border-green-900 dark:bg-green-950 dark:text-green-300"
                      : "border-zinc-200 text-zinc-400 dark:border-zinc-800 dark:text-zinc-600"
                  }`}
                >
                  {a.achieved ? "✓ " : "○ "}
                  {a.label}
                </span>
              ))}
            </div>

            {leaderboard.length > 0 && (
              <div className="flex flex-col gap-1">
                <h3 className="text-sm font-medium text-zinc-500">Leaderboard — ACOS improvement vs. previous period</h3>
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-zinc-200 text-zinc-500 dark:border-zinc-800">
                      <th className="py-2">Profile</th>
                      <th className="py-2 text-right">ACOS</th>
                      <th className="py-2 text-right">Previous</th>
                      <th className="py-2 text-right">Change</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leaderboard.map((entry, i) => (
                      <tr key={entry.profileId} className="border-b border-zinc-100 dark:border-zinc-900">
                        <td className="py-2 text-black dark:text-zinc-50">
                          {i === 0 && entry.improvement > 0 ? "🏆 " : ""}
                          {entry.label}
                        </td>
                        <td className="py-2 text-right text-zinc-600 dark:text-zinc-400">{entry.acos.toFixed(1)}%</td>
                        <td className="py-2 text-right text-zinc-600 dark:text-zinc-400">{entry.prevAcos.toFixed(1)}%</td>
                        <td className="py-2 text-right">
                          <ChangeBadge pct={entry.prevAcos > 0 ? ((entry.acos - entry.prevAcos) / entry.prevAcos) * 100 : 0} invert />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {accounts !== null && accounts.length > 0 && (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-zinc-500 dark:border-zinc-800">
                <th className="py-2">Account</th>
                <th className="py-2">Region</th>
                <th className="py-2">Profiles</th>
                <th className="py-2">Campaigns</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((account) => (
                <tr key={account.id} className="border-b border-zinc-100 dark:border-zinc-900">
                  <td className="py-2 text-black dark:text-zinc-50">{account.name}</td>
                  <td className="py-2 text-zinc-600 dark:text-zinc-400">{account.region}</td>
                  <td className="py-2 text-zinc-600 dark:text-zinc-400">
                    {account.profiles.length}
                  </td>
                  <td className="py-2 text-zinc-600 dark:text-zinc-400">
                    {account.profiles.reduce((sum, p) => sum + p._count.campaigns, 0)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </main>
    </div>
  );
}
