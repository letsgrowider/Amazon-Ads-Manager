"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { BidEditor } from "@/app/keywords/BidEditor";
import { formatMoney, currencySymbol } from "@/lib/currency";

interface KeywordRow {
  id: string;
  keywordText: string;
  matchType: string;
  bid: number;
  campaignName: string;
  adGroupName: string;
  currencyCode: string | null;
  clicks: number;
  spend: number;
  orders: number;
  acos: number;
  roas: number;
}

type SortBy = "spend" | "clicks" | "orders" | "acos" | "roas" | "bid";

export function KeywordsTable({
  keywords,
  rangeQs,
  campaignQs,
  sortBy,
  sortDir,
}: {
  keywords: KeywordRow[];
  rangeQs: string;
  campaignQs: string;
  sortBy: SortBy;
  sortDir: "asc" | "desc";
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [percent, setPercent] = useState("");
  const [state, setState] = useState<"idle" | "applying" | "done">("idle");
  const [resultMsg, setResultMsg] = useState("");

  const allSelected = keywords.length > 0 && selected.size === keywords.length;

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(keywords.map((k) => k.id)));
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function sortHref(key: SortBy) {
    const nextDir = sortBy === key && sortDir === "desc" ? "asc" : "desc";
    return `/keywords?${rangeQs}${campaignQs}&sort=${key}&dir=${nextDir}`;
  }

  function sortIndicator(key: SortBy) {
    if (sortBy !== key) return null;
    return sortDir === "desc" ? " ↓" : " ↑";
  }

  async function applyBulkChange() {
    const pct = Number(percent);
    if (!Number.isFinite(pct) || pct === 0) return;

    setState("applying");
    const targets = keywords.filter((k) => selected.has(k.id));
    const results = await Promise.allSettled(
      targets.map((k) => {
        const newBid = Math.max(0.02, Number((k.bid * (1 + pct / 100)).toFixed(2)));
        return fetch(`/api/keywords/${k.id}/bid`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ bid: newBid }),
        }).then((res) => {
          if (!res.ok) throw new Error(`${k.keywordText}: HTTP ${res.status}`);
        });
      })
    );

    const failed = results.filter((r) => r.status === "rejected").length;
    setResultMsg(
      failed === 0
        ? `Updated ${targets.length} keyword${targets.length === 1 ? "" : "s"}.`
        : `${targets.length - failed} succeeded, ${failed} failed (Amazon push rejected — see console).`
    );
    setState("done");
    setSelected(new Set());
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3">
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-zinc-300 bg-zinc-50 p-3 text-sm dark:border-zinc-700 dark:bg-zinc-900">
          <span className="text-zinc-600 dark:text-zinc-400">
            {selected.size} selected — adjust bids by
          </span>
          <input
            type="number"
            step="1"
            placeholder="e.g. 10 or -10"
            value={percent}
            onChange={(e) => setPercent(e.target.value)}
            className="w-20 rounded border border-zinc-300 bg-transparent px-2 py-1 text-sm dark:border-zinc-700"
          />
          <span className="text-zinc-600 dark:text-zinc-400">%</span>
          <button
            onClick={applyBulkChange}
            disabled={state === "applying" || !percent}
            className="rounded-full border border-zinc-300 px-3 py-1 text-xs font-medium hover:bg-black/[.04] disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-white/[.06]"
          >
            {state === "applying" ? "Applying..." : "Apply to selected"}
          </button>
          {state === "done" && <span className="text-xs text-zinc-500">{resultMsg}</span>}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-zinc-200 text-zinc-500 dark:border-zinc-800">
              <th className="w-8 py-2">
                <input type="checkbox" checked={allSelected} onChange={toggleAll} />
              </th>
              <th className="py-2">Keyword</th>
              <th className="py-2">Match type</th>
              <th className="py-2">Campaign / Ad group</th>
              <th className="py-2 text-right">
                <Link href={sortHref("clicks")} className="hover:underline">
                  Clicks{sortIndicator("clicks")}
                </Link>
              </th>
              <th className="py-2 text-right">
                <Link href={sortHref("spend")} className="hover:underline">
                  Spend{sortIndicator("spend")}
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
              <th className="py-2 text-right">
                <Link href={sortHref("bid")} className="hover:underline">
                  Bid{sortIndicator("bid")}
                </Link>
              </th>
            </tr>
          </thead>
          <tbody>
            {keywords.map((kw) => (
              <tr key={kw.id} className="border-b border-zinc-100 dark:border-zinc-900">
                <td className="py-2">
                  <input type="checkbox" checked={selected.has(kw.id)} onChange={() => toggleOne(kw.id)} />
                </td>
                <td className="py-2 text-black dark:text-zinc-50">
                  <Link href={`/keywords/${kw.id}`} className="hover:underline">
                    {kw.keywordText}
                  </Link>
                </td>
                <td className="py-2 text-zinc-600 dark:text-zinc-400">{kw.matchType}</td>
                <td className="py-2 text-zinc-600 dark:text-zinc-400">
                  <div>{kw.campaignName}</div>
                  <div className="text-xs text-zinc-500">{kw.adGroupName}</div>
                </td>
                <td className="py-2 text-right text-zinc-600 dark:text-zinc-400">{kw.clicks}</td>
                <td className="py-2 text-right text-zinc-600 dark:text-zinc-400">{formatMoney(kw.spend, kw.currencyCode)}</td>
                <td className="py-2 text-right text-zinc-600 dark:text-zinc-400">{kw.orders}</td>
                <td
                  className={`py-2 text-right ${kw.acos > 40 ? "text-red-600 dark:text-red-400" : "text-zinc-600 dark:text-zinc-400"}`}
                >
                  {kw.acos.toFixed(1)}%
                </td>
                <td className="py-2 text-right text-zinc-600 dark:text-zinc-400">{kw.roas.toFixed(2)}x</td>
                <td className="py-2">
                  <BidEditor keywordId={kw.id} initialBid={kw.bid} currencySymbol={currencySymbol(kw.currencyCode)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
