"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function DaypartingRunButton() {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "running" | "error">("idle");

  async function handleClick() {
    setState("running");
    try {
      const res = await fetch("/api/dayparting", { method: "POST" });
      if (!res.ok) throw new Error(await res.text());
      setState("idle");
      router.refresh();
    } catch {
      setState("error");
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={state === "running"}
      className="rounded-full border border-zinc-300 px-5 py-2.5 text-sm font-medium text-black transition-colors hover:bg-black/[.04] disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-50 dark:hover:bg-white/[.06]"
    >
      {state === "running" ? "Running..." : state === "error" ? "Failed — retry" : "Run dayparting now"}
    </button>
  );
}
