"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function DismissButton({ id, status, apiPath }: { id: string; status: string; apiPath: string }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  async function setStatus(next: "queued" | "dismissed") {
    setSaving(true);
    try {
      const res = await fetch(`${apiPath}/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      if (res.ok) router.refresh();
    } finally {
      setSaving(false);
    }
  }

  if (status === "dismissed") {
    return (
      <button
        onClick={() => setStatus("queued")}
        disabled={saving}
        className="text-xs text-zinc-500 hover:underline disabled:opacity-50"
      >
        Restore
      </button>
    );
  }

  return (
    <button
      onClick={() => setStatus("dismissed")}
      disabled={saving}
      className="text-xs text-zinc-500 hover:underline disabled:opacity-50"
    >
      Dismiss
    </button>
  );
}
