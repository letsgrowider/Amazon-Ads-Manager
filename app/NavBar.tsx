"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const PRIMARY_TABS = [
  { href: "/", label: "Dashboard" },
  { href: "/campaigns", label: "Campaigns" },
  { href: "/keywords", label: "Keywords" },
  { href: "/search-terms", label: "Search Terms" },
];

const MORE_LINKS = [
  { href: "/history", label: "History" },
  { href: "/accounts", label: "Manage Accounts" },
];

function tabClass(active: boolean) {
  return `rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
    active
      ? "bg-foreground text-background"
      : "text-zinc-600 hover:bg-black/[.04] dark:text-zinc-400 dark:hover:bg-white/[.06]"
  }`;
}

// Single persistent nav shown on every page — previously every page hand-
// rolled its own "back to Dashboard" link, and the dashboard alone carried
// every destination (7+ same-weight pill buttons) with no grouping at all.
export function NavBar() {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) setMoreOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  function isActive(href: string) {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  }

  const moreActive = MORE_LINKS.some((l) => isActive(l.href));

  return (
    <nav className="w-full border-b border-zinc-200 dark:border-zinc-800">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-8 py-3">
        <Link href="/" className="text-base font-semibold text-black dark:text-zinc-50">
          RankWider
        </Link>
        <div className="flex flex-wrap items-center gap-1">
          {PRIMARY_TABS.map((t) => (
            <Link key={t.href} href={t.href} className={tabClass(isActive(t.href))}>
              {t.label}
            </Link>
          ))}
          <div className="relative" ref={moreRef}>
            <button onClick={() => setMoreOpen((o) => !o)} className={tabClass(moreActive)}>
              More
            </button>
            {moreOpen && (
              <div className="absolute right-0 z-10 mt-1 w-44 rounded-lg border border-zinc-200 bg-white py-1 shadow-lg dark:border-zinc-800 dark:bg-zinc-950">
                {MORE_LINKS.map((l) => (
                  <Link
                    key={l.href}
                    href={l.href}
                    onClick={() => setMoreOpen(false)}
                    className={`block px-3 py-2 text-sm ${
                      isActive(l.href)
                        ? "font-medium text-black dark:text-zinc-50"
                        : "text-zinc-600 hover:bg-black/[.04] dark:text-zinc-400 dark:hover:bg-white/[.06]"
                    }`}
                  >
                    {l.label}
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
