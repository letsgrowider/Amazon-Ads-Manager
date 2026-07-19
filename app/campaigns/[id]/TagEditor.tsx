"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function TagEditor({ campaignId, initialTags }: { campaignId: string; initialTags: string[] }) {
  const router = useRouter();
  const [tags, setTags] = useState(initialTags);
  const [input, setInput] = useState("");
  const [saving, setSaving] = useState(false);

  async function save(next: string[]) {
    setSaving(true);
    setTags(next);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/tags`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tags: next }),
      });
      if (res.ok) router.refresh();
    } finally {
      setSaving(false);
    }
  }

  function addTag() {
    const value = input.trim();
    if (!value || tags.includes(value)) {
      setInput("");
      return;
    }
    setInput("");
    save([...tags, value]);
  }

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      {tags.map((tag) => (
        <span
          key={tag}
          className="flex items-center gap-1 rounded-full bg-zinc-100 px-3 py-1 text-xs text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
        >
          {tag}
          <button
            onClick={() => save(tags.filter((t) => t !== tag))}
            disabled={saving}
            aria-label={`Remove tag ${tag}`}
            className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-100"
          >
            ×
          </button>
        </span>
      ))}
      <input
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            addTag();
          }
        }}
        placeholder="Add tag..."
        className="w-24 rounded border border-zinc-300 bg-transparent px-2 py-1 text-xs dark:border-zinc-700"
      />
    </div>
  );
}
