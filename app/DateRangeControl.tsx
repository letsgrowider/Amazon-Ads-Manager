import Link from "next/link";
import { RANGE_PRESETS, type DateRange } from "@/lib/date-range";

// No client JS needed: presets are plain links, custom range is a native
// GET form — both just navigate with different search params.
export function DateRangeControl({ range, basePath }: { range: DateRange; basePath: string }) {
  return (
    <div className="flex flex-wrap items-center gap-3 text-sm">
      <div className="flex items-center gap-1 rounded-full border border-zinc-300 p-1 dark:border-zinc-700">
        {RANGE_PRESETS.map((d) => (
          <Link
            key={d}
            href={`${basePath}?days=${d}`}
            className={`rounded-full px-3 py-1 ${
              range.days === String(d)
                ? "bg-foreground text-background"
                : "text-zinc-600 hover:bg-black/[.04] dark:text-zinc-400 dark:hover:bg-white/[.06]"
            }`}
          >
            {d}d
          </Link>
        ))}
      </div>
      <form method="GET" action={basePath} className="flex items-center gap-1">
        <input type="hidden" name="days" value="custom" />
        <input
          type="date"
          name="from"
          defaultValue={range.from}
          required
          className="rounded border border-zinc-300 bg-transparent px-2 py-1 text-xs dark:border-zinc-700"
        />
        <span className="text-zinc-500">–</span>
        <input
          type="date"
          name="to"
          defaultValue={range.to}
          required
          className="rounded border border-zinc-300 bg-transparent px-2 py-1 text-xs dark:border-zinc-700"
        />
        <button
          type="submit"
          className="rounded-full border border-zinc-300 px-3 py-1 text-xs font-medium hover:bg-black/[.04] dark:border-zinc-700 dark:hover:bg-white/[.06]"
        >
          Apply
        </button>
      </form>
    </div>
  );
}
