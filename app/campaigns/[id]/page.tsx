import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getBidSuggestions } from "@/lib/bid-rules";
import { resolveDateRange, type DateRange } from "@/lib/date-range";
import { DateRangeControl } from "@/app/DateRangeControl";
import { TrendChart } from "@/app/TrendChart";
import { TargetAcosEditor } from "@/app/campaigns/[id]/TargetAcosEditor";
import { BidSuggestionsTable } from "@/app/campaigns/[id]/BidSuggestionsTable";
import { CampaignControls } from "@/app/campaigns/[id]/CampaignControls";
import { TagEditor } from "@/app/campaigns/[id]/TagEditor";
import { AdGroupBidEditor } from "@/app/campaigns/[id]/AdGroupBidEditor";
import { NotesEditor } from "@/app/campaigns/[id]/NotesEditor";
import { PlacementBidEditor } from "@/app/campaigns/[id]/PlacementBidEditor";
import { DaypartingEditor } from "@/app/campaigns/[id]/DaypartingEditor";
import { formatMoney, currencySymbol } from "@/lib/currency";

async function getCampaignDetail(id: string, range: DateRange) {
  const campaign = await prisma.campaign.findUnique({
    where: { id },
    include: { adGroups: true, profile: true },
  });
  if (!campaign) return null;

  const [dailyMetrics, adGroupSums] = await Promise.all([
    prisma.metricSnapshot.findMany({
      where: { entityType: "campaign", campaignId: campaign.id, date: { gte: range.since, lte: range.until } },
      orderBy: { date: "asc" },
    }),
    prisma.metricSnapshot.groupBy({
      by: ["adGroupId"],
      where: {
        entityType: "adGroup",
        adGroupId: { in: campaign.adGroups.map((a) => a.id) },
        date: { gte: range.since, lte: range.until },
      },
      _sum: { impressions: true, clicks: true, spend: true, sales: true, orders: true },
    }),
  ]);

  const sumsByAdGroup = new Map(adGroupSums.map((s) => [s.adGroupId, s._sum]));

  const totals = dailyMetrics.reduce(
    (acc, m) => ({
      spend: acc.spend + m.spend,
      sales: acc.sales + m.sales,
      clicks: acc.clicks + m.clicks,
      orders: acc.orders + m.orders,
    }),
    { spend: 0, sales: 0, clicks: 0, orders: 0 }
  );

  return { campaign, dailyMetrics, sumsByAdGroup, totals };
}

