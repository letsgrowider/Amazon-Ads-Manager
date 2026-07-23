"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/search-terms", label: "All search terms" },
  { href: "/negative-keywords", label: "Negative queue" },
  { href: "/keyword-harvest", label: "Harvest queue" },
];

// These three pages are really one workflow (deciding what a search term
// should become) that used to be three same-weight, unrelated-looking nav
// destinations. Grouping them here doesn't touch any of their own logic —
// just makes it visible that they're siblings, not separate features.
export function SearchTermsSubNav() {
  const pathname = usePathname();

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      {TABS.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          className={`rounded-full px-3 py-1 text-xs font-medium ${
            pathname === t.href
              ? "bg-foreground text-background"
              : "bg-zinc-100 text-zinc-600 hover:bg-black/[.06] dark:bg-zinc-900 dark:text-zinc-400"
          }`}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}
