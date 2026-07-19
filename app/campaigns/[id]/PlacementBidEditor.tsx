"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

interface PlacementBid {
  placement: string;
  percentage: number;
}

const PLACEMENTS: { key: string; label: string }[] = [
  { key: "PLACEMENT_TOP", label: "Top of search" },
  { key: "PLACEMENT_PRODUCT_PAGE", label: "Product pages" },
  { key: "PLACEMENT_REST_OF_SEARCH", label: "Rest of search" },
];

export function PlacementBidEditor({
  campaignId,
  initialPlacementBidding,
}: {
  campaignId: string;
  initialPlacementBidding: PlacementBid[];
}) {
  const router = useRouter();
  const initial = new Map(initialPlacementBidding.map((p) => [p.placement, p.percentage]));
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(PLACEMENTS.map((p) => [p.key, String(initial.get(p.key) ?? 0)]))
  );
  const [state, setState] = useState<"idle" | "saving" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  async function save() {
    const placementBidding = PLACEMENTS.map((p) => ({
      placement: p.key,
      percentage: Number(values[p.key]) || 0,
    }));

    setState("saving");
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/placements`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ placementBidding }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      setState("idle");
      router.refresh();
    } catch (err) {
      setState("error");
      setErrorMsg((err as Error).message);
    }
  }

  return (
    <div className="flex flex-col gap-2 text-sm">
      <label className="text-xs text-zinc-500">Placement bid adjustments</label>
      <div className="flex flex-wrap items-center gap-3">
        {PLACEMENTS.map((p) => (
          <div key={p.key} className="flex items-center gap-1.5">
            <span className="text-xs text-zinc-500">{p.label}</span>
            <input
              type="number"
              step="1"
              min="0"
              value={values[p.key]}
              onChange={(e) => setValues((v) => ({ ...v, [p.key]: e.target.value }))}
              className="w-16 rounded border border-zinc-300 bg-transparent px-1.5 py-0.5 text-xs dark:border-zinc-700"
            />
            <span className="text-xs text-zinc-500">%</span>
          </div>
        ))}
        <button
          onClick={save}
          disabled={state === "saving"}
          className="rounded-full border border-zinc-300 px-3 py-1 text-xs font-medium text-black transition-colors hover:bg-black/[.04] disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-50 dark:hover:bg-white/[.06]"
        >
          {state === "saving" ? "Saving..." : "Save"}
        </button>
        {state === "error" && <span className="text-xs text-red-600 dark:text-red-400">{errorMsg}</span>}
      </div>
    </div>
  );
}
