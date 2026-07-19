interface Point {
  date: Date;
  bid: number;
}

// Plain SVG step chart, no charting library — consistent with the rest of
// the app's zero-dependency CSS-bar trend visuals.
export function BidHistoryChart({ points, currencySymbol = "$" }: { points: Point[]; currencySymbol?: string }) {
  if (points.length < 2) {
    return <p className="text-sm text-zinc-500">Not enough bid history yet to chart.</p>;
  }

  const width = 600;
  const height = 160;
  const padding = 24;

  const minDate = points[0].date.getTime();
  const maxDate = points[points.length - 1].date.getTime();
  const dateSpan = Math.max(1, maxDate - minDate);

  const bids = points.map((p) => p.bid);
  const minBid = Math.min(...bids);
  const maxBid = Math.max(...bids);
  const bidSpan = Math.max(0.01, maxBid - minBid);

  function x(date: Date) {
    return padding + ((date.getTime() - minDate) / dateSpan) * (width - padding * 2);
  }
  function y(bid: number) {
    return height - padding - ((bid - minBid) / bidSpan) * (height - padding * 2);
  }

  // Step line: hold each bid flat until the next change, like a real bid
  // timeline (not a smooth interpolation between values).
  const stepPoints: [number, number][] = [];
  for (let i = 0; i < points.length; i++) {
    const { date, bid } = points[i];
    if (i > 0) stepPoints.push([x(date), y(points[i - 1].bid)]);
    stepPoints.push([x(date), y(bid)]);
  }
  const polyline = stepPoints.map(([px, py]) => `${px.toFixed(1)},${py.toFixed(1)}`).join(" ");

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full max-w-2xl text-blue-500">
      <polyline points={polyline} fill="none" stroke="currentColor" strokeWidth={2} />
      {points.map((p, i) => (
        <circle key={i} cx={x(p.date)} cy={y(p.bid)} r={3} fill="currentColor" />
      ))}
      <text x={padding} y={height - 4} fontSize={10} fill="currentColor" opacity={0.6}>
        {points[0].date.toISOString().slice(0, 10)}
      </text>
      <text x={width - padding} y={height - 4} fontSize={10} fill="currentColor" opacity={0.6} textAnchor="end">
        {points[points.length - 1].date.toISOString().slice(0, 10)}
      </text>
      <text x={padding} y={12} fontSize={10} fill="currentColor" opacity={0.6}>
        {currencySymbol}
        {maxBid.toFixed(2)}
      </text>
      <text x={padding} y={height - padding + 12} fontSize={10} fill="currentColor" opacity={0.6}>
        {currencySymbol}
        {minBid.toFixed(2)}
      </text>
    </svg>
  );
}
