"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function ApplySuggestionButton({ keywordId, suggestedBid }: { keywordId: string; suggestedBid: number }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "saving" | "applied" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  async function apply() {
    setState("saving");
    try {
      const res = await fetch(`/api/keywords/${keywordId}/bid`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bid: suggestedBid }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      setState("applied");
      router.refresh();
    } catch (err) {
      setState("error");
      setErrorMsg((err as Error).message);
    }
  }

  if (state === "applied") {
    return <span className="text-xs text-zinc-500">Applied</span>;
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={apply}
        disabled={state === "saving"}
        className="rounded-full border border-zinc-300 px-3 py-1 text-xs font-medium text-black transition-colors hover:bg-black/[.04] disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-50 dark:hover:bg-white/[.06]"
      >
        {state === "saving" ? "Applying..." : "Apply"}
      </button>
      {state === "error" && <span className="text-xs text-red-600 dark:text-red-400">{errorMsg}</span>}
    </div>
  );
}
