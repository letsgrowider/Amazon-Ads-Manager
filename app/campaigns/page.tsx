import Link from "next/link";
import { prisma } from "@/lib/db";
import { getCampaignRows, type CampaignStateFilter } from "@/lib/reporting";
import { resolveDateRange, rangeToQuery, previousPeriod } from "@/lib/date-range";
import { DateRangeControl } from "@/app/DateRangeControl";
import { AccountSwitcher } from "@/app/AccountSwitcher";
import { CampaignsTable } from "@/app/campaigns/CampaignsTable";

export default async function CampaignsPage({ searchParams }: PageProps<"/campaigns">) {
  const resolvedSearchParams = await searchParams;
  const range = resolveDateRange(resolvedSearchParams);
  const activeTag = typeof resolvedSearchParams.tag === "string" ? resolvedSearchParams.tag : undefined;
  const profileId = typeof resolvedSearchParams.profile === "string" ? resolvedSearchParams.profile : undefined;
  const stateFilter: CampaignStateFilter =
    resolvedSearchParams.state === "enabled" || resolvedSearchParams.state === "paused" ? resolvedSearchParams.state : "both";

  const accounts = await prisma.amazonAccount.findMany({
    select: { name: true, profiles: { select: { id: true, countryCode: true, entityName: true } } },
  });
  const profileOptions = accounts.flatMap((a) =>
    a.profiles.map((p) => ({ id: p.id, countryCode: p.countryCode, accountName: a.name, entityName: p.entityName }))
  );
  const allRows = await getCampaignRows(range, profileId, stateFilter);
  const prevRows = await getCampaignRows(previousPeriod(range), profileId, stateFilter);
  const prevAcosByCampaign = new Map(prevRows.map((r) => [r.campaign.id, r.acos]));

  const allTags = [...new Set(allRows.flatMap((r) => r.campaign.tags))].sort();
  const rows = activeTag ? allRows.filter((r) => r.campaign.tags.includes(activeTag)) : allRows;

  const rangeQs = rangeToQuery(range);
  const tagQs = activeTag ? `&tag=${encodeURIComponent(activeTag)}` : "";
  const stateQs = stateFilter !== "both" ? `&state=${stateFilter}` : "";
  const profileQs = profileId ? `&profile=${profileId}` : "";

  return (
    <div className="flex flex-col flex-1 items-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full max-w-5xl flex-col gap-6 py-16 px-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <Link href="/" className="text-sm text-zinc-500 hover:underline">
              &larr; Dashboard
            </Link>
            <h1 className="mt-1 text-2xl font-semibold text-black dark:text-zinc-50">Campaigns</h1>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <AccountSwitcher
              profiles={profileOptions}
              activeProfileId={profileId}
              basePath="/campaigns"
              extraQuery={`${rangeQs}${tagQs}${stateQs}`}
            />
            <DateRangeControl range={range} basePath="/campaigns" />
            <a href={`/api/export/campaigns?${rangeQs}`} className="text-sm text-zinc-500 hover:underline">
              Export CSV
            </a>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-zinc-500">State:</span>
          {(["both", "enabled", "paused"] as const).map((s) => (
            <Link
              key={s}
              href={`/campaigns?${rangeQs}${profileQs}${tagQs}${s !== "both" ? `&state=${s}` : ""}`}
              className={`rounded-full px-3 py-1 text-xs capitalize ${stateFilter === s ? "bg-foreground text-background" : "bg-zinc-100 text-zinc-600 hover:bg-black/[.06] dark:bg-zinc-900 dark:text-zinc-400"}`}
            >
              {s}
            </Link>
          ))}
        </div>

        {allTags.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-zinc-500">Tags:</span>
            <Link
              href={`/campaigns?${rangeQs}${profileQs}${stateQs}`}
              className={`rounded-full px-3 py-1 text-xs ${!activeTag ? "bg-foreground text-background" : "bg-zinc-100 text-zinc-600 hover:bg-black/[.06] dark:bg-zinc-900 dark:text-zinc-400"}`}
            >
              All
            </Link>
            {allTags.map((tag) => (
              <Link
                key={tag}
                href={`/campaigns?${rangeQs}${profileQs}${stateQs}&tag=${encodeURIComponent(tag)}`}
                className={`rounded-full px-3 py-1 text-xs ${activeTag === tag ? "bg-foreground text-background" : "bg-zinc-100 text-zinc-600 hover:bg-black/[.06] dark:bg-zinc-900 dark:text-zinc-400"}`}
              >
                {tag}
              </Link>
            ))}
          </div>
        )}

        {rows.length === 0 ? (
          <p className="text-zinc-600 dark:text-zinc-400">
            No campaigns yet. Connect an account and run a sync (or{" "}
            <code>npm run seed</code> for demo data).
          </p>
        ) : (
          <CampaignsTable
            rows={rows.map(({ campaign, spend, sales, acos, ctr, orders }) => ({
              id: campaign.id,
              name: campaign.name,
              state: campaign.state,
              targetingType: campaign.targetingType,
              notes: campaign.notes,
              tags: campaign.tags,
              spend,
              sales,
              acos,
              ctr,
              orders,
              prevAcos: prevAcosByCampaign.get(campaign.id) ?? 0,
              currencyCode: campaign.profile.currencyCode,
            }))}
          />
        )}
      </main>
    </div>
  );
}
