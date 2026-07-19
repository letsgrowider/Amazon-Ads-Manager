"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function BidEditor({
  keywordId,
  initialBid,
  currencySymbol = "$",
}: {
  keywordId: string;
  initialBid: number;
  currencySymbol?: string;
}) {
  const router = useRouter();
  const [bid, setBid] = useState(initialBid.toFixed(2));
  const [state, setState] = useState<"idle" | "saving" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  async function handleSave() {
    const parsed = Number(bid);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setState("error");
      setErrorMsg("Enter a positive number");
      return;
    }
    setState("saving");
    try {
      const res = await fetch(`/api/keywords/${keywordId}/bid`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bid: parsed }),
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
    <div className="flex items-center gap-2">
      <span className="text-zinc-500">{currencySymbol}</span>
      <input
        type="number"
        step="0.01"
        min="0.01"
        value={bid}
        onChange={(e) => setBid(e.target.value)}
        className="w-20 rounded border border-zinc-300 bg-transparent px-2 py-1 text-sm dark:border-zinc-700"
      />
      <button
        onClick={handleSave}
        disabled={state === "saving"}
        className="rounded-full border border-zinc-300 px-3 py-1 text-xs font-medium text-black transition-colors hover:bg-black/[.04] disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-50 dark:hover:bg-white/[.06]"
      >
        {state === "saving" ? "Saving..." : "Save"}
      </button>
      {state === "error" && <span className="text-xs text-red-600 dark:text-red-400">{errorMsg}</span>}
    </div>
  );
}
