"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatMoney } from "@/lib/currency";

export interface BidSuggestionRow {
  entityType: "keyword" | "target";
  keywordId: string;
  keywordText: string;
  adGroupName: string;
  adGroupAcos: number | null;
  keywordSpend: number;
  keywordOrders: number;
  keywordAcos: number | null;
  currentBid: number;
  suggestedBid: number;
}

type RowStatus = "idle" | "applying" | "applied" | "error";

export function BidSuggestionsTable({ rows, currency }: { rows: BidSuggestionRow[]; currency?: string }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState<Record<string, RowStatus>>({});
  const [bulkRunning, setBulkRunning] = useState(false);

  const pendingRows = rows.filter((r) => status[r.keywordId] !== "applied");
  const selectedCount = [...selected].filter((id) => status[id] !== "applied").length;
  const allPendingSelected = pendingRows.length > 0 && pendingRows.every((r) => selected.has(r.keywordId));

  function toggleAll() {
    setSelected(allPendingSelected ? new Set() : new Set(pendingRows.map((r) => r.keywordId)));
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function applyOne(row: BidSuggestionRow) {
    setStatus((prev) => ({ ...prev, [row.keywordId]: "applying" }));
    try {
      const apiPath = row.entityType === "target" ? "targets" : "keywords";
      const res = await fetch(`/api/${apiPath}/${row.keywordId}/bid`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bid: row.suggestedBid }),
      });
      if (!res.ok) throw new Error();
      setStatus((prev) => ({ ...prev, [row.keywordId]: "applied" }));
    } catch {
      setStatus((prev) => ({ ...prev, [row.keywordId]: "error" }));
    }
  }

  // Applied one request at a time, not Promise.all — concurrent writes
  // against the shared Prisma connection have crashed this app before
  // (see lib/sync.ts's serialized() comment). A sequential loop is the
  // only version of this that's actually safe to ship.
  async function applySelected() {
    setBulkRunning(true);
    const targets = rows.filter((r) => selected.has(r.keywordId) && status[r.keywordId] !== "applied");
    for (const row of targets) {
      await applyOne(row);
    }
    setBulkRunning(false);
    setSelected(new Set());
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 text-xs text-zinc-500">
          <input type="checkbox" checked={allPendingSelected} onChange={toggleAll} disabled={bulkRunning} />
          Select all
        </label>
        <button
          onClick={applySelected}
          disabled={selectedCount === 0 || bulkRunning}
          className="rounded-full border border-zinc-300 px-3 py-1 text-xs font-medium hover:bg-black/[.04] disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-white/[.06]"
        >
          {bulkRunning ? "Applying..." : `Apply selected (${selectedCount})`}
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-zinc-200 text-zinc-500 dark:border-zinc-800">
              <th className="py-2"></th>
              <th className="py-2">Type</th>
              <th className="py-2">Keyword / Target</th>
              <th className="py-2">Ad group</th>
              <th className="py-2 text-right">Cost</th>
              <th className="py-2 text-right">Orders</th>
              <th className="py-2 text-right">Keyword ACOS</th>
              <th className="py-2 text-right">Ad group ACOS</th>
              <th className="py-2 text-right">Current bid</th>
              <th className="py-2 text-right">Suggested bid</th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const rowStatus = status[r.keywordId] ?? "idle";
              return (
                <tr key={r.keywordId} className="border-b border-zinc-100 dark:border-zinc-900">
                  <td className="py-2">
                    {rowStatus !== "applied" && (
                      <input
                        type="checkbox"
                        checked={selected.has(r.keywordId)}
                        onChange={() => toggleOne(r.keywordId)}
                        disabled={bulkRunning || rowStatus === "applying"}
                      />
                    )}
                  </td>
                  <td className="py-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${r.entityType === "target" ? "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300" : "bg-zinc-100 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400"}`}
                    >
                      {r.entityType === "target" ? "Target" : "Keyword"}
                    </span>
                  </td>
                  <td className="py-2 text-black dark:text-zinc-50">{r.keywordText}</td>
                  <td className="py-2 text-zinc-600 dark:text-zinc-400">{r.adGroupName}</td>
                  <td className="py-2 text-right text-zinc-600 dark:text-zinc-400">
                    {formatMoney(r.keywordSpend, currency)}
                  </td>
                  <td className="py-2 text-right text-zinc-600 dark:text-zinc-400">{r.keywordOrders}</td>
                  <td className="py-2 text-right text-zinc-600 dark:text-zinc-400">
                    {r.keywordAcos !== null ? `${r.keywordAcos.toFixed(1)}%` : "—"}
                  </td>
                  <td className="py-2 text-right text-zinc-600 dark:text-zinc-400">
                    {r.adGroupAcos?.toFixed(1)}%
                  </td>
                  <td className="py-2 text-right text-zinc-600 dark:text-zinc-400">
                    {formatMoney(r.currentBid, currency)}
                  </td>
                  <td
                    className={`py-2 text-right font-medium ${r.suggestedBid > r.currentBid ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}
                  >
                    {formatMoney(r.suggestedBid, currency)}
                  </td>
                  <td className="py-2 text-right">
                    {rowStatus === "applied" ? (
                      <span className="text-xs text-zinc-500">Applied</span>
                    ) : rowStatus === "error" ? (
                      <button
                        onClick={() => applyOne(r)}
                        className="text-xs text-red-600 hover:underline dark:text-red-400"
                      >
                        Retry
                      </button>
                    ) : (
                      <button
                        onClick={() => applyOne(r)}
                        disabled={bulkRunning || rowStatus === "applying"}
                        className="rounded-full border border-zinc-300 px-3 py-1 text-xs font-medium text-black transition-colors hover:bg-black/[.04] disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-50 dark:hover:bg-white/[.06]"
                      >
                        {rowStatus === "applying" ? "Applying..." : "Apply"}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
