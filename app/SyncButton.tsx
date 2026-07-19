"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function SyncButton() {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "syncing" | "error">("idle");

  async function handleClick() {
    setState("syncing");
    try {
      const res = await fetch("/api/sync", { method: "POST" });
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
      disabled={state === "syncing"}
      className="rounded-full border border-zinc-300 px-5 py-2.5 text-sm font-medium text-black transition-colors hover:bg-black/[.04] disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-50 dark:hover:bg-white/[.06]"
    >
      {state === "syncing" ? "Syncing..." : state === "error" ? "Sync failed — retry" : "Sync now"}
    </button>
  );
}
