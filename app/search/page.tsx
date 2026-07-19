import Link from "next/link";
import { prisma } from "@/lib/db";

const RESULT_LIMIT = 25;

async function search(q: string) {
  if (!q.trim()) return { campaigns: [], keywords: [], searchTerms: [] };

  const [campaigns, keywords, searchTermRows] = await Promise.all([
    prisma.campaign.findMany({
      where: { name: { contains: q, mode: "insensitive" } },
      take: RESULT_LIMIT,
    }),
    prisma.keyword.findMany({
      where: { keywordText: { contains: q, mode: "insensitive" } },
      include: { adGroup: { include: { campaign: true } } },
      take: RESULT_LIMIT,
    }),
    prisma.searchTermReport.findMany({
      where: { searchTerm: { contains: q, mode: "insensitive" } },
      distinct: ["searchTerm"],
      take: RESULT_LIMIT,
    }),
  ]);

  return { campaigns, keywords, searchTerms: searchTermRows };
}

export default async function SearchPage({ searchParams }: PageProps<"/search">) {
  const { q } = await searchParams;
  const query = typeof q === "string" ? q : "";
  const { campaigns, keywords, searchTerms } = await search(query);
  const totalResults = campaigns.length + keywords.length + searchTerms.length;

  return (
    <div className="flex flex-col flex-1 items-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full max-w-4xl flex-col gap-8 py-16 px-8">
        <div>
          <Link href="/" className="text-sm text-zinc-500 hover:underline">
            &larr; Dashboard
          </Link>
          <h1 className="mt-1 text-2xl font-semibold text-black dark:text-zinc-50">Search</h1>
          <form method="GET" action="/search" className="mt-3 flex items-center gap-2">
            <input
              type="text"
              name="q"
              defaultValue={query}
              placeholder="Search campaigns, keywords, search terms..."
              autoFocus
              className="w-full max-w-md rounded border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700"
            />
            <button
              type="submit"
              className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-black/[.04] dark:border-zinc-700 dark:hover:bg-white/[.06]"
            >
              Search
            </button>
          </form>
        </div>

        {query && (
          <p className="text-sm text-zinc-500">
            {totalResults} result{totalResults === 1 ? "" : "s"} for &quot;{query}&quot;
          </p>
        )}

        {query && campaigns.length > 0 && (
          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-medium text-zinc-500">Campaigns ({campaigns.length})</h2>
            <ul className="flex flex-col gap-1">
              {campaigns.map((c) => (
                <li key={c.id}>
                  <Link href={`/campaigns/${c.id}`} className="text-sm hover:underline">
                    {c.name}
                  </Link>
                  <span className="ml-2 text-xs text-zinc-500">{c.state}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {query && keywords.length > 0 && (
          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-medium text-zinc-500">Keywords ({keywords.length})</h2>
            <ul className="flex flex-col gap-1">
              {keywords.map((k) => (
                <li key={k.id} className="text-sm">
                  <Link href={`/campaigns/${k.adGroup.campaign.id}`} className="hover:underline">
                    {k.keywordText}
                  </Link>
                  <span className="ml-2 text-xs text-zinc-500">
                    {k.matchType} · {k.adGroup.campaign.name}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {query && searchTerms.length > 0 && (
          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-medium text-zinc-500">Search terms ({searchTerms.length})</h2>
            <ul className="flex flex-col gap-1">
              {searchTerms.map((s) => (
                <li key={s.id} className="text-sm">
                  {s.searchTerm}
                </li>
              ))}
            </ul>
            <Link href="/search-terms" className="text-xs text-zinc-500 hover:underline">
              View full search terms report &rarr;
            </Link>
          </section>
        )}

        {query && totalResults === 0 && (
          <p className="text-sm text-zinc-500">No matches for &quot;{query}&quot;.</p>
        )}
      </main>
    </div>
  );
}
