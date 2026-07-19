export const RANGE_PRESETS = [7, 14, 30, 90] as const;
export const DEFAULT_RANGE_DAYS = 14;

export interface DateRange {
  since: Date;
  until: Date;
  label: string;
  // URL representation, so pages/links can round-trip the current selection.
  days: string; // one of RANGE_PRESETS as string, or "custom"
  from?: string; // YYYY-MM-DD, only set when days === "custom"
  to?: string; // YYYY-MM-DD, only set when days === "custom"
}

export interface DateRangeSearchParams {
  days?: string;
  from?: string;
  to?: string;
}

function isValidDateString(s: string | undefined): s is string {
  return !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

// Report/metric dates are calendar dates with no meaningful timezone
// (Amazon reports by YYYY-MM-DD, and sync.ts stores them as UTC midnight —
// `new Date("2026-06-25")` is UTC per the ECMAScript spec). Building range
// boundaries from local time instead (e.g. `new Date(dateStr + "T00:00:00")`,
// which IS local) drifts by a day whenever the server isn't in UTC.
function utcMidnightToday(): Date {
  return new Date(new Date().toISOString().slice(0, 10));
}

export function resolveDateRange(searchParams: DateRangeSearchParams): DateRange {
  if (searchParams.days === "custom" && isValidDateString(searchParams.from) && isValidDateString(searchParams.to)) {
    const since = new Date(`${searchParams.from}T00:00:00.000Z`);
    const until = new Date(`${searchParams.to}T23:59:59.999Z`);
    if (since <= until) {
      return {
        since,
        until,
        label: `${searchParams.from} → ${searchParams.to}`,
        days: "custom",
        from: searchParams.from,
        to: searchParams.to,
      };
    }
    // fall through to default on an invalid range (to < since)
  }

  const days = RANGE_PRESETS.includes(Number(searchParams.days) as (typeof RANGE_PRESETS)[number])
    ? Number(searchParams.days)
    : DEFAULT_RANGE_DAYS;

  const until = new Date();
  until.setUTCHours(23, 59, 59, 999);
  const since = utcMidnightToday();
  since.setUTCDate(since.getUTCDate() - days);

  return { since, until, label: `Last ${days} days`, days: String(days) };
}

// Round-trip the current selection into a query string, e.g. for CSV export
// links so the download matches what's on screen.
export function rangeToQuery(range: DateRange): string {
  const params = new URLSearchParams({ days: range.days });
  if (range.days === "custom" && range.from && range.to) {
    params.set("from", range.from);
    params.set("to", range.to);
  }
  return params.toString();
}

// Same-length period immediately preceding `range`, for period-over-period
// comparison (e.g. "last 14 days" vs "the 14 days before that").
export function previousPeriod(range: DateRange): DateRange {
  const durationMs = range.until.getTime() - range.since.getTime();
  const until = new Date(range.since.getTime() - 1);
  const since = new Date(until.getTime() - durationMs);
  return { since, until, label: "previous period", days: "custom" };
}

// Percent change from `previous` to `current`, or null when there's no
// baseline to compare against (previous was 0).
export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return ((current - previous) / previous) * 100;
}
