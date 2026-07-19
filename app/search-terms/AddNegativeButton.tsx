"use client";

import { useState } from "react";

export function AddNegativeButton({
  searchTerm,
  adGroupAmazonId,
}: {
  searchTerm: string;
  adGroupAmazonId: string;
}) {
  const [state, setState] = useState<"idle" | "saving" | "queued" | "error">("idle");

  async function handleClick() {
    setState("saving");
    try {
      const res = await fetch("/api/negative-keywords", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ searchTerm, adGroupAmazonId }),
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
      className="rounded-full border border-zinc-300 px-3 py-1 text-xs font-medium text-black transition-colors hover:bg-black/[.04] disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-50 dark:hover:bg-white/[.06]"
    >
      {state === "saving" ? "Saving..." : state === "error" ? "Failed — retry" : "Add as negative"}
    </button>
  );
}
