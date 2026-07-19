"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function NotesEditor({ campaignId, initialNotes }: { campaignId: string; initialNotes: string | null }) {
  const router = useRouter();
  const [notes, setNotes] = useState(initialNotes ?? "");
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  async function save() {
    setState("saving");
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/notes`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes }),
      });
      if (!res.ok) throw new Error(await res.text());
      setState("saved");
      router.refresh();
    } catch {
      setState("error");
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <label className="text-xs text-zinc-500">Notes</label>
      <textarea
        value={notes}
        onChange={(e) => {
          setNotes(e.target.value);
          setState("idle");
        }}
        placeholder="Why this campaign is set up this way, context for later..."
        rows={3}
        className="w-full max-w-md rounded border border-zinc-300 bg-transparent px-2 py-1.5 text-sm dark:border-zinc-700"
      />
      <div className="flex items-center gap-2">
        <button
          onClick={save}
          disabled={state === "saving"}
          className="w-fit rounded-full border border-zinc-300 px-3 py-1 text-xs font-medium text-black transition-colors hover:bg-black/[.04] disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-50 dark:hover:bg-white/[.06]"
        >
          {state === "saving" ? "Saving..." : "Save notes"}
        </button>
        {state === "saved" && <span className="text-xs text-zinc-500">Saved</span>}
        {state === "error" && <span className="text-xs text-red-600 dark:text-red-400">Failed</span>}
      </div>
    </div>
  );
}
