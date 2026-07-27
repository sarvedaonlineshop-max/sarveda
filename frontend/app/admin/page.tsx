"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AdminDashboardAnalytics } from "@/components/admin/AdminDashboardAnalytics";
import type { DashboardData } from "@/lib/admin-api";
import { fetchAdminDashboard } from "@/lib/admin-api";
import { formatINRFromPaise } from "@/lib/money";

const cardStyle: React.CSSProperties = {
  background: "#ffffff",
  borderRadius: "12px",
  border: "1px solid #e8e2d9",
  padding: "20px 22px",
  boxShadow: "0 1px 4px rgba(44,36,32,0.06)"
};

function StatusBadge({ status }: { status: string }) {
  const s = status.toUpperCase().replace(/_/g, "");
  let bg = "#f3f4f6";
  let color = "#374151";
  if (s.includes("PAID") || s.includes("PROCESSING")) {
    bg = "#dcfce7";
    color = "#166534";
  } else if (s.includes("SHIPPED")) {
    bg = "#dbeafe";
    color = "#1e40af";
  } else if (s.includes("DELIVERED")) {
    bg = "#f0fdf4";
    color = "#15803d";
  } else if (s.includes("CANCEL")) {
    bg = "#fee2e2";
    color = "#991b1b";
  } else if (s.includes("REFUND")) {
    bg = "#fef3c7";
    color = "#92400e";
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
      <p style={{ color: "#dc2626" }} role="alert">
        {err}
      </p>
    );
  if (!data)
    return (
      <p style={{ color: "#8a7060" }} role="status">
        Loading dashboard...
      </p>
    );

  const thSt: React.CSSProperties = {
    padding: "11px 16px",
    fontSize: "11px",
    fontWeight: 700,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "#8a7060",
    background: "#f9f7f4",
    textAlign: "left",
    whiteSpace: "nowrap"
  };
  const tdSt: React.CSSProperties = {
    padding: "13px 16px",
    fontSize: "13px",
    color: "#4a3f38",
    borderBottom: "1px solid #f0ece6"
  };

  const lowStockCount = data.lowStockAlerts.length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      <div>
        <h2 style={{ fontSize: "22px", fontWeight: 700, color: "#2c2420" }}>Dashboard</h2>
        <p style={{ fontSize: "13px", color: "#8a7060", marginTop: "4px" }}>
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
        {[
          { label: "Orders today", value: String(data.ordersCount.today) },
          { label: "Orders (7 days)", value: String(data.ordersCount.thisWeek) },
          { label: "Orders (month)", value: String(data.ordersCount.thisMonth) },
          { label: "Active products", value: String(data.productsByStatus.active) },
          { label: "Draft products", value: String(data.productsByStatus.draft) },
          { label: "Archived", value: String(data.productsByStatus.archived) },
          { label: "Low stock SKUs", value: String(lowStockCount) }
        ].map((item) => (
          <div key={item.label} style={{ ...cardStyle, padding: "16px 18px" }}>
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
              {item.label}
            </p>
            <p style={{ fontSize: "1.4rem", fontWeight: 700, color: "#2c2420" }}>{item.value}</p>
          </div>
        ))}
      </div>

      <div>
        <h3 style={{ fontSize: "15px", fontWeight: 700, color: "#2c2420", marginBottom: "12px" }}>
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
            <h3 style={{ fontSize: "15px", fontWeight: 700, color: "#2c2420" }}>Low Stock</h3>
            <span
              style={{
                background: lowStockCount > 0 ? "#fee2e2" : "#dcfce7",
                color: lowStockCount > 0 ? "#991b1b" : "#166534",
                fontSize: "12px",
                fontWeight: 700,
                padding: "3px 10px",
                borderRadius: "999px"
              }}
            >
              {lowStockCount} SKU{lowStockCount === 1 ? "" : "s"}
            </span>
          </div>
          <Link href="/admin/inventory" style={{ fontSize: "12px", color: "#c8960a", textDecoration: "none" }}>
            View all
          </Link>
        </div>
        {lowStockCount === 0 ? (
          <p style={{ fontSize: "13px", color: "#8a7060", textAlign: "center", padding: "24px 0" }}>
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
                  borderBottom: "1px solid #f0ece6"
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <p
                    style={{
                      fontSize: "13px",
                      fontWeight: 600,
                      color: "#2c2420",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap"
                    }}
                  >
                    {a.productName}
                  </p>
                  <p style={{ fontSize: "11px", color: "#8a7060" }}>
                    SKU {a.sku} · {a.onHand} on hand
                  </p>
                </div>
                <span
                  style={{
                    background: "#fee2e2",
                    color: "#991b1b",
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
          <h3 style={{ fontSize: "15px", fontWeight: 700, color: "#2c2420" }}>Recent Orders</h3>
          <Link href="/admin/orders" style={{ fontSize: "12px", color: "#c8960a", textDecoration: "none" }}>
            All orders
          </Link>
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
                <tr
                  key={o.id}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLTableRowElement).style.background = "#faf8f5";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLTableRowElement).style.background = "transparent";
                  }}
                >
                  <td style={tdSt}>
                    <Link
                      href={`/admin/orders/${o.id}`}
                      style={{
                        fontFamily: "monospace",
                        fontWeight: 600,
                        color: "#c8960a",
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
                  <td style={{ ...tdSt, color: "#8a7060", fontSize: "12px", whiteSpace: "nowrap" }}>
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
