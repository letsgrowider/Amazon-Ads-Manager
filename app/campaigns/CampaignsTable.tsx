"use client";

import Link from "next/link";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useState } from "react";
import { ChangeBadge } from "@/app/ChangeBadge";
import { percentChange } from "@/lib/date-range";
import { formatMoney } from "@/lib/currency";

const AD_PRODUCT_LABELS: Record<string, string> = {
  SPONSORED_PRODUCTS: "Sponsored Products",
  SPONSORED_BRANDS: "Sponsored Brands",
  SPONSORED_DISPLAY: "Sponsored Display",
};

interface CampaignRow {
  id: string;
  name: string;
  state: string;
  targetingType: string | null;
  adProduct: string;
  notes: string | null;
  tags: string[];
  spend: number;
  sales: number;
  acos: number;
  ctr: number;
  orders: number;
  prevAcos: number;
  currencyCode: string | null;
}

type SortKey = "spend" | "sales" | "acos" | "ctr" | "orders";

export function CampaignsTable({
  rows,
  sortBy,
  sortDir,
}: {
  rows: CampaignRow[];
  sortBy?: SortKey;
  sortDir?: "asc" | "desc";
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [state, setState] = useState<"idle" | "applying" | "done">("idle");
  const [resultMsg, setResultMsg] = useState("");

  function sortHref(key: SortKey) {
    const params = new URLSearchParams(searchParams.toString());
    const nextDir = sortBy === key && sortDir === "desc" ? "asc" : "desc";
    params.set("sort", key);
    params.set("dir", nextDir);
    return `${pathname}?${params.toString()}`;
  }

  function sortIndicator(key: SortKey) {
    if (sortBy !== key) return null;
    return sortDir === "asc" ? " ↑" : " ↓";
  }

  const allSelected = rows.length > 0 && selected.size === rows.length;

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)));
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function applyBulkState(next: "enabled" | "paused") {
    setState("applying");
    const targets = rows.filter((r) => selected.has(r.id));
    const results = await Promise.allSettled(
      targets.map((r) =>
        fetch(`/api/campaigns/${r.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ state: next }),
        }).then((res) => {
          if (!res.ok) throw new Error(`${r.name}: HTTP ${res.status}`);
        })
      )
    );

    const failed = results.filter((r) => r.status === "rejected").length;
    setResultMsg(
      failed === 0
        ? `${next === "enabled" ? "Enabled" : "Paused"} ${targets.length} campaign${targets.length === 1 ? "" : "s"}.`
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
          <span className="text-zinc-600 dark:text-zinc-400">{selected.size} selected</span>
          <button
            onClick={() => applyBulkState("paused")}
            disabled={state === "applying"}
            className="rounded-full border border-zinc-300 px-3 py-1 text-xs font-medium hover:bg-black/[.04] disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-white/[.06]"
          >
            {state === "applying" ? "Applying..." : "Pause selected"}
          </button>
          <button
            onClick={() => applyBulkState("enabled")}
            disabled={state === "applying"}
            className="rounded-full border border-zinc-300 px-3 py-1 text-xs font-medium hover:bg-black/[.04] disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-white/[.06]"
          >
            {state === "applying" ? "Applying..." : "Enable selected"}
          </button>
          {state === "done" && <span className="text-xs text-zinc-500">{resultMsg}</span>}
        </div>
      )}

      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-zinc-200 text-zinc-500 dark:border-zinc-800">
            <th className="w-8 py-2">
              <input type="checkbox" checked={allSelected} onChange={toggleAll} />
            </th>
            <th className="py-2">Campaign</th>
            <th className="py-2">State</th>
            <th className="py-2 text-right">
              <Link href={sortHref("spend")} className="hover:underline">
                Spend{sortIndicator("spend")}
              </Link>
            </th>
            <th className="py-2 text-right">
              <Link href={sortHref("sales")} className="hover:underline">
                Sales{sortIndicator("sales")}
              </Link>
            </th>
            <th className="py-2 text-right">
              <Link href={sortHref("acos")} className="hover:underline">
                ACOS{sortIndicator("acos")}
              </Link>
            </th>
            <th className="py-2 text-right">vs prev</th>
            <th className="py-2 text-right">
              <Link href={sortHref("ctr")} className="hover:underline">
                CTR{sortIndicator("ctr")}
              </Link>
            </th>
            <th className="py-2 text-right">
              <Link href={sortHref("orders")} className="hover:underline">
                Orders{sortIndicator("orders")}
              </Link>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-zinc-100 dark:border-zinc-900">
              <td className="py-2">
                <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggleOne(r.id)} />
              </td>
              <td className="py-2 text-black dark:text-zinc-50">
                <Link href={`/campaigns/${r.id}`} className="hover:underline">
                  {r.name}
                </Link>
                {r.notes && (
                  <span
                    title={r.notes}
                    className="ml-1 cursor-help rounded border border-zinc-300 px-1 text-[10px] text-zinc-500 dark:border-zinc-700"
                  >
                    note
                  </span>
                )}
                <div className="text-xs text-zinc-500">
                  {r.targetingType ?? AD_PRODUCT_LABELS[r.adProduct] ?? r.adProduct}
                </div>
                {r.tags.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {r.tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </td>
              <td className="py-2 text-zinc-600 dark:text-zinc-400">{r.state}</td>
              <td className="py-2 text-right text-zinc-600 dark:text-zinc-400">{formatMoney(r.spend, r.currencyCode)}</td>
              <td className="py-2 text-right text-zinc-600 dark:text-zinc-400">{formatMoney(r.sales, r.currencyCode)}</td>
              <td
                className={`py-2 text-right ${r.acos > 40 ? "text-red-600 dark:text-red-400" : "text-zinc-600 dark:text-zinc-400"}`}
              >
                {r.acos.toFixed(1)}%
              </td>
              <td className="py-2 text-right">
                <ChangeBadge pct={percentChange(r.acos, r.prevAcos)} invert />
              </td>
              <td className="py-2 text-right text-zinc-600 dark:text-zinc-400">{r.ctr.toFixed(2)}%</td>
              <td className="py-2 text-right text-zinc-600 dark:text-zinc-400">{r.orders}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
