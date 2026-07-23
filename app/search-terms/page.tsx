import Link from "next/link";
import { prisma } from "@/lib/db";
import { AddNegativeButton } from "@/app/search-terms/AddNegativeButton";
import { AddHarvestButton } from "@/app/search-terms/AddHarvestButton";
import {
  getSearchTermRows,
  MIN_WASTED_SPEND,
  HARVEST_MIN_CLICKS,
  HARVEST_MIN_ORDERS,
  type SearchTermSortBy,
} from "@/lib/reporting";
import { resolveDateRange, rangeToQuery } from "@/lib/date-range";
import { DateRangeControl } from "@/app/DateRangeControl";
import { SavedViews } from "@/app/SavedViews";
import { AccountSwitcher } from "@/app/AccountSwitcher";
import { SearchTermsSubNav } from "@/app/search-terms/SearchTermsSubNav";
import { formatMoney } from "@/lib/currency";

const SORT_KEYS: SearchTermSortBy[] = ["spend", "clicks", "orders", "acos", "roas"];

export default async function SearchTermsPage({ searchParams }: PageProps<"/search-terms">) {
  const resolvedSearchParams = await searchParams;
  const range = resolveDateRange(resolvedSearchParams);
  const profileId = typeof resolvedSearchParams.profile === "string" ? resolvedSearchParams.profile : undefined;
  const campaignId = typeof resolvedSearchParams.campaign === "string" ? resolvedSearchParams.campaign : undefined;
  const search = typeof resolvedSearchParams.q === "string" && resolvedSearchParams.q.trim() ? resolvedSearchParams.q.trim() : undefined;
  const sortBy: SearchTermSortBy = SORT_KEYS.includes(resolvedSearchParams.sort as SearchTermSortBy)
    ? (resolvedSearchParams.sort as SearchTermSortBy)
    : "spend";
  const sortDir: "asc" | "desc" = resolvedSearchParams.dir === "asc" ? "asc" : "desc";

  const accounts = await prisma.amazonAccount.findMany({
    select: { name: true, profiles: { select: { id: true, countryCode: true, entityName: true } } },
  });
  const profileOptions = accounts.flatMap((a) =>
    a.profiles.map((p) => ({ id: p.id, countryCode: p.countryCode, accountName: a.name, entityName: p.entityName }))
  );

  const [rows, campaigns] = await Promise.all([
    getSearchTermRows(range, { campaignId, profileId, search, sortBy, sortDir }),
    prisma.campaign.findMany({
      where: { state: { in: ["enabled", "paused"] }, ...(profileId ? { profileId } : {}) },
      select: { campaignId: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const negativeCandidateCount = rows.filter((r) => r.isWastedSpend).length;
  const harvestCandidateCount = rows.filter((r) => r.isHarvestCandidate).length;

  const rangeQs = rangeToQuery(range);
  const profileQs = profileId ? `&profile=${profileId}` : "";
  const campaignQs = campaignId ? `&campaign=${encodeURIComponent(campaignId)}` : "";
  const searchQs = search ? `&q=${encodeURIComponent(search)}` : "";

  function sortHref(key: SearchTermSortBy) {
    const nextDir = sortBy === key && sortDir === "desc" ? "asc" : "desc";
    return `/search-terms?${rangeQs}${profileQs}${campaignQs}${searchQs}&sort=${key}&dir=${nextDir}`;
  }

  function sortIndicator(key: SearchTermSortBy) {
    if (sortBy !== key) return null;
    return sortDir === "desc" ? " ↓" : " ↑";
  }

  return (
    <div className="flex flex-col flex-1 items-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full max-w-6xl flex-col gap-6 py-16 px-8">
        <SearchTermsSubNav />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">Search Terms</h1>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            {negativeCandidateCount > 0 && (
              <p className="text-sm text-amber-600 dark:text-amber-400">
                {negativeCandidateCount} negative candidate{negativeCandidateCount === 1 ? "" : "s"} (spend ≥ $
                {MIN_WASTED_SPEND}, zero orders)
              </p>
            )}
            {harvestCandidateCount > 0 && (
              <p className="text-sm text-green-600 dark:text-green-400">
                {harvestCandidateCount} harvest candidate{harvestCandidateCount === 1 ? "" : "s"} (≥
                {HARVEST_MIN_ORDERS} order, ≥{HARVEST_MIN_CLICKS} clicks)
              </p>
            )}
            <DateRangeControl
              range={range}
              basePath="/search-terms"
              extraQuery={`${profileQs}${campaignQs}${searchQs}&sort=${sortBy}&dir=${sortDir}`.replace(/^&/, "")}
            />
            <a
              href={`/api/export/search-terms?${rangeQs}${profileQs}${campaignQs}${searchQs}`}
              className="text-sm text-zinc-500 hover:underline"
            >
              Export CSV
            </a>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <AccountSwitcher
            profiles={profileOptions}
            activeProfileId={profileId}
            basePath="/search-terms"
            extraQuery={`${rangeQs}${campaignQs}${searchQs}&sort=${sortBy}&dir=${sortDir}`}
          />
        </div>

        <form method="GET" action="/search-terms" className="flex flex-wrap items-center gap-2 text-sm">
          <input type="hidden" name="days" value={range.days} />
          {range.days === "custom" && (
            <>
              <input type="hidden" name="from" value={range.from} />
              <input type="hidden" name="to" value={range.to} />
            </>
          )}
          <input type="hidden" name="sort" value={sortBy} />
          <input type="hidden" name="dir" value={sortDir} />
          {profileId && <input type="hidden" name="profile" value={profileId} />}
          <label className="text-zinc-500">Campaign:</label>
          <select
            name="campaign"
            defaultValue={campaignId ?? ""}
            className="max-w-xs rounded border border-zinc-300 bg-transparent px-2 py-1 text-xs dark:border-zinc-700"
          >
            <option value="">All campaigns</option>
            {campaigns.map((c) => (
              <option key={c.campaignId} value={c.campaignId}>
                {c.name}
              </option>
            ))}
          </select>
          <input
            type="text"
            name="q"
            defaultValue={search ?? ""}
            placeholder="Search term text..."
            className="rounded border border-zinc-300 bg-transparent px-2 py-1 text-xs dark:border-zinc-700"
          />
          <button
            type="submit"
            className="rounded-full border border-zinc-300 px-3 py-1 text-xs font-medium hover:bg-black/[.04] dark:border-zinc-700 dark:hover:bg-white/[.06]"
          >
            Filter
          </button>
        </form>

        <SavedViews />

        {rows.length === 0 ? (
          <p className="text-zinc-600 dark:text-zinc-400">
            No search term data yet. Run a sync (or <code>npm run seed</code> for demo data).
          </p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-zinc-500 dark:border-zinc-800">
                <th className="py-2">Search term</th>
                <th className="py-2">Campaign / Ad group</th>
                <th className="py-2 text-right">
                  <Link href={sortHref("clicks")} className="hover:underline">
                    Clicks{sortIndicator("clicks")}
                  </Link>
                </th>
                <th className="py-2 text-right">
                  <Link href={sortHref("spend")} className="hover:underline">
                    Cost{sortIndicator("spend")}
                  </Link>
                </th>
                <th className="py-2 text-right">
                  <Link href={sortHref("orders")} className="hover:underline">
                    Orders{sortIndicator("orders")}
                  </Link>
                </th>
                <th className="py-2 text-right">
                  <Link href={sortHref("acos")} className="hover:underline">
                    ACOS{sortIndicator("acos")}
                  </Link>
                </th>
                <th className="py-2 text-right">
                  <Link href={sortHref("roas")} className="hover:underline">
                    ROAS{sortIndicator("roas")}
                  </Link>
                </th>
                <th className="py-2"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ row, campaignName, adGroupName, currencyCode, acos, roas, isWastedSpend, isHarvestCandidate }) => (
                <tr key={row.id} className="border-b border-zinc-100 dark:border-zinc-900">
                  <td className="py-2 text-black dark:text-zinc-50">{row.searchTerm}</td>
                  <td className="py-2 text-zinc-600 dark:text-zinc-400">
                    <div>{campaignName}</div>
                    <div className="text-xs text-zinc-500">{adGroupName}</div>
                  </td>
                  <td className="py-2 text-right text-zinc-600 dark:text-zinc-400">{row.clicks}</td>
                  <td
                    className={`py-2 text-right ${isWastedSpend ? "font-medium text-red-600 dark:text-red-400" : "text-zinc-600 dark:text-zinc-400"}`}
                  >
                    {formatMoney(row.spend, currencyCode)}
                  </td>
                  <td
                    className={`py-2 text-right ${isHarvestCandidate ? "font-medium text-green-600 dark:text-green-400" : "text-zinc-600 dark:text-zinc-400"}`}
                  >
                    {row.orders}
                  </td>
                  <td className="py-2 text-right text-zinc-600 dark:text-zinc-400">{acos.toFixed(1)}%</td>
                  <td className="py-2 text-right text-zinc-600 dark:text-zinc-400">{roas.toFixed(2)}x</td>
                  <td className="py-2 text-right">
                    {isWastedSpend && (
                      <AddNegativeButton searchTerm={row.searchTerm} adGroupAmazonId={row.adGroupId} />
                    )}
                    {isHarvestCandidate && (
                      <AddHarvestButton
                        searchTerm={row.searchTerm}
                        adGroupAmazonId={row.adGroupId}
                        spend={row.spend}
                        clicks={row.clicks}
                      />
                    )}
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
