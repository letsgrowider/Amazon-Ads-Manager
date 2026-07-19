// Green/red % change indicator vs the prior equal-length period.
// `invert` flips the color logic for metrics where "up" is bad (e.g. ACOS).
// `neutral` skips the good/bad judgment entirely (e.g. spend — more spend
// isn't inherently good or bad without sales context alongside it).
export function ChangeBadge({
  pct,
  invert = false,
  neutral = false,
}: {
  pct: number | null;
  invert?: boolean;
  neutral?: boolean;
}) {
  if (pct === null) {
    return <span className="text-xs text-zinc-400">new</span>;
  }
  const isUp = pct > 0;
  const isGood = invert ? !isUp : isUp;
  const color = neutral
    ? "text-zinc-500"
    : Math.abs(pct) < 0.5
      ? "text-zinc-500"
      : isGood
        ? "text-green-600 dark:text-green-400"
        : "text-red-600 dark:text-red-400";
  const arrow = pct > 0 ? "▲" : pct < 0 ? "▼" : "–";

  return (
    <span className={`text-xs ${color}`}>
      {arrow} {Math.abs(pct).toFixed(1)}%
    </span>
  );
}
