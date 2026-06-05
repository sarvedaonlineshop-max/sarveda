"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { DashboardData } from "@/lib/admin-api";
import { fetchAdminDashboard } from "@/lib/admin-api";
import { formatINRFromPaise } from "@/lib/money";

type ChartRange = "7d" | "30d" | "12m";
type ChartPoint = { label: string; revenueInPaise: number };

function shortInr(paise: number): string {
  const r = paise / 100;
  if (r >= 100000) return `₹${(r / 100000).toFixed(1)}L`;
  if (r >= 1000) return `₹${(r / 1000).toFixed(1)}k`;
  return `₹${Math.round(r)}`;
}

function RevenueChart({ points, kind }: { points: ChartPoint[]; kind: "bar" | "line" }) {
  const w = 720; const h = 200;
  const pad = { t: 28, r: 16, b: 36, l: 16 };
  const iw = w - pad.l - pad.r; const ih = h - pad.t - pad.b;
  const max = Math.max(1, ...points.map((p) => p.revenueInPaise));
  const n = Math.max(1, points.length); const slot = iw / n;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-auto w-full" role="img" aria-label="Revenue chart">
      {kind === "bar"
        ? points.map((p, i) => {
            const bw = Math.max(4, slot * 0.5);
            const x = pad.l + i * slot + (slot - bw) / 2;
            const bh = (p.revenueInPaise / max) * ih;
            const y = pad.t + ih - bh;
            return (
              <g key={p.label}>
                <rect x={x} y={y} width={bw} height={Math.max(bh, 2)} rx={4} fill="#1e3a2f" opacity={0.85} />
                <text x={x + bw / 2} y={y - 4} textAnchor="middle" fontSize={8} fill="#8a7060">{shortInr(p.revenueInPaise)}</text>
                <text x={x + bw / 2} y={h - 8} textAnchor="middle" fontSize={8} fill="#b8a898">{p.label}</text>
              </g>
            );
          })
        : (() => {
            const linePath = points.map((p, i) => {
              const x = pad.l + i * slot + slot / 2;
              const y = pad.t + ih - (p.revenueInPaise / max) * ih;
              return `${i === 0 ? "M" : "L"}${x},${y}`;
            }).join(" ");
            return (
              <>
                <path d={linePath} fill="none" strokeWidth={2.5} stroke="#c8960a" strokeLinejoin="round" strokeLinecap="round" />
                {points.map((p, i) => {
                  const x = pad.l + i * slot + slot / 2;
                  const y = pad.t + ih - (p.revenueInPaise / max) * ih;
                  return (
                    <g key={p.label}>
                      <circle cx={x} cy={y} r={4} fill="#c8960a" />
                      <text x={x} y={h - 8} textAnchor="middle" fontSize={8} fill="#b8a898">{p.label}</text>
                    </g>
                  );
                })}
              </>
            );
          })()
      }
    </svg>
  );
}

const card: React.CSSProperties = {
  background: "#ffffff", borderRadius: "12px",
  border: "1px solid #e8e2d9", padding: "20px 22px",
  boxShadow: "0 1px 4px rgba(44,36,32,0.06)"
};

const iconBox = (bg: string): React.CSSProperties => ({
  width: "44px", height: "44px", borderRadius: "10px", background: bg,
  display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0
});

function StatCard({ label, value, icon, iconBg, sub }: { label: string; value: string; icon: React.ReactNode; iconBg: string; sub?: string }) {
  return (
    <div style={card}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div>
          <p style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#8a7060", marginBottom: "8px" }}>{label}</p>
          <p style={{ fontSize: "1.6rem", fontWeight: 700, color: "#2c2420", lineHeight: 1.1 }}>{value}</p>
          {sub && <p style={{ fontSize: "12px", color: "#b8a898", marginTop: "4px" }}>{sub}</p>}
        </div>
        <div style={iconBox(iconBg)}>{icon}</div>
      </div>
    </div>
  );
}

const statusColors: Record<string, { bg: string; color: string }> = {
  PAID: { bg: "#dcfce7", color: "#166534" },
  PROCESSING: { bg: "#dcfce7", color: "#166534" },
  SHIPPED: { bg: "#dbeafe", color: "#1e40af" },
  DELIVERED: { bg: "#f0fdf4", color: "#15803d" },
  CANCELLED: { bg: "#fee2e2", color: "#991b1b" },
  REFUNDED: { bg: "#fef3c7", color: "#92400e" },
  PENDING: { bg: "#f3f4f6", color: "#374151" },
};

