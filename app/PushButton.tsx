"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

// Actually pushes a queued suggestion (negative keyword or keyword-harvest
// candidate) to the live Amazon account — see the corresponding
// app/api/.../[id]/push routes. Previously these suggestions were local-
// only with no way to act on them.
export function PushButton({ id, apiPath }: { id: string; apiPath: string }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "pushing" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  async function push() {
    setState("pushing");
    try {
      const res = await fetch(`${apiPath}/${id}/push`, { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setErrorMsg(body.error ?? `HTTP ${res.status}`);
        setState("error");
        return;
      }
      router.refresh();
    } catch (err) {
      setErrorMsg((err as Error).message);
      setState("error");
    }
  }

  return (
    <div className="flex flex-col items-end gap-0.5">
      <button
        onClick={push}
        disabled={state === "pushing"}
        className="text-xs font-medium text-blue-600 hover:underline disabled:opacity-50 dark:text-blue-400"
      >
        {state === "pushing" ? "Pushing..." : "Push to Amazon"}
      </button>
      {state === "error" && <span className="max-w-40 text-right text-xs text-red-600 dark:text-red-400">{errorMsg}</span>}
    </div>
  );
}
