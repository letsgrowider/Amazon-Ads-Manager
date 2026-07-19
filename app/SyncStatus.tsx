"use client";

import { useEffect, useState } from "react";

interface SyncRunProfile {
  id: string;
  label: string;
  status: string;
  error: string | null;
}
interface SyncRunData {
  id: string;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  profiles: SyncRunProfile[];
}

const RECENT_MS = 5 * 60_000;

// Live progress for the current/most recent sync — polls while a run is
// in flight so "Sync now" (which returns immediately, see api/sync) isn't
// a black box. Disappears once a clean run is more than a few minutes old;
// stays visible longer if the run ended with failures.
export function SyncStatus() {
  const [run, setRun] = useState<SyncRunData | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    async function poll() {
      try {
        const res = await fetch("/api/sync-status");
        const data = await res.json();
        if (cancelled) return;
        setRun(data.run);
        if (data.run?.status === "running") {
          timer = setTimeout(poll, 3000);
        }
      } catch {
        // transient — next mount will retry
      }
    }
    poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  if (!run) return null;

  const isRecent = run.finishedAt ? Date.now() - new Date(run.finishedAt).getTime() < RECENT_MS : true;
  const failedProfiles = run.profiles.filter((p) => p.status === "failed");
  if (run.status !== "running" && !(isRecent && failedProfiles.length > 0)) return null;

  const total = run.profiles.length;
  const settled = run.profiles.filter((p) => p.status === "done" || p.status === "failed").length;
  const active = run.profiles.filter((p) => p.status === "running");
  const pct = total > 0 ? Math.round((settled / total) * 100) : 0;

  return (
    <div className="rounded-lg border border-zinc-200 p-3 text-sm dark:border-zinc-800">
      <div className="flex items-center justify-between gap-3">
        <span className="text-zinc-600 dark:text-zinc-400">
          {run.status === "running"
            ? `Syncing — ${settled}/${total} profiles done`
            : failedProfiles.length > 0
              ? `Last sync finished with ${failedProfiles.length} error${failedProfiles.length === 1 ? "" : "s"}`
              : "Sync complete"}
        </span>
        <span className="text-xs text-zinc-500">{pct}%</span>
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-900">
        <div className="h-1.5 rounded-full bg-blue-500 transition-all" style={{ width: `${pct}%` }} />
      </div>
      {active.length > 0 && (
        <p className="mt-2 text-xs text-zinc-500">Running: {active.map((p) => p.label).join(", ")}</p>
      )}
      {failedProfiles.length > 0 && (
        <ul className="mt-2 flex flex-col gap-0.5 text-xs text-red-600 dark:text-red-400">
          {failedProfiles.map((p) => (
            <li key={p.id}>
              {p.label}: {p.error}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
