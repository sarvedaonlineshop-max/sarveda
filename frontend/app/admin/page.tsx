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
  const iw = w - pad.l - pad.r;
  const ih = h - pad.t - pad.b;
  const max = Math.max(1, ...points.map((p) => p.revenueInPaise));
  const n = Math.max(1, points.length);
  const slot = iw / n;

  if (kind === "bar") {
    return (
      <svg viewBox={`0 0 ${w} ${h}`} className="h-auto w-full" role="img" aria-label="Revenue chart">
        {points.map((p, i) => {
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
        })}
      </svg>
    );
  }

  const linePath = points.map((p, i) => {
    const x = pad.l + i * slot + slot / 2;
    const y = pad.t + ih - (p.revenueInPaise / max) * ih;
    return `${i === 0 ? "M" : "L"}${x},${y}`;
  }).join(" ");

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-auto w-full" role="img" aria-label="Revenue chart">
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
    </svg>
  );
}

const cardStyle: React.CSSProperties = {
  background: "#ffffff",
  borderRadius: "12px",
  border: "1px solid #e8e2d9",
  padding: "20px 22px",
  boxShadow: "0 1px 4px rgba(44,36,32,0.06)"
};

type StatCardProps = {
  label: string;
  value: string;
  iconBg: string;
  iconColor: string;
  iconPath: string;
};

