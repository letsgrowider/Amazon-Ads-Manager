"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function SyncToggle({ profileId, syncEnabled }: { profileId: string; syncEnabled: boolean }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  async function toggle() {
    setSaving(true);
    try {
      const res = await fetch(`/api/profiles/${profileId}/sync-enabled`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ syncEnabled: !syncEnabled }),
      });
      if (res.ok) router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <button
      onClick={toggle}
      disabled={saving}
      className={`rounded-full px-3 py-1 text-xs font-medium disabled:opacity-50 ${
        syncEnabled
          ? "bg-zinc-100 text-zinc-600 hover:bg-black/[.06] dark:bg-zinc-900 dark:text-zinc-400"
          : "bg-amber-100 text-amber-800 hover:bg-amber-200 dark:bg-amber-950 dark:text-amber-300"
      }`}
    >
      {saving ? "Saving..." : syncEnabled ? "Syncing" : "Paused"}
    </button>
  );
}
