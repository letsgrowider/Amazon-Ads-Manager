import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getKeywordBidHistory } from "@/lib/audit";
import { resolveDateRange } from "@/lib/date-range";
import { DateRangeControl } from "@/app/DateRangeControl";
import { BidEditor } from "@/app/keywords/BidEditor";
import { BidHistoryChart } from "@/app/keywords/[id]/BidHistoryChart";
import { formatMoney, currencySymbol } from "@/lib/currency";

export default async function KeywordDetailPage({
  params,
  searchParams,
}: PageProps<"/keywords/[id]">) {
  const { id } = await params;
  const range = resolveDateRange(await searchParams);

  const keyword = await prisma.keyword.findUnique({
    where: { id },
    include: { adGroup: { include: { campaign: { include: { profile: true } } } } },
  });
  if (!keyword) notFound();
  const currency = keyword.adGroup.campaign.profile.currencyCode;

  const [bidHistory, adGroupMetrics] = await Promise.all([
    getKeywordBidHistory(id),
    prisma.metricSnapshot.findMany({
      where: { entityType: "adGroup", adGroupId: keyword.adGroupId, date: { gte: range.since, lte: range.until } },
      orderBy: { date: "asc" },
    }),
  ]);

  const chartPoints = [
    ...bidHistory
      .filter((h) => h.oldBid !== null)
      .slice(0, 1)
      .map((h) => ({ date: h.date, bid: h.oldBid! })),
    ...bidHistory.filter((h) => h.newBid !== null).map((h) => ({ date: h.date, bid: h.newBid! })),
    { date: new Date(), bid: keyword.bid },
  ];

  const maxSpend = Math.max(1, ...adGroupMetrics.map((m) => m.spend));

  return (
    <div className="flex flex-col flex-1 items-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full max-w-3xl flex-col gap-8 py-16 px-8">
        <div>
          <Link href="/keywords" className="text-sm text-zinc-500 hover:underline">
            &larr; Keywords
          </Link>
          <h1 className="mt-1 text-2xl font-semibold text-black dark:text-zinc-50">{keyword.keywordText}</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {keyword.matchType} · {keyword.state} ·{" "}
            <Link href={`/campaigns/${keyword.adGroup.campaign.id}`} className="hover:underline">
              {keyword.adGroup.campaign.name}
            </Link>{" "}
            / {keyword.adGroup.name}
          </p>
          <div className="mt-3">
            <BidEditor keywordId={keyword.id} initialBid={keyword.bid} currencySymbol={currencySymbol(currency)} />
          </div>
        </div>

        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-zinc-500">Bid history</h2>
          <BidHistoryChart points={chartPoints} currencySymbol={currencySymbol(currency)} />
          {bidHistory.length === 0 ? (
            <p className="text-sm text-zinc-500">No bid changes logged yet — edit the bid above to start one.</p>
          ) : (
            <table className="w-full max-w-md text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-200 text-zinc-500 dark:border-zinc-800">
                  <th className="py-1">When</th>
                  <th className="py-1 text-right">From</th>
                  <th className="py-1 text-right">To</th>
                </tr>
              </thead>
              <tbody>
                {[...bidHistory].reverse().map((h, i) => (
                  <tr key={i} className="border-b border-zinc-100 dark:border-zinc-900">
                    <td className="py-1 text-zinc-500">{h.date.toISOString().slice(0, 16).replace("T", " ")}</td>
                    <td className="py-1 text-right text-zinc-600 dark:text-zinc-400">
                      {h.oldBid !== null ? formatMoney(h.oldBid, currency) : "—"}
                    </td>
                    <td className="py-1 text-right text-black dark:text-zinc-50">
                      {h.newBid !== null ? formatMoney(h.newBid, currency) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-medium text-zinc-500">
              Ad group performance — {range.label}
              <span className="ml-1 text-xs text-zinc-400">(ad-group level, not this keyword specifically)</span>
            </h2>
            <DateRangeControl range={range} basePath={`/keywords/${keyword.id}`} />
          </div>
          {adGroupMetrics.length === 0 ? (
            <p className="text-sm text-zinc-500">No metrics yet for this ad group in this range.</p>
          ) : (
            <div className="flex flex-col gap-1">
              {adGroupMetrics.map((m) => (
                <div key={m.id} className="flex items-center gap-3 text-xs">
                  <span className="w-20 text-zinc-500">{m.date.toISOString().slice(0, 10)}</span>
                  <div className="h-3 flex-1 rounded bg-zinc-100 dark:bg-zinc-900">
                    <div
                      className="h-3 rounded bg-blue-500"
                      style={{ width: `${(m.spend / maxSpend) * 100}%` }}
                    />
                  </div>
                  <span className="w-16 text-right text-zinc-600 dark:text-zinc-400">{formatMoney(m.spend, currency)}</span>
                  <span
                    className={`w-16 text-right ${m.acos > 40 ? "text-red-600 dark:text-red-400" : "text-zinc-600 dark:text-zinc-400"}`}
                  >
                    {m.acos.toFixed(1)}%
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