function StatusBadge({ status }: { status: string }) {
  const key = status.toUpperCase().replace(/_/g, "");
  const found = Object.entries(statusColors).find(([k]) => key.includes(k));
  const { bg, color } = found?.[1] ?? { bg: "#f3f4f6", color: "#374151" };
  return (
    <span style={{ background: bg, color, fontSize: "11px", fontWeight: 600, padding: "3px 10px", borderRadius: "999px" }}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

export default function AdminDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [chartRange, setChartRange] = useState<ChartRange>("7d");
  const [chartKind, setChartKind] = useState<"bar" | "line">("bar");

  useEffect(() => {
    let cancelled = false;
    fetchAdminDashboard()
      .then((d) => { if (!cancelled) setData(d); })
      .catch((e: unknown) => { if (!cancelled) setErr(e instanceof Error ? e.message : "Dashboard failed"); });
    return () => { cancelled = true; };
  }, []);

  const chartPoints = useMemo<ChartPoint[]>(() => {
    if (!data) return [];
    if (chartRange === "7d") return data.revenueByDayLast7.map((r) => ({ label: r.date.slice(5), revenueInPaise: r.revenueInPaise }));
    if (chartRange === "30d") return data.revenueByDayLast30.map((r) => ({ label: r.date.slice(5), revenueInPaise: r.revenueInPaise }));
    return data.revenueByMonthLast12.map((r) => ({ label: r.month.slice(5), revenueInPaise: r.revenueInPaise }));
  }, [data, chartRange]);

  if (err) return <p style={{ color: "#dc2626" }} role="alert">{err}</p>;
  if (!data) return <p style={{ color: "#8a7060" }} role="status">Loading dashboard…</p>;

  const thStyle: React.CSSProperties = { padding: "11px 16px", fontSize: "11px", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#8a7060", background: "#f9f7f4", textAlign: "left", whiteSpace: "nowrap" };
  const tdStyle: React.CSSProperties = { padding: "13px 16px", fontSize: "13px", color: "#4a3f38", borderBottom: "1px solid #f0ece6" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>

      {/* Welcome */}
      <div>
        <h2 style={{ fontSize: "22px", fontWeight: 700, color: "#2c2420" }}>Welcome back 👋</h2>
        <p style={{ fontSize: "13px", color: "#8a7060", marginTop: "4px" }}>
          {Here's what's happening with Sarveda today.}
        </p>
      </div>

      {/* Revenue stat cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px" }}>
        <StatCard label="Lifetime Revenue" value={formatINRFromPaise(data.totalRevenueInPaise)} iconBg="#dcfce7"
          icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>}
        />
        <StatCard label="Today" value={formatINRFromPaise(data.revenueInPaise.today)} iconBg="#fef3c7"
          icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>}
        />
        <StatCard label="Last 7 Days" value={formatINRFromPaise(data.revenueInPaise.last7Days)} iconBg="#dbeafe"
          icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>}
        />
        <StatCard label="This Month" value={formatINRFromPaise(data.revenueInPaise.thisMonth)} iconBg="#f3e8ff"
          icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#9333ea" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>}
        />
      </div>

      {/* Order + product stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "16px" }}>
        {[
          { label: "Orders today", value: data.ordersCount.today },
          { label: "Orders (7 days)", value: data.ordersCount.thisWeek },
          { label: "Orders (month)", value: data.ordersCount.thisMonth },
          { label: "Active products", value: data.productsByStatus.active },
          { label: "Draft products", value: data.productsByStatus.draft },
          { label: "Archived", value: data.productsByStatus.archived },
        ].map(({ label, value }) => (
          <div key={label} style={{ ...card, padding: "16px 18px" }}>
            <p style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#8a7060", marginBottom: "6px" }}>{label}</p>
            <p style={{ fontSize: "1.4rem", fontWeight: 700, color: "#2c2420" }}>{value}</p>
          </div>
        ))}
      </div>

      {/* Chart + Low stock row */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: "20px" }} className="lg:grid-cols-[1fr_340px] grid-cols-1">

        {/* Revenue chart */}
        <div style={card}>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "12px", marginBottom: "16px" }}>
            <h3 style={{ fontSize: "15px", fontWeight: 700, color: "#2c2420" }}>Revenue Chart</h3>
            <div style={{ display: "flex", gap: "8px" }}>
              {(["7d", "30d", "12m"] as const).map((v) => (
                <button key={v} type="button" onClick={() => setChartRange(v)}
                  style={{ padding: "5px 12px", borderRadius: "6px", fontSize: "12px", fontWeight: 500, cursor: "pointer", border: "1px solid", borderColor: chartRange === v ? "#1e3a2f" : "#e0d8ce", background: chartRange === v ? "#1e3a2f" : "#ffffff", color: chartRange === v ? "#fffbf5" : "#6b5c52" }}>
                  {v === "7d" ? "7 Days" : v === "30d" ? "30 Days" : "12 Months"}
                </button>
              ))}
              <button type="button" onClick={() => setChartKind(chartKind === "bar" ? "line" : "bar")}
                style={{ padding: "5px 12px", borderRadius: "6px", fontSize: "12px", fontWeight: 500, cursor: "pointer", border: "1px solid #e0d8ce", background: "#f4f1ec", color: "#6b5c52" }}>
                {chartKind === "bar" ? "Line" : "Bar"}
              </button>
            </div>
          </div>
          <RevenueChart points={chartPoints} kind={chartKind} />
        </div>

        {/* Low stock */}
        <div style={card}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px" }}>
            <h3 style={{ fontSize: "15px", fontWeight: 700, color: "#2c2420" }}>Low Stock</h3>
            <Link href="/admin/inventory" style={{ fontSize: "12px", color: "#c8960a", textDecoration: "none" }}>View all →</Link>
          </div>
          {data.lowStockAlerts.length === 0 ? (
            <div style={{ textAlign: "center", padding: "24px 0" }}>
              <p style={{ fontSize: "13px", color: "#8a7060" }}>✓ No low-stock SKUs</p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0" }}>
              {data.lowStockAlerts.map((a) => (
                <div key={a.variantId} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", padding: "10px 0", borderBottom: "1px solid #f0ece6" }}>
                  <div style={{ minWidth: 0 }}>
                    <p style={{ fontSize: "13px", fontWeight: 600, color: "#2c2420", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.productName}</p>
                    <p style={{ fontSize: "11px", color: "#8a7060" }}>SKU {a.sku} · {a.onHand} on hand</p>
                  </div>
                  <span style={{ background: "#fee2e2", color: "#991b1b", fontSize: "11px", fontWeight: 600, padding: "2px 8px", borderRadius: "999px", flexShrink: 0 }}>Low</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Commerce insights */}
      {data.insights.tips.length > 0 && (
        <div style={{ ...card, background: "linear-gradient(135deg, #f9f7f0, #fffbf5)", borderColor: "#e0d4b0" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "14px" }}>
            <h3 style={{ fontSize: "15px", fontWeight: 700, color: "#2c2420" }}>Commerce Insights</h3>
            <span style={{ background: "#fef3c7", color: "#92400e", fontSize: "10px", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", padding: "3px 8px", borderRadius: "999px" }}>Rule-based</span>
          </div>
          <ul style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {data.insights.tips.map((t) => (
              <li key={t} style={{ display: "flex", gap: "10px", fontSize: "13px", color: "#4a3f38" }}>
                <span style={{ color: "#c8960a", flexShrink: 0 }}>✦</span>{t}
              </li>
            ))}
          </ul>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px", marginTop: "16px" }}>
            {[
              { title: "Fast movers (30d)", items: data.insights.fastMovers, getValue: (p: typeof data.insights.fastMovers[0]) => p.unitsSold, getLink: (p: typeof data.insights.fastMovers[0]) => `/admin/products/${p.productId}`, getName: (p: typeof data.insights.fastMovers[0]) => p.name },
              { title: "Slow movers (<2 units)", items: data.insights.slowMovers, getValue: (p: typeof data.insights.slowMovers[0]) => p.unitsSold, getLink: null, getName: (p: typeof data.insights.slowMovers[0]) => p.name }
            ].map(({ title, items, getValue, getLink, getName }) => (
              <div key={title}>
                <p style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#8a7060", marginBottom: "8px" }}>{title}</p>
                {items.length === 0 ? <p style={{ fontSize: "12px", color: "#b8a898" }}>No data yet</p> : (
                  <ul style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    {items.map((p) => (
                      <li key={p.productId} style={{ display: "flex", justifyContent: "space-between", gap: "8px", fontSize: "13px" }}>
                        {getLink ? (
                          <Link href={getLink(p as typeof data.insights.fastMovers[0])} style={{ color: "#c8960a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={getName(p as any)}>{getName(p as any)}</Link>
                        ) : (
                          <span style={{ color: "#4a3f38", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{getName(p as any)}</span>
                        )}
                        <span style={{ fontFamily: "monospace", fontSize: "12px", color: "#8a7060", flexShrink: 0 }}>{getValue(p as any)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent orders */}
      <div style={card}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
          <h3 style={{ fontSize: "15px", fontWeight: 700, color: "#2c2420" }}>Recent Orders</h3>
          <Link href="/admin/orders" style={{ fontSize: "12px", color: "#c8960a", textDecoration: "none" }}>All orders →</Link>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "2px solid #f0ece6" }}>
                {["Order", "Customer", "Amount", "Status", "Date"].map((h) => (
                  <th key={h} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.recentOrders.map((o) => (
                <tr key={o.id} style={{ transition: "background 0.1s" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "#faf8f5")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <td style={tdStyle}>
                    <Link href={`/admin/orders/${o.id}`} style={{ fontFamily: "monospace", fontWeight: 600, color: "#c8960a", textDecoration: "none" }}>{o.orderNumber}</Link>
                  </td>
                  <td style={tdStyle}>{o.email}</td>
                  <td style={{ ...tdStyle, fontWeight: 600 }}>{formatINRFromPaise(o.grandTotalInPaise)}</td>
                  <td style={tdStyle}><StatusBadge status={o.status} /></td>
                  <td style={{ ...tdStyle, color: "#8a7060", fontSize: "12px", whiteSpace: "nowrap" }}>
                    {new Date(o.createdAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
