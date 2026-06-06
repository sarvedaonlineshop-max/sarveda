"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import type { DashboardData } from "@/lib/admin-api";
import { fetchAdminDashboard } from "@/lib/admin-api";
import { formatINRFromPaise } from "@/lib/money";

const card: React.CSSProperties = {
  background: "#fff",
  borderRadius: "12px",
  border: "1px solid #e8e2d9",
  boxShadow: "0 1px 4px rgba(44,36,32,0.06)",
  padding: "20px 24px"
};

function MiniBar({
  label,
  value,
  max,
  color
}: {
  label: string;
  value: number;
  max: number;
  color: string;
}) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div style={{ marginBottom: "10px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
        <span
          style={{
            fontSize: "12px",
            color: "#4a3f38",
            maxWidth: "200px",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap"
          }}
        >
          {label}
        </span>
        <span
          style={{
            fontSize: "12px",
            fontWeight: 700,
            color: "#2c2420",
            marginLeft: "8px",
            flexShrink: 0
          }}
        >
          {value}
        </span>
      </div>
      <div
        style={{
          height: "6px",
          borderRadius: "999px",
          background: "#f0ece6",
          overflow: "hidden"
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${pct}%`,
            background: color,
            borderRadius: "999px",
            transition: "width 0.4s ease"
          }}
        />
      </div>
    </div>
  );
}

export default function AdminReportsPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetchAdminDashboard()
      .then(setData)
      .catch((e) => setErr(e instanceof Error ? e.message : "Failed"));
  }, []);

  if (err) return <p style={{ color: "#dc2626" }}>{err}</p>;
  if (!data) return <p style={{ color: "#8a7060" }}>Loading reports...</p>;

  const revenueRows = [
    { label: "Today", value: data.revenueInPaise.today },
    { label: "This week", value: data.revenueInPaise.last7Days },
    { label: "This month", value: data.revenueInPaise.thisMonth },
    { label: "Lifetime", value: data.totalRevenueInPaise }
  ];

  const orderRows = [
    { label: "Today", value: data.ordersCount.today },
    { label: "This week", value: data.ordersCount.thisWeek },
    { label: "This month", value: data.ordersCount.thisMonth }
  ];

  const avgOrder =
    data.ordersCount.thisMonth > 0
      ? data.revenueInPaise.thisMonth / data.ordersCount.thisMonth
      : 0;

  const maxRevenue = Math.max(...data.revenueByDayLast30.map((r) => r.revenueInPaise), 1);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      <div>
        <h1 style={{ fontSize: "22px", fontWeight: 700, color: "#2c2420" }}>Revenue Reports</h1>
        <p style={{ fontSize: "13px", color: "#8a7060", marginTop: "4px" }}>
          Based on paid orders only
        </p>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))",
          gap: "14px"
        }}
      >
        {revenueRows.map((r) => (
          <div key={r.label} style={{ ...card, padding: "16px 18px" }}>
            <p
              style={{
                fontSize: "11px",
                fontWeight: 700,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: "#8a7060",
                marginBottom: "6px"
              }}
            >
              {r.label}
            </p>
            <p style={{ fontSize: "1.4rem", fontWeight: 700, color: "#2c2420" }}>
              {formatINRFromPaise(r.value)}
            </p>
          </div>
        ))}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))",
          gap: "14px"
        }}
      >
        {orderRows.map((r) => (
          <div key={r.label} style={{ ...card, padding: "16px 18px" }}>
            <p
              style={{
                fontSize: "11px",
                fontWeight: 700,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: "#8a7060",
                marginBottom: "6px"
              }}
            >
              Orders {r.label}
            </p>
            <p style={{ fontSize: "1.4rem", fontWeight: 700, color: "#2c2420" }}>{r.value}</p>
          </div>
        ))}
        <div style={{ ...card, padding: "16px 18px" }}>
          <p
            style={{
              fontSize: "11px",
              fontWeight: 700,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: "#8a7060",
              marginBottom: "6px"
            }}
          >
            Avg Order (month)
          </p>
          <p style={{ fontSize: "1.4rem", fontWeight: 700, color: "#2c2420" }}>
            {formatINRFromPaise(Math.round(avgOrder))}
          </p>
        </div>
      </div>

      <div style={card}>
        <h3 style={{ fontSize: "15px", fontWeight: 700, color: "#2c2420", marginBottom: "16px" }}>
          Daily Revenue — Last 30 Days
        </h3>
        <div style={{ display: "flex", alignItems: "flex-end", gap: "3px", height: "120px" }}>
          {data.revenueByDayLast30.map((r, i) => {
            const h = maxRevenue > 0 ? (r.revenueInPaise / maxRevenue) * 100 : 0;
            return (
              <div
                key={i}
                title={`${r.date}: ${formatINRFromPaise(r.revenueInPaise)}`}
                style={{
                  flex: 1,
                  height: `${Math.max(h, 2)}%`,
                  background: h > 0 ? "#1e3a2f" : "#f0ece6",
                  borderRadius: "2px 2px 0 0",
                  minWidth: "4px",
                  transition: "height 0.3s ease",
                  cursor: "pointer"
                }}
              />
            );
          })}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: "6px" }}>
          <span style={{ fontSize: "10px", color: "#8a7060" }}>
            {data.revenueByDayLast30[0]?.date.slice(5)}
          </span>
          <span style={{ fontSize: "10px", color: "#8a7060" }}>
            {data.revenueByDayLast30[data.revenueByDayLast30.length - 1]?.date.slice(5)}
          </span>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
        <div style={card}>
          <h3 style={{ fontSize: "15px", fontWeight: 700, color: "#2c2420", marginBottom: "14px" }}>
            Top Sellers (30 days)
          </h3>
          {data.insights.fastMovers.length === 0 ? (
            <p style={{ fontSize: "13px", color: "#8a7060" }}>No data yet</p>
          ) : (
            data.insights.fastMovers.map((p) => (
              <MiniBar
                key={p.productId}
                label={p.name}
                value={p.unitsSold}
                max={data.insights.fastMovers[0].unitsSold}
                color="#1e3a2f"
              />
            ))
          )}
        </div>
        <div style={card}>
          <h3 style={{ fontSize: "15px", fontWeight: 700, color: "#2c2420", marginBottom: "14px" }}>
            Needs Attention
          </h3>
          {data.insights.slowMovers.length === 0 ? (
            <p style={{ fontSize: "13px", color: "#8a7060" }}>All products moving well</p>
          ) : (
            data.insights.slowMovers.map((p) => (
              <MiniBar
                key={p.productId}
                label={p.name}
                value={p.unitsSold}
                max={5}
                color="#c8960a"
              />
            ))
          )}
        </div>
      </div>

      <div style={card}>
        <h3 style={{ fontSize: "15px", fontWeight: 700, color: "#2c2420", marginBottom: "14px" }}>
          Product Inventory Health
        </h3>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))",
            gap: "12px"
          }}
        >
          {[
            { label: "Active", value: data.productsByStatus.active, color: "#166534", bg: "#dcfce7" },
            { label: "Draft", value: data.productsByStatus.draft, color: "#92400e", bg: "#fef3c7" },
            { label: "Archived", value: data.productsByStatus.archived, color: "#6b7280", bg: "#f3f4f6" },
            { label: "Low stock", value: data.lowStockAlerts.length, color: "#991b1b", bg: "#fee2e2" }
          ].map((s) => (
            <div
              key={s.label}
              style={{
                background: s.bg,
                borderRadius: "8px",
                padding: "12px 16px"
              }}
            >
              <p
                style={{
                  fontSize: "11px",
                  fontWeight: 700,
                  color: s.color,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  marginBottom: "4px"
                }}
              >
                {s.label}
              </p>
              <p style={{ fontSize: "1.5rem", fontWeight: 700, color: s.color }}>{s.value}</p>
            </div>
          ))}
        </div>
      </div>

      <p style={{ fontSize: "12px", color: "#8a7060", textAlign: "center" }}>
        For detailed GST reports, export orders from the{" "}
        <Link href="/admin/orders" style={{ color: "#c8960a" }}>
          Orders page
        </Link>
        .
      </p>
    </div>
  );
}
