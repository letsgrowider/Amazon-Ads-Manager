"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function AdGroupBidEditor({
  adGroupId,
  initialDefaultBid,
  currencySymbol = "$",
}: {
  adGroupId: string;
  initialDefaultBid: number;
  currencySymbol?: string;
}) {
  const router = useRouter();
  const [bid, setBid] = useState(initialDefaultBid.toFixed(2));
  const [state, setState] = useState<"idle" | "saving" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  async function save() {
    const parsed = Number(bid);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setState("error");
      setErrorMsg("Enter a positive number");
      return;
    }
    setState("saving");
    try {
      const res = await fetch(`/api/ad-groups/${adGroupId}/bid`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ defaultBid: parsed }),
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
    <div className="flex items-center gap-2 text-xs">
      <span className="text-zinc-500">Default bid {currencySymbol}</span>
      <input
        type="number"
        step="0.01"
        min="0.01"
        value={bid}
        onChange={(e) => setBid(e.target.value)}
        className="w-16 rounded border border-zinc-300 bg-transparent px-1.5 py-0.5 dark:border-zinc-700"
      />
      <button
        onClick={save}
        disabled={state === "saving"}
        className="rounded-full border border-zinc-300 px-2.5 py-0.5 font-medium text-black transition-colors hover:bg-black/[.04] disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-50 dark:hover:bg-white/[.06]"
      >
        {state === "saving" ? "Saving..." : "Save"}
      </button>
      {state === "error" && <span className="text-red-600 dark:text-red-400">{errorMsg}</span>}
    </div>
  );
}
