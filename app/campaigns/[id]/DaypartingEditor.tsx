"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const HOURS = Array.from({ length: 24 }, (_, i) => i);

export function DaypartingEditor({
  campaignId,
  initialEnabled,
  initialHours,
}: {
  campaignId: string;
  initialEnabled: boolean;
  initialHours: number[];
}) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(initialEnabled);
  const [hours, setHours] = useState<Set<number>>(new Set(initialHours));
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  function toggleHour(h: number) {
    setHours((prev) => {
      const next = new Set(prev);
      if (next.has(h)) next.delete(h);
      else next.add(h);
      return next;
    });
    setState("idle");
  }

  async function save() {
    setState("saving");
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/dayparting`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ daypartingEnabled: enabled, daypartingHours: [...hours].sort((a, b) => a - b) }),
      });
      if (!res.ok) throw new Error(await res.text());
      setState("saved");
      router.refresh();
    } catch {
      setState("error");
    }
  }

  return (
    <div className="flex flex-col gap-2 text-sm">
      <label className="flex items-center gap-2 text-xs text-zinc-500">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => {
            setEnabled(e.target.checked);
            setState("idle");
          }}
        />
        Dayparting (UTC hours — pause outside selected hours)
      </label>
      {enabled && (
        <div className="flex flex-wrap gap-1">
          {HOURS.map((h) => (
            <button
              key={h}
              onClick={() => toggleHour(h)}
              className={`h-6 w-8 rounded text-[10px] ${
                hours.has(h)
                  ? "bg-foreground text-background"
                  : "bg-zinc-100 text-zinc-500 hover:bg-black/[.06] dark:bg-zinc-900 dark:hover:bg-white/[.06]"
              }`}
            >
              {h}
            </button>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2">
        <button
          onClick={save}
          disabled={state === "saving"}
          className="w-fit rounded-full border border-zinc-300 px-3 py-1 text-xs font-medium text-black transition-colors hover:bg-black/[.04] disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-50 dark:hover:bg-white/[.06]"
        >
          {state === "saving" ? "Saving..." : "Save schedule"}
        </button>
        {state === "saved" && <span className="text-xs text-zinc-500">Saved — applies on next scheduled run</span>}
        {state === "error" && <span className="text-xs text-red-600 dark:text-red-400">Failed</span>}
      </div>
    </div>
  );
}