function StatCard({ label, value, iconBg, iconColor, iconPath }: StatCardProps) {
  return (
    <div style={cardStyle}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div>
          <p style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#8a7060", marginBottom: "8px" }}>
            {label}
          </p>
          <p style={{ fontSize: "1.6rem", fontWeight: 700, color: "#2c2420", lineHeight: 1.1 }}>
            {value}
          </p>
        </div>
        <div style={{ width: "44px", height: "44px", borderRadius: "10px", background: iconBg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d={iconPath} />
          </svg>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const s = status.toUpperCase().replace(/_/g, "");
  let bg = "#f3f4f6"; let color = "#374151";
  if (s.includes("PAID") || s.includes("PROCESSING")) { bg = "#dcfce7"; color = "#166534"; }
  else if (s.includes("SHIPPED")) { bg = "#dbeafe"; color = "#1e40af"; }
  else if (s.includes("DELIVERED")) { bg = "#f0fdf4"; color = "#15803d"; }
  else if (s.includes("CANCEL")) { bg = "#fee2e2"; color = "#991b1b"; }
  else if (s.includes("REFUND")) { bg = "#fef3c7"; color = "#92400e"; }
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
  if (!data) return <p style={{ color: "#8a7060" }} role="status">Loading dashboard...</p>;

  const thSt: React.CSSProperties = { padding: "11px 16px", fontSize: "11px", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#8a7060", background: "#f9f7f4", textAlign: "left", whiteSpace: "nowrap" };
  const tdSt: React.CSSProperties = { padding: "13px 16px", fontSize: "13px", color: "#4a3f38", borderBottom: "1px solid #f0ece6" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>

      <div>
        <h2 style={{ fontSize: "22px", fontWeight: 700, color: "#2c2420" }}>Welcome back</h2>
        <p style={{ fontSize: "13px", color: "#8a7060", marginTop: "4px" }}>
          {"Here's what's happening with Sarveda today."}
        </p>
      </div>

      {/* Revenue stat cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px" }}>
        <StatCard label="Lifetime Revenue" value={formatINRFromPaise(data.totalRevenueInPaise)} iconBg="#dcfce7" iconColor="#16a34a" iconPath="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
        <StatCard label="Revenue Today" value={formatINRFromPaise(data.revenueInPaise.today)} iconBg="#fef3c7" iconColor="#d97706" iconPath="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10zM12 6v6l4 2" />
        <StatCard label="Last 7 Days" value={formatINRFromPaise(data.revenueInPaise.last7Days)} iconBg="#dbeafe" iconColor="#2563eb" iconPath="M22 12h-4l-3 9L9 3l-3 9H2" />
        <StatCard label="This Month" value={formatINRFromPaise(data.revenueInPaise.thisMonth)} iconBg="#f3e8ff" iconColor="#9333ea" iconPath="M3 4h18v18H3zM16 2v4M8 2v4M3 10h18" />
      </div>

      {/* Order + product counts */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "16px" }}>
        {[
          { label: "Orders today", value: String(data.ordersCount.today) },
          { label: "Orders (7 days)", value: String(data.ordersCount.thisWeek) },
          { label: "Orders (month)", value: String(data.ordersCount.thisMonth) },
          { label: "Active products", value: String(data.productsByStatus.active) },
          { label: "Draft products", value: String(data.productsByStatus.draft) },
          { label: "Archived", value: String(data.productsByStatus.archived) },
        ].map((item) => (
          <div key={item.label} style={{ ...cardStyle, padding: "16px 18px" }}>
            <p style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#8a7060", marginBottom: "6px" }}>{item.label}</p>
            <p style={{ fontSize: "1.4rem", fontWeight: 700, color: "#2c2420" }}>{item.value}</p>
          </div>
        ))}
      </div>

      {/* Chart + low stock */}
      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">

        <div style={cardStyle}>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "12px", marginBottom: "16px" }}>
            <h3 style={{ fontSize: "15px", fontWeight: 700, color: "#2c2420" }}>Revenue Chart</h3>
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
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

        <div style={cardStyle}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px" }}>
            <h3 style={{ fontSize: "15px", fontWeight: 700, color: "#2c2420" }}>Low Stock</h3>
            <Link href="/admin/inventory" style={{ fontSize: "12px", color: "#c8960a", textDecoration: "none" }}>View all</Link>
          </div>
          {data.lowStockAlerts.length === 0 ? (
            <p style={{ fontSize: "13px", color: "#8a7060", textAlign: "center", padding: "24px 0" }}>No low-stock SKUs</p>
          ) : (
            data.lowStockAlerts.map((a) => (
              <div key={a.variantId} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", padding: "10px 0", borderBottom: "1px solid #f0ece6" }}>
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontSize: "13px", fontWeight: 600, color: "#2c2420", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.productName}</p>
                  <p style={{ fontSize: "11px", color: "#8a7060" }}>SKU {a.sku} · {a.onHand} on hand</p>
                </div>
                <span style={{ background: "#fee2e2", color: "#991b1b", fontSize: "11px", fontWeight: 600, padding: "2px 8px", borderRadius: "999px", flexShrink: 0 }}>Low</span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Insights */}
      {data.insights.tips.length > 0 && (
        <div style={{ ...cardStyle, background: "linear-gradient(135deg, #f9f7f0, #fffbf5)", borderColor: "#e0d4b0" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "14px" }}>
            <h3 style={{ fontSize: "15px", fontWeight: 700, color: "#2c2420" }}>Commerce Insights</h3>
            <span style={{ background: "#fef3c7", color: "#92400e", fontSize: "10px", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", padding: "3px 8px", borderRadius: "999px" }}>Rule-based</span>
          </div>
          <ul style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "16px" }}>
            {data.insights.tips.map((t) => (
              <li key={t} style={{ display: "flex", gap: "10px", fontSize: "13px", color: "#4a3f38" }}>
                <span style={{ color: "#c8960a", flexShrink: 0 }}>✦</span>{t}
              </li>
            ))}
          </ul>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
            <div>
              <p style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#8a7060", marginBottom: "8px" }}>Fast movers (30d)</p>
              {data.insights.fastMovers.length === 0 ? (
                <p style={{ fontSize: "12px", color: "#b8a898" }}>No data yet</p>
              ) : (
                <ul style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  {data.insights.fastMovers.map((p) => (
                    <li key={p.productId} style={{ display: "flex", justifyContent: "space-between", gap: "8px", fontSize: "13px" }}>
                      <Link href={`/admin/products/${p.productId}`} style={{ color: "#c8960a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</Link>
                      <span style={{ fontFamily: "monospace", fontSize: "12px", color: "#8a7060", flexShrink: 0 }}>{p.unitsSold}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <p style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#8a7060", marginBottom: "8px" }}>Slow movers</p>
              {data.insights.slowMovers.length === 0 ? (
                <p style={{ fontSize: "12px", color: "#b8a898" }}>None flagged</p>
              ) : (
                <ul style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  {data.insights.slowMovers.map((p) => (
                    <li key={p.productId} style={{ display: "flex", justifyContent: "space-between", gap: "8px", fontSize: "13px" }}>
                      <span style={{ color: "#4a3f38", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
                      <span style={{ fontFamily: "monospace", fontSize: "12px", color: "#8a7060", flexShrink: 0 }}>{p.unitsSold}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Recent orders */}
      <div style={cardStyle}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
          <h3 style={{ fontSize: "15px", fontWeight: 700, color: "#2c2420" }}>Recent Orders</h3>
          <Link href="/admin/orders" style={{ fontSize: "12px", color: "#c8960a", textDecoration: "none" }}>All orders</Link>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "2px solid #f0ece6" }}>
                <th style={thSt}>Order</th>
                <th style={thSt}>Customer</th>
                <th style={thSt}>Amount</th>
                <th style={thSt}>Status</th>
                <th style={thSt}>Date</th>
              </tr>
            </thead>
            <tbody>
              {data.recentOrders.map((o) => (
                <tr key={o.id}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLTableRowElement).style.background = "#faf8f5"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLTableRowElement).style.background = "transparent"; }}
                >
                  <td style={tdSt}>
                    <Link href={`/admin/orders/${o.id}`} style={{ fontFamily: "monospace", fontWeight: 600, color: "#c8960a", textDecoration: "none" }}>{o.orderNumber}</Link>
                  </td>
                  <td style={tdSt}>{o.email}</td>
                  <td style={{ ...tdSt, fontWeight: 600 }}>{formatINRFromPaise(o.grandTotalInPaise)}</td>
                  <td style={tdSt}><StatusBadge status={o.status} /></td>
                  <td style={{ ...tdSt, color: "#8a7060", fontSize: "12px", whiteSpace: "nowrap" }}>
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
