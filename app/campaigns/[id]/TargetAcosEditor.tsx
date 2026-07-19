"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function TargetAcosEditor({ campaignId, initialTargetAcos }: { campaignId: string; initialTargetAcos: number | null }) {
  const router = useRouter();
  const [value, setValue] = useState(initialTargetAcos?.toString() ?? "");
  const [state, setState] = useState<"idle" | "saving" | "error">("idle");

  async function save(targetAcos: number | null) {
    setState("saving");
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/target-acos`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetAcos }),
      });
      if (!res.ok) throw new Error(await res.text());
      setState("idle");
      router.refresh();
    } catch {
      setState("error");
    }
  }

  return (
    <div className="flex items-center gap-2 text-sm">
      <label className="text-zinc-500">Target ACOS</label>
      <input
        type="number"
        step="0.1"
        min="0.1"
        placeholder="e.g. 30"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="w-20 rounded border border-zinc-300 bg-transparent px-2 py-1 dark:border-zinc-700"
      />
      <span className="text-zinc-500">%</span>
      <button
        onClick={() => save(value === "" ? null : Number(value))}
        disabled={state === "saving"}
        className="rounded-full border border-zinc-300 px-3 py-1 text-xs font-medium text-black transition-colors hover:bg-black/[.04] disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-50 dark:hover:bg-white/[.06]"
      >
        {state === "saving" ? "Saving..." : "Save"}
      </button>
      {state === "error" && <span className="text-xs text-red-600 dark:text-red-400">Failed</span>}
    </div>
  );
}
