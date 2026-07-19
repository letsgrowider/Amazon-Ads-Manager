"use client";

import { useState } from "react";

export function AddHarvestButton({
  searchTerm,
  adGroupAmazonId,
  spend,
  clicks,
}: {
  searchTerm: string;
  adGroupAmazonId: string;
  spend: number;
  clicks: number;
}) {
  const [state, setState] = useState<"idle" | "saving" | "queued" | "error">("idle");

  async function handleClick() {
    setState("saving");
    try {
      const res = await fetch("/api/keyword-harvest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ searchTerm, adGroupAmazonId, spend, clicks }),
      });
      if (!res.ok) throw new Error(await res.text());
      setState("queued");
    } catch {
      setState("error");
    }
  }

  if (state === "queued") {
    return <span className="text-xs text-zinc-500">Queued</span>;
  }

  return (
    <button
      onClick={handleClick}
      disabled={state === "saving"}
      className="rounded-full border border-green-300 px-3 py-1 text-xs font-medium text-green-700 transition-colors hover:bg-green-50 disabled:opacity-50 dark:border-green-800 dark:text-green-400 dark:hover:bg-green-950"
    >
      {state === "saving" ? "Saving..." : state === "error" ? "Failed — retry" : "Harvest keyword"}
    </button>
  );
}
