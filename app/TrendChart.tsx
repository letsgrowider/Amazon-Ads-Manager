"use client";

import { useState } from "react";

export interface TrendPoint {
  date: string; // YYYY-MM-DD
  [key: string]: string | number;
}

type Unit = "currency" | "percent" | "ratio" | "number";

// Server Components can't pass functions as props to a "use client"
// component — format by a plain string tag instead of a callback.
// currencySymbol defaults to "$" but callers pass the profile's real
// symbol (see lib/currency.ts) so non-USD accounts don't get mislabeled.
function formatValue(v: number, unit: Unit, currencySymbol: string): string {
  switch (unit) {
    case "currency":
      return `${currencySymbol}${v.toFixed(2)}`;
    case "percent":
      return `${v.toFixed(1)}%`;
    case "ratio":
      return `${v.toFixed(2)}x`;
    case "number":
    default:
      return v.toLocaleString();
  }
}

interface TrendChartProps {
  data: TrendPoint[];
  barKey: string;
  lineKey?: string;
  barLabel: string;
  lineLabel?: string;
  barColor?: string;
  lineColor?: string;
  barUnit?: Unit;
  lineUnit?: Unit;
  currencySymbol?: string;
}

const VIEW_W = 600;
const VIEW_H = 200;
const CHART_H = VIEW_H - 24; // room for x-axis labels

// Lightweight interactive bar+line chart (no charting library — this app
// has no chart deps and one row of history was never worth adding one).
// Bars for the primary metric, an optional overlaid line for a second
// (independently-scaled) metric, hover tooltip, and sparse x-axis labels
// so a 30-day range doesn't crowd into unreadable text.
export function TrendChart({
  data,
  barKey,
  lineKey,
  barLabel,
  lineLabel,
  barColor = "#3b82f6",
  lineColor = "#f59e0b",
  barUnit = "number",
  lineUnit = "number",
  currencySymbol = "$",
}: TrendChartProps) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  if (data.length === 0) {
    return <p className="text-sm text-zinc-500">No data yet.</p>;
  }

  const n = data.length;
  const barValues = data.map((d) => Number(d[barKey]) || 0);
  const lineValues = lineKey ? data.map((d) => Number(d[lineKey]) || 0) : [];
  const maxBar = Math.max(1, ...barValues);
  const maxLine = Math.max(1, ...lineValues);
  const colWidth = VIEW_W / n;

  const linePoints = lineValues
    .map((v, i) => `${colWidth * i + colWidth / 2},${CHART_H - (v / maxLine) * CHART_H}`)
    .join(" ");

  const labelEvery = Math.max(1, Math.ceil(n / 7));

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} className="h-[200px] w-full" preserveAspectRatio="none">
        {barValues.map((v, i) => {
          const barH = (v / maxBar) * CHART_H;
          const x = colWidth * i + colWidth * 0.15;
          const w = colWidth * 0.7;
          return (
            <rect
              key={i}
              x={x}
              y={CHART_H - barH}
              width={w}
              height={Math.max(barH, v > 0 ? 1 : 0)}
              fill={barColor}
              opacity={hoverIdx === i ? 1 : 0.65}
              onMouseEnter={() => setHoverIdx(i)}
              onMouseLeave={() => setHoverIdx(null)}
            />
          );
        })}
        {lineKey && (
          <polyline points={linePoints} fill="none" stroke={lineColor} strokeWidth={2} vectorEffect="non-scaling-stroke" />
        )}
        {lineKey &&
          lineValues.map((v, i) => (
            <circle
              key={i}
              cx={colWidth * i + colWidth / 2}
              cy={CHART_H - (v / maxLine) * CHART_H}
              r={hoverIdx === i ? 4 : 2.5}
              fill={lineColor}
              onMouseEnter={() => setHoverIdx(i)}
              onMouseLeave={() => setHoverIdx(null)}
            />
          ))}
        {hoverIdx !== null && (
          <line
            x1={colWidth * hoverIdx + colWidth / 2}
            x2={colWidth * hoverIdx + colWidth / 2}
            y1={0}
            y2={CHART_H}
            stroke="currentColor"
            className="text-zinc-300 dark:text-zinc-700"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
        )}
        {data.map((d, i) =>
          i % labelEvery === 0 || i === n - 1 ? (
            <text
              key={i}
              x={colWidth * i + colWidth / 2}
              y={VIEW_H - 4}
              fontSize={10}
              textAnchor="middle"
              className="fill-zinc-500"
            >
              {d.date.slice(5)}
            </text>
          ) : null
        )}
      </svg>
      {hoverIdx !== null && (
        <div
          className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 whitespace-nowrap rounded border border-zinc-300 bg-white px-2 py-1 text-xs shadow-sm dark:border-zinc-700 dark:bg-zinc-900"
          style={{ left: `${((hoverIdx + 0.5) / n) * 100}%` }}
        >
          <div className="font-medium text-black dark:text-zinc-50">{data[hoverIdx].date}</div>
          <div style={{ color: barColor }}>
            {barLabel}: {formatValue(barValues[hoverIdx], barUnit, currencySymbol)}
          </div>
          {lineKey && (
            <div style={{ color: lineColor }}>
              {lineLabel}: {formatValue(lineValues[hoverIdx], lineUnit, currencySymbol)}
            </div>
          )}
        </div>
      )}
      <div className="mt-1 flex items-center gap-4 text-xs text-zinc-500">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-sm" style={{ background: barColor }} />
          {barLabel}
        </span>
        {lineKey && (
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: lineColor }} />
            {lineLabel}
          </span>
        )}
      </div>
    </div>
  );
}
