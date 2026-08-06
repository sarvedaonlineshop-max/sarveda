"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AdminDashboardAnalytics } from "@/components/admin/AdminDashboardAnalytics";
import type { DashboardData } from "@/lib/admin-api";
import { fetchAdminDashboard } from "@/lib/admin-api";
import { formatINRFromPaise } from "@/lib/money";
import { adminTheme as t } from "@/lib/admin-theme";

const cardStyle: React.CSSProperties = {
  background: t.cardBg,
  borderRadius: "14px",
  border: `1px solid ${t.cardBorder}`,
  padding: "20px 22px",
  boxShadow: "0 1px 2px rgba(15,23,42,0.04)",
  transition: "box-shadow 0.2s ease, transform 0.2s ease, border-color 0.2s ease"
};

function StatusBadge({ status }: { status: string }) {
  const s = status.toUpperCase().replace(/_/g, "");
  let bg = "#f1f5f9";
  let color = "#334155";
  if (s.includes("PAID") || s.includes("PROCESSING")) {
    bg = "#d1fae5";
    color = "#047857";
  } else if (s.includes("SHIPPED")) {
    bg = "#dbeafe";
    color = "#1d4ed8";
  } else if (s.includes("DELIVERED")) {
    bg = "#ecfdf5";
    color = "#059669";
  } else if (s.includes("CANCEL")) {
    bg = "#fee2e2";
    color = "#b91c1c";
  } else if (s.includes("REFUND")) {
    bg = "#ffedd5";
    color = "#c2410c";
  }
  return (
    <span
      style={{
        background: bg,
        color,
        fontSize: "11px",
        fontWeight: 600,
        padding: "3px 10px",
        borderRadius: "999px"
      }}
    >
      {status.replace(/_/g, " ")}
    </span>
  );
}

