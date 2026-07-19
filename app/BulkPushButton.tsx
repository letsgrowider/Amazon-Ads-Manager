"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

// Pushing suggestions one at a time didn't scale once queues had more than
// a handful of rows — this fires all of them and reports how many actually
// landed vs failed (a single bad row, e.g. a stale adGroup, shouldn't block
// the rest).
export function BulkPushButton({ ids, apiPath }: { ids: string[]; apiPath: string }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "pushing" | "done">("idle");
  const [resultMsg, setResultMsg] = useState("");

  async function pushAll() {
    setState("pushing");
    const results = await Promise.allSettled(
      ids.map((id) =>
        fetch(`${apiPath}/${id}/push`, { method: "POST" }).then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
        })
      )
    );
    const failed = results.filter((r) => r.status === "rejected").length;
    setResultMsg(
      failed === 0
        ? `Pushed all ${ids.length}.`
        : `${ids.length - failed} succeeded, ${failed} failed (see individual rows).`
    );
    setState("done");
    router.refresh();
  }

  if (ids.length === 0) return null;

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={pushAll}
        disabled={state === "pushing"}
        className="rounded-full border border-zinc-300 px-3 py-1 text-xs font-medium hover:bg-black/[.04] disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-white/[.06]"
      >
        {state === "pushing" ? "Pushing all..." : `Push all queued (${ids.length})`}
      </button>
      {state === "done" && <span className="text-xs text-zinc-500">{resultMsg}</span>}
    </div>
  );
}
