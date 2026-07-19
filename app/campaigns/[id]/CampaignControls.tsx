"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function CampaignControls({
  campaignId,
  initialState,
  initialDailyBudget,
  currencySymbol = "$",
}: {
  campaignId: string;
  initialState: string;
  initialDailyBudget: number;
  currencySymbol?: string;
}) {
  const router = useRouter();
  const [budget, setBudget] = useState(initialDailyBudget.toFixed(2));
  const [state, setState] = useState<"idle" | "saving" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  async function patch(body: { state?: string; dailyBudget?: number }) {
    setState("saving");
    try {
      const res = await fetch(`/api/campaigns/${campaignId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      setState("idle");
      router.refresh();
    } catch (err) {
      setState("error");
      setErrorMsg((err as Error).message);
    }
  }

  const isPaused = initialState === "paused";

  return (
    <div className="flex flex-wrap items-center gap-3 text-sm">
      <button
        onClick={() => patch({ state: isPaused ? "enabled" : "paused" })}
        disabled={state === "saving"}
        className="rounded-full border border-zinc-300 px-3 py-1 text-xs font-medium text-black transition-colors hover:bg-black/[.04] disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-50 dark:hover:bg-white/[.06]"
      >
        {isPaused ? "Enable campaign" : "Pause campaign"}
      </button>

      <div className="flex items-center gap-2">
        <span className="text-zinc-500">Daily budget {currencySymbol}</span>
        <input
          type="number"
          step="0.01"
          min="0.01"
          value={budget}
          onChange={(e) => setBudget(e.target.value)}
          className="w-20 rounded border border-zinc-300 bg-transparent px-2 py-1 dark:border-zinc-700"
        />
        <button
          onClick={() => patch({ dailyBudget: Number(budget) })}
          disabled={state === "saving"}
          className="rounded-full border border-zinc-300 px-3 py-1 text-xs font-medium text-black transition-colors hover:bg-black/[.04] disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-50 dark:hover:bg-white/[.06]"
        >
          {state === "saving" ? "Saving..." : "Save budget"}
        </button>
      </div>

      {state === "error" && <span className="text-xs text-red-600 dark:text-red-400">{errorMsg}</span>}
    </div>
  );
}