export default function AdminDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchAdminDashboard()
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e: unknown) => {
        if (!cancelled) setErr(e instanceof Error ? e.message : "Dashboard failed");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (err)
    return (
      <p style={{ color: t.danger }} role="alert">
        {err}
      </p>
    );
  if (!data)
    return (
      <p style={{ color: t.textMuted }} role="status">
        Loading dashboard...
      </p>
    );

  const thSt: React.CSSProperties = {
    padding: "11px 16px",
    fontSize: "11px",
    fontWeight: 700,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: t.textMuted,
    background: t.tableHeadBg,
    textAlign: "left",
    whiteSpace: "nowrap"
  };
  const tdSt: React.CSSProperties = {
    padding: "13px 16px",
    fontSize: "13px",
    color: "#334155",
    borderBottom: `1px solid ${t.cardBorder}`
  };

  const lowStockCount = data.lowStockAlerts.length;

  const statCards = [
    { label: "Orders today", value: String(data.ordersCount.today), tone: t.primary },
    { label: "Orders (7 days)", value: String(data.ordersCount.thisWeek), tone: "#3b82f6" },
    { label: "Orders (month)", value: String(data.ordersCount.thisMonth), tone: "#8b5cf6" },
    { label: "Active products", value: String(data.productsByStatus.active), tone: t.accent },
    { label: "Draft products", value: String(data.productsByStatus.draft), tone: "#f59e0b" },
    { label: "Archived", value: String(data.productsByStatus.archived), tone: "#94a3b8" },
    { label: "Low stock SKUs", value: String(lowStockCount), tone: t.danger }
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      <div>
        <h2 style={{ fontSize: "22px", fontWeight: 700, color: t.text, letterSpacing: "-0.02em" }}>
          Dashboard
        </h2>
        <p style={{ fontSize: "13px", color: t.textMuted, marginTop: "4px" }}>
          Store ops snapshot plus WooCommerce dump analytics for the selected date range.
        </p>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
          gap: "16px"
        }}
      >
        {statCards.map((item) => (
          <div
            key={item.label}
            style={{ ...cardStyle, padding: "16px 18px" }}
            onMouseEnter={(e) => {
              e.currentTarget.style.boxShadow = "0 8px 24px rgba(99,102,241,0.12)";
              e.currentTarget.style.transform = "translateY(-2px)";
              e.currentTarget.style.borderColor = "#c7d2fe";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.boxShadow = "0 1px 2px rgba(15,23,42,0.04)";
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.borderColor = t.cardBorder;
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <p
                style={{
                  fontSize: "11px",
                  fontWeight: 700,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  color: t.textMuted,
                  marginBottom: "6px"
                }}
              >
                {item.label}
              </p>
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 999,
                  background: item.tone,
                  flexShrink: 0
                }}
              />
            </div>
            <p style={{ fontSize: "1.45rem", fontWeight: 700, color: t.text }}>{item.value}</p>
          </div>
        ))}
      </div>

      <div>
        <h3 style={{ fontSize: "15px", fontWeight: 700, color: t.text, marginBottom: "12px" }}>
          Analytics
        </h3>
        <AdminDashboardAnalytics />
      </div>

      <div style={cardStyle}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "14px",
            gap: "12px",
            flexWrap: "wrap"
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <h3 style={{ fontSize: "15px", fontWeight: 700, color: t.text }}>Low Stock</h3>
            <span
              style={{
                background: lowStockCount > 0 ? "#fee2e2" : "#d1fae5",
                color: lowStockCount > 0 ? "#b91c1c" : "#047857",
                fontSize: "12px",
                fontWeight: 700,
                padding: "3px 10px",
                borderRadius: "999px"
              }}
            >
              {lowStockCount} SKU{lowStockCount === 1 ? "" : "s"}
            </span>
          </div>
          <Link
            href="/admin/inventory"
            style={{ fontSize: "12px", color: t.primary, textDecoration: "none", fontWeight: 600 }}
          >
            View all
          </Link>
        </div>
        {lowStockCount === 0 ? (
          <p style={{ fontSize: "13px", color: t.textMuted, textAlign: "center", padding: "24px 0" }}>
            No low-stock SKUs
          </p>
        ) : (
          <div style={{ maxHeight: "320px", overflowY: "auto", paddingRight: "4px" }}>
            {data.lowStockAlerts.map((a) => (
              <div
                key={a.variantId}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "8px",
                  padding: "10px 0",
                  borderBottom: `1px solid ${t.cardBorder}`
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <p
                    style={{
                      fontSize: "13px",
                      fontWeight: 600,
                      color: t.text,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap"
                    }}
                  >
                    {a.productName}
                  </p>
                  <p style={{ fontSize: "11px", color: t.textMuted }}>
                    SKU {a.sku} · {a.onHand} on hand
                  </p>
                </div>
                <span
                  style={{
                    background: "#fee2e2",
                    color: "#b91c1c",
                    fontSize: "11px",
                    fontWeight: 600,
                    padding: "2px 8px",
                    borderRadius: "999px",
                    flexShrink: 0
                  }}
                >
                  Low
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={cardStyle}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "16px"
          }}
        >
          <h3 style={{ fontSize: "15px", fontWeight: 700, color: t.text }}>Recent Orders</h3>
          <Link
            href="/admin/orders"
            style={{ fontSize: "12px", color: t.primary, textDecoration: "none", fontWeight: 600 }}
          >
            All orders
          </Link>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: `2px solid ${t.cardBorder}` }}>
                <th style={thSt}>Order</th>
                <th style={thSt}>Customer</th>
                <th style={thSt}>Amount</th>
                <th style={thSt}>Status</th>
                <th style={thSt}>Date</th>
              </tr>
            </thead>
            <tbody>
              {data.recentOrders.map((o) => (
                <tr
                  key={o.id}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLTableRowElement).style.background = t.rowHover;
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLTableRowElement).style.background = "transparent";
                  }}
                >
                  <td style={tdSt}>
                    <Link
                      href={`/admin/orders/${o.id}`}
                      style={{
                        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                        fontWeight: 600,
                        color: t.primary,
                        textDecoration: "none"
                      }}
                    >
                      {o.orderNumber}
                    </Link>
                  </td>
                  <td style={tdSt}>{o.email}</td>
                  <td style={{ ...tdSt, fontWeight: 600 }}>{formatINRFromPaise(o.grandTotalInPaise)}</td>
                  <td style={tdSt}>
                    <StatusBadge status={o.status} />
                  </td>
                  <td style={{ ...tdSt, color: t.textMuted, fontSize: "12px", whiteSpace: "nowrap" }}>
                    {new Date(o.createdAt).toLocaleString("en-IN", {
                      dateStyle: "medium",
                      timeStyle: "short"
                    })}
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
