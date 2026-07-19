import Link from "next/link";
import { prisma } from "@/lib/db";
import { DismissButton } from "@/app/DismissButton";
import { PushButton } from "@/app/PushButton";
import { BulkPushButton } from "@/app/BulkPushButton";

export const dynamic = "force-dynamic";

async function getSuggestions() {
  return prisma.negativeKeywordSuggestion.findMany({
    include: { adGroup: { include: { campaign: true } } },
    orderBy: { createdAt: "desc" },
  });
}

export default async function NegativeKeywordsPage() {
  const suggestions = await getSuggestions();
  const queued = suggestions.filter((s) => s.status === "queued");
  const pushed = suggestions.filter((s) => s.status === "pushed");
  const dismissed = suggestions.filter((s) => s.status === "dismissed");

  return (
    <div className="flex flex-col flex-1 items-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full max-w-4xl flex-col gap-8 py-16 px-8">
        <div>
          <Link href="/" className="text-sm text-zinc-500 hover:underline">
            &larr; Dashboard
          </Link>
          <h1 className="mt-1 text-2xl font-semibold text-black dark:text-zinc-50">Negative Keywords</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Queued locally until you push them — nothing here touches your live account until you
            click &quot;Push to Amazon&quot;. See{" "}
            <Link href="/search-terms" className="underline">
              Search Terms
            </Link>{" "}
            to add more.
          </p>
        </div>

        <section className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-medium text-zinc-500">Queued ({queued.length})</h2>
            <BulkPushButton ids={queued.map((s) => s.id)} apiPath="/api/negative-keywords" />
          </div>
          {queued.length === 0 ? (
            <p className="text-sm text-zinc-500">Nothing queued yet.</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-200 text-zinc-500 dark:border-zinc-800">
                  <th className="py-2">Keyword</th>
                  <th className="py-2">Match type</th>
                  <th className="py-2">Campaign / Ad group</th>
                  <th className="py-2"></th>
                </tr>
              </thead>
              <tbody>
                {queued.map((s) => (
                  <tr key={s.id} className="border-b border-zinc-100 dark:border-zinc-900">
                    <td className="py-2 text-black dark:text-zinc-50">{s.keywordText}</td>
                    <td className="py-2 text-zinc-600 dark:text-zinc-400">{s.matchType}</td>
                    <td className="py-2 text-zinc-600 dark:text-zinc-400">
                      <div>{s.adGroup.campaign.name}</div>
                      <div className="text-xs text-zinc-500">{s.adGroup.name}</div>
                    </td>
                    <td className="py-2 text-right">
                      <div className="flex items-center justify-end gap-3">
                        <PushButton id={s.id} apiPath="/api/negative-keywords" />
                        <DismissButton id={s.id} status={s.status} apiPath="/api/negative-keywords" />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {pushed.length > 0 && (
          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-medium text-zinc-500">Pushed to Amazon ({pushed.length})</h2>
            <table className="w-full text-left text-sm">
              <tbody>
                {pushed.map((s) => (
                  <tr key={s.id} className="border-b border-zinc-100 dark:border-zinc-900">
                    <td className="py-2 text-black dark:text-zinc-50">{s.keywordText}</td>
                    <td className="py-2 text-zinc-600 dark:text-zinc-400">{s.matchType}</td>
                    <td className="py-2 text-zinc-600 dark:text-zinc-400">
                      <div>{s.adGroup.campaign.name}</div>
                      <div className="text-xs text-zinc-500">{s.adGroup.name}</div>
                    </td>
                    <td className="py-2 text-right text-xs text-green-600 dark:text-green-400">Live</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {dismissed.length > 0 && (
          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-medium text-zinc-500">Dismissed ({dismissed.length})</h2>
            <table className="w-full text-left text-sm">
              <tbody>
                {dismissed.map((s) => (
                  <tr key={s.id} className="border-b border-zinc-100 dark:border-zinc-900">
                    <td className="py-2 text-zinc-500 line-through">{s.keywordText}</td>
                    <td className="py-2 text-zinc-500">{s.matchType}</td>
                    <td className="py-2 text-zinc-500">
                      <div>{s.adGroup.campaign.name}</div>
                      <div className="text-xs">{s.adGroup.name}</div>
                    </td>
                    <td className="py-2 text-right">
                      <DismissButton id={s.id} status={s.status} apiPath="/api/negative-keywords" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
      </main>
    </div>
  );
}
