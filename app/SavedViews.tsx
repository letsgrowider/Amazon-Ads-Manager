"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";

interface SavedView {
  name: string;
  search: string; // query string, no leading "?"
}

// Per-page saved filter presets (date range + campaign/state/sort/search
// params, whatever the current page uses) — no backend, just localStorage,
// since these are a personal convenience per browser, not something that
// needs to sync across devices or team members.
function storageKey(pathname: string): string {
  return `rankwider:savedViews:${pathname}`;
}

function loadViews(pathname: string): SavedView[] {
  try {
    const raw = localStorage.getItem(storageKey(pathname));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function SavedViews() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [views, setViews] = useState<SavedView[]>([]);
  const [showInput, setShowInput] = useState(false);
  const [name, setName] = useState("");

  useEffect(() => {
    setViews(loadViews(pathname));
  }, [pathname]);

  function saveCurrentView() {
    if (!name.trim()) return;
    const search = searchParams.toString();
    const next = [...views.filter((v) => v.name !== name.trim()), { name: name.trim(), search }];
    localStorage.setItem(storageKey(pathname), JSON.stringify(next));
    setViews(next);
    setName("");
    setShowInput(false);
  }

  function removeView(viewName: string) {
    const next = views.filter((v) => v.name !== viewName);
    localStorage.setItem(storageKey(pathname), JSON.stringify(next));
    setViews(next);
  }

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      {views.map((v) => (
        <span
          key={v.name}
          className="flex items-center gap-1 rounded-full border border-zinc-300 pl-3 pr-1 py-1 dark:border-zinc-700"
        >
          <button onClick={() => router.push(`${pathname}?${v.search}`)} className="hover:underline">
            {v.name}
          </button>
          <button
            onClick={() => removeView(v.name)}
            className="rounded-full px-1 text-zinc-400 hover:bg-black/[.06] hover:text-zinc-600 dark:hover:bg-white/[.06]"
            title="Remove saved view"
          >
            ×
          </button>
        </span>
      ))}
      {showInput ? (
        <span className="flex items-center gap-1">
          <input
            autoFocus
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && saveCurrentView()}
            placeholder="View name"
            className="w-28 rounded border border-zinc-300 bg-transparent px-2 py-1 dark:border-zinc-700"
          />
          <button
            onClick={saveCurrentView}
            className="rounded-full border border-zinc-300 px-2 py-1 font-medium hover:bg-black/[.04] dark:border-zinc-700 dark:hover:bg-white/[.06]"
          >
            Save
          </button>
        </span>
      ) : (
        <button
          onClick={() => setShowInput(true)}
          className="rounded-full border border-dashed border-zinc-300 px-3 py-1 text-zinc-500 hover:bg-black/[.04] dark:border-zinc-700 dark:hover:bg-white/[.06]"
        >
          + Save this view
        </button>
      )}
    </div>
  );
}