export default async function CampaignDetailPage({
  params,
  searchParams,
}: PageProps<"/campaigns/[id]">) {
  const { id } = await params;
  const range = resolveDateRange(await searchParams);
  const detail = await getCampaignDetail(id, range);
  if (!detail) notFound();

  const { campaign, dailyMetrics, sumsByAdGroup, totals } = detail;
  const acos = totals.sales > 0 ? (totals.spend / totals.sales) * 100 : 0;
  const roas = totals.spend > 0 ? totals.sales / totals.spend : 0;
  const currency = campaign.profile.currencyCode;

  const suggestions = await getBidSuggestions(id, range);
  const actionableSuggestions = suggestions.filter(
    (s) => s.suggestedBid !== null && Math.abs(s.suggestedBid - s.currentBid) >= 0.01
  );

  const adGroupRows = campaign.adGroups
    .map((adGroup) => {
      const sums = sumsByAdGroup.get(adGroup.id);
      const spend = sums?.spend ?? 0;
      const sales = sums?.sales ?? 0;
      return {
        adGroup,
        spend,
        sales,
        clicks: sums?.clicks ?? 0,
        orders: sums?.orders ?? 0,
        acos: sales > 0 ? (spend / sales) * 100 : 0,
        roas: spend > 0 ? sales / spend : 0,
      };
    })
    .sort((a, b) => b.spend - a.spend);

  return (
    <div className="flex flex-col flex-1 items-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full max-w-4xl flex-col gap-8 py-16 px-8">
        <div>
          <Link href="/campaigns" className="text-sm text-zinc-500 hover:underline">
            &larr; Campaigns
          </Link>
          <h1 className="mt-1 text-2xl font-semibold text-black dark:text-zinc-50">{campaign.name}</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {campaign.state} · {campaign.targetingType} · {formatMoney(campaign.dailyBudget, currency)}/day budget
          </p>

          {/* Primary, always-visible controls. Everything else (tags, notes,
              placement bids, dayparting) is secondary configuration you set
              once and rarely touch — tucked into a collapsible panel instead
              of always taking up screen space. */}
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <CampaignControls
              campaignId={campaign.id}
              initialState={campaign.state}
              initialDailyBudget={campaign.dailyBudget}
              currencySymbol={currencySymbol(currency)}
            />
            <TargetAcosEditor campaignId={campaign.id} initialTargetAcos={campaign.targetAcos} />
          </div>

          <details className="mt-3 rounded-lg border border-zinc-200 dark:border-zinc-800">
            <summary className="cursor-pointer px-4 py-2 text-sm font-medium text-zinc-600 dark:text-zinc-400">
              Tags, notes &amp; advanced settings
            </summary>
            <div className="flex flex-col gap-3 border-t border-zinc-200 p-4 dark:border-zinc-800">
              <TagEditor campaignId={campaign.id} initialTags={campaign.tags} />
              <NotesEditor campaignId={campaign.id} initialNotes={campaign.notes} />
              <PlacementBidEditor
                campaignId={campaign.id}
                initialPlacementBidding={
                  Array.isArray(campaign.placementBidding)
                    ? (campaign.placementBidding as { placement: string; percentage: number }[])
                    : []
                }
              />
              <DaypartingEditor
                campaignId={campaign.id}
                initialEnabled={campaign.daypartingEnabled}
                initialHours={campaign.daypartingHours}
              />
            </div>
          </details>
        </div>

        <section className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-medium text-zinc-500">Performance — {range.label}</h2>
            <DateRangeControl range={range} basePath={`/campaigns/${campaign.id}`} />
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
              <div className="text-xs text-zinc-500">Spend</div>
              <div className="text-lg font-semibold text-black dark:text-zinc-50">{formatMoney(totals.spend, currency)}</div>
            </div>
            <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
              <div className="text-xs text-zinc-500">Sales</div>
              <div className="text-lg font-semibold text-black dark:text-zinc-50">{formatMoney(totals.sales, currency)}</div>
            </div>
            <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
              <div className="text-xs text-zinc-500">ACOS</div>
              <div
                className={`text-lg font-semibold ${acos > 40 ? "text-red-600 dark:text-red-400" : "text-black dark:text-zinc-50"}`}
              >
                {acos.toFixed(1)}%
              </div>
            </div>
            <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
              <div className="text-xs text-zinc-500">ROAS</div>
              <div className="text-lg font-semibold text-black dark:text-zinc-50">{roas.toFixed(2)}x</div>
            </div>
          </div>

          {dailyMetrics.length === 0 ? (
            <p className="text-sm text-zinc-500">No metrics yet for this campaign in this range.</p>
          ) : (
            <>
              <p className="text-xs text-zinc-500">
                Sales use a 7-day attribution window — the last few days will keep rising as orders
                settle, not just today.
              </p>
              <TrendChart
              data={dailyMetrics.map((m) => ({
                date: m.date.toISOString().slice(0, 10),
                spend: m.spend,
                acos: m.acos,
              }))}
              barKey="spend"
              lineKey="acos"
              barLabel="Spend"
              lineLabel="ACOS"
                barUnit="currency"
                lineUnit="percent"
                currencySymbol={currencySymbol(currency)}
              />
            </>
          )}
        </section>

        {campaign.targetAcos !== null && (
          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-medium text-zinc-500">
              Bid suggestions — target {campaign.targetAcos.toFixed(1)}% ACOS
            </h2>
            {actionableSuggestions.length === 0 ? (
              <p className="text-sm text-zinc-500">
                No suggestions right now — either bids are already on target, or there&apos;s no ad-group
                performance data yet in this range.
              </p>
            ) : (
              <BidSuggestionsTable
                rows={actionableSuggestions.map((s) => ({
                  keywordId: s.keywordId,
                  keywordText: s.keywordText,
                  adGroupName: s.adGroupName,
                  adGroupAcos: s.adGroupAcos,
                  currentBid: s.currentBid,
                  suggestedBid: s.suggestedBid!,
                }))}
                currency={currency}
              />
            )}
          </section>
        )}

        <section className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-medium text-zinc-500">Ad groups</h2>
            <Link
              href={`/keywords?campaign=${campaign.campaignId}`}
              className="text-sm text-zinc-500 hover:underline"
            >
              View keywords &rarr;
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-200 text-zinc-500 dark:border-zinc-800">
                  <th className="py-2 pr-3">Ad group</th>
                  <th className="py-2 px-3 text-right">Clicks</th>
                  <th className="py-2 px-3 text-right">Spend</th>
                  <th className="py-2 px-3 text-right">Sales</th>
                  <th className="py-2 px-3 text-right">Orders</th>
                  <th className="py-2 px-3 text-right">ACOS</th>
                  <th className="py-2 px-3 text-right">ROAS</th>
                  <th className="py-2 pl-3">Default bid</th>
                </tr>
              </thead>
              <tbody>
                {adGroupRows.map(({ adGroup, spend, sales, clicks, orders, acos: agAcos, roas: agRoas }) => (
                  <tr key={adGroup.id} className="border-b border-zinc-100 dark:border-zinc-900">
                    <td className="py-2 pr-3 text-black dark:text-zinc-50">{adGroup.name}</td>
                    <td className="py-2 px-3 text-right text-zinc-600 dark:text-zinc-400">{clicks}</td>
                    <td className="py-2 px-3 text-right text-zinc-600 dark:text-zinc-400">{formatMoney(spend, currency)}</td>
                    <td className="py-2 px-3 text-right text-zinc-600 dark:text-zinc-400">{formatMoney(sales, currency)}</td>
                    <td className="py-2 px-3 text-right text-zinc-600 dark:text-zinc-400">{orders}</td>
                    <td
                      className={`py-2 px-3 text-right ${agAcos > 40 ? "text-red-600 dark:text-red-400" : "text-zinc-600 dark:text-zinc-400"}`}
                    >
                      {agAcos.toFixed(1)}%
                    </td>
                    <td className="py-2 px-3 text-right text-zinc-600 dark:text-zinc-400">{agRoas.toFixed(2)}x</td>
                    <td className="py-2 pl-3">
                      <AdGroupBidEditor
                        adGroupId={adGroup.id}
                        initialDefaultBid={adGroup.defaultBid}
                        currencySymbol={currencySymbol(currency)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}
