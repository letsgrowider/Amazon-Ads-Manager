import Link from "next/link";
import { prisma } from "@/lib/db";
import { SyncToggle } from "@/app/accounts/SyncToggle";

// Country names duplicated from AccountSwitcher.tsx rather than shared —
// this page is the only other place that needs them, and importing a
// "use client" component's constant into a server component just to reuse
// a lookup table isn't worth the indirection.
const COUNTRY_NAMES: Record<string, string> = {
  US: "United States", CA: "Canada", MX: "Mexico", BR: "Brazil", UK: "United Kingdom",
  GB: "United Kingdom", DE: "Germany", FR: "France", IT: "Italy", ES: "Spain",
  NL: "Netherlands", SE: "Sweden", PL: "Poland", BE: "Belgium", TR: "Turkey",
  AE: "United Arab Emirates", EG: "Egypt", SA: "Saudi Arabia", IN: "India",
  ZA: "South Africa", JP: "Japan", AU: "Australia", SG: "Singapore",
};

export default async function AccountsPage() {
  const accounts = await prisma.amazonAccount.findMany({
    include: { profiles: { include: { _count: { select: { campaigns: true } } } } },
    orderBy: { name: "asc" },
  });

  return (
    <div className="flex flex-col flex-1 items-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full max-w-3xl flex-col gap-6 py-16 px-8">
        <div>
          <Link href="/" className="text-sm text-zinc-500 hover:underline">
            &larr; Dashboard
          </Link>
          <h1 className="mt-1 text-2xl font-semibold text-black dark:text-zinc-50">Manage Accounts</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Pause a profile to skip it in every sync run — its existing data stays visible, it just
            stops refreshing. Fewer profiles means a faster run for everyone else.
          </p>
        </div>

        {accounts.map((account) => (
          <div key={account.id} className="flex flex-col gap-2">
            <h2 className="text-sm font-medium text-zinc-500">
              {account.name} <span className="text-xs">({account.region})</span>
            </h2>
            <div className="flex flex-col gap-1 rounded-lg border border-zinc-200 dark:border-zinc-800">
              {account.profiles.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between gap-3 border-b border-zinc-100 px-4 py-3 last:border-b-0 dark:border-zinc-900"
                >
                  <div>
                    <div className="text-sm text-black dark:text-zinc-50">
                      {p.entityName ?? `${COUNTRY_NAMES[p.countryCode] ?? p.countryCode}`}
                    </div>
                    <div className="text-xs text-zinc-500">
                      {COUNTRY_NAMES[p.countryCode] ?? p.countryCode} — {p._count.campaigns} campaigns
                    </div>
                  </div>
                  <SyncToggle profileId={p.id} syncEnabled={p.syncEnabled} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </main>
    </div>
  );
}
