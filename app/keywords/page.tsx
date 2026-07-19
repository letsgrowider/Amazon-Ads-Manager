import Link from "next/link";
import { prisma } from "@/lib/db";
import { KeywordsTable } from "@/app/keywords/KeywordsTable";
import { getKeywordRows, type KeywordSortBy } from "@/lib/reporting";
import { resolveDateRange, rangeToQuery } from "@/lib/date-range";
import { DateRangeControl } from "@/app/DateRangeControl";
import { SavedViews } from "@/app/SavedViews";

const SORT_KEYS: KeywordSortBy[] = ["spend", "clicks", "orders", "acos", "roas", "bid"];

export default async function KeywordsPage({ searchParams }: PageProps<"/keywords">) {
  const resolvedSearchParams = await searchParams;
  const range = resolveDateRange(resolvedSearchParams);
  const campaignId = typeof resolvedSearchParams.campaign === "string" ? resolvedSearchParams.campaign : undefined;
  const search = typeof resolvedSearchParams.q === "string" && resolvedSearchParams.q.trim() ? resolvedSearchParams.q.trim() : undefined;
  const sortBy: KeywordSortBy = SORT_KEYS.includes(resolvedSearchParams.sort as KeywordSortBy)
    ? (resolvedSearchParams.sort as KeywordSortBy)
    : "spend";
  const sortDir: "asc" | "desc" = resolvedSearchParams.dir === "asc" ? "asc" : "desc";

  const [rows, campaigns] = await Promise.all([
    getKeywordRows(range, { campaignId, search, sortBy, sortDir }),
    prisma.campaign.findMany({
      where: { state: { in: ["enabled", "paused"] } },
      select: { campaignId: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const rangeQs = rangeToQuery(range);
  const campaignQs = campaignId ? `&campaign=${encodeURIComponent(campaignId)}` : "";
  const searchQs = search ? `&q=${encodeURIComponent(search)}` : "";

  return (
    <div className="flex flex-col flex-1 items-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full max-w-6xl flex-col gap-6 py-16 px-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <Link href="/" className="text-sm text-zinc-500 hover:underline">
              &larr; Dashboard
            </Link>
            <h1 className="mt-1 text-2xl font-semibold text-black dark:text-zinc-50">Keywords</h1>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <DateRangeControl range={range} basePath="/keywords" />
            <a
              href={`/api/export/keywords?${rangeQs}${campaignQs}${searchQs}`}
              className="text-sm text-zinc-500 hover:underline"
            >
              Export CSV
            </a>
          </div>
        </div>

        <form method="GET" action="/keywords" className="flex flex-wrap items-center gap-2 text-sm">
          <input type="hidden" name="days" value={range.days} />
          {range.days === "custom" && (
            <>
              <input type="hidden" name="from" value={range.from} />
              <input type="hidden" name="to" value={range.to} />
            </>
          )}
          <input type="hidden" name="sort" value={sortBy} />
          <input type="hidden" name="dir" value={sortDir} />
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
            placeholder="Search keyword text..."
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
            No keywords yet. Run a sync (or <code>npm run seed</code> for demo data).
          </p>
        ) : (
          <KeywordsTable
            keywords={rows.map(({ keyword, campaignName, adGroupName, currencyCode, clicks, spend, orders, acos, roas }) => ({
              id: keyword.id,
              keywordText: keyword.keywordText,
              matchType: keyword.matchType,
              bid: keyword.bid,
              campaignName,
              adGroupName,
              currencyCode,
              clicks,
              spend,
              orders,
              acos,
              roas,
            }))}
            rangeQs={rangeQs}
            campaignQs={`${campaignQs}${searchQs}`}
            sortBy={sortBy}
            sortDir={sortDir}
          />
        )}
      </main>
    </div>
  );
}
