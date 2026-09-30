type Point = { date: string; orders: number };

function dayLabel(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  if (!year || !month || !day) return date;
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    timeZone: "UTC"
  });
}

export function AdminOrderFlowChart({ points }: { points: Point[] }) {
  const rows = points.length ? points : [];
  const total = rows.reduce((sum, row) => sum + row.orders, 0);
  const width = 640;
  const height = 220;
  const padL = 36;
  const padR = 12;
  const padT = 16;
  const padB = 32;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;
  const max = Math.max(1, ...rows.map((row) => row.orders));
  const last = Math.max(rows.length - 1, 1);

  const coords = rows.map((row, index) => {
    const x = padL + (index / last) * plotW;
    const y = padT + plotH - (row.orders / max) * plotH;
    return { ...row, x, y };
  });
  const line = coords.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
  const area =
    coords.length > 1
      ? `${padL},${padT + plotH} ${line} ${coords[coords.length - 1].x.toFixed(1)},${padT + plotH}`
      : "";
  const yTicks = [0, Math.round(max / 2), max].filter((value, index, all) => all.indexOf(value) === index);
  const xLabelEvery = rows.length > 16 ? 5 : rows.length > 8 ? 2 : 1;

  return (
    <section
      aria-label="Order flow"
      style={{
        background: "var(--admin-card-bg, #fff)",
        borderRadius: "12px",
        border: "1px solid var(--admin-card-border, #e8e2d9)",
        padding: "18px 18px 8px",
        boxShadow: "0 1px 2px rgba(15,23,42,0.045), 0 8px 22px rgba(15,23,42,0.035)"
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "baseline", flexWrap: "wrap" }}>
        <h3
          style={{
            fontSize: "20px",
            fontWeight: 800,
            color: "var(--admin-text, #2c2420)",
            borderLeft: "3px solid #b98a3e",
            paddingLeft: "10px",
            margin: 0
          }}
        >
          Order flow
        </h3>
        <p style={{ margin: 0, fontSize: "14px", color: "var(--admin-text-muted, #8a7060)" }}>
          {total} order{total === 1 ? "" : "s"} in the last 30 days
        </p>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Orders placed each day for the last 30 days" style={{ width: "100%", height: "auto", display: "block", marginTop: "8px" }}>
        {yTicks.map((tick) => {
          const y = padT + plotH - (tick / max) * plotH;
          return (
            <g key={tick}>
              <line x1={padL} x2={width - padR} y1={y} y2={y} stroke="var(--admin-card-border, #e8e2d9)" strokeWidth="1" />
              <text x={padL - 8} y={y + 4} textAnchor="end" fill="var(--admin-text-muted, #8a7060)" fontSize="11">
                {tick}
              </text>
            </g>
          );
        })}
        {area ? <polygon points={area} fill="rgba(22,109,70,0.12)" /> : null}
        {line ? <polyline points={line} fill="none" stroke="#166d46" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" /> : null}
        {coords.map((point) => (
          <circle key={point.date} cx={point.x} cy={point.y} r="3.5" fill="#b98a3e">
            <title>{`${dayLabel(point.date)}: ${point.orders} order${point.orders === 1 ? "" : "s"}`}</title>
          </circle>
        ))}
        {coords.map((point, index) =>
          index % xLabelEvery === 0 || index === coords.length - 1 ? (
            <text key={`${point.date}-label`} x={point.x} y={height - 8} textAnchor="middle" fill="var(--admin-text-muted, #8a7060)" fontSize="11">
              {dayLabel(point.date)}
            </text>
          ) : null
        )}
      </svg>
    </section>
  );
}
