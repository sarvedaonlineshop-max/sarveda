"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowRight,
  BadgeIndianRupee,
  Box,
  Clock3,
  Layers3,
  PackageCheck,
  ShoppingCart
} from "lucide-react";
import { AdminDashboardAnalytics } from "@/components/admin/AdminDashboardAnalytics";
import type { DashboardData } from "@/lib/admin-api";
import { fetchAdminDashboard } from "@/lib/admin-api";
import { formatINRFromPaise } from "@/lib/money";
import { adminTheme as t } from "@/lib/admin-theme";

const cardStyle: React.CSSProperties = {
  background: "var(--admin-card-bg, #fff)",
  borderRadius: "18px",
  border: "1px solid var(--admin-card-border, #e8e2d9)",
  padding: "20px 22px",
  boxShadow: "0 1px 2px rgba(15,23,42,0.04)",
  transition: "box-shadow 0.2s ease, transform 0.2s ease, border-color 0.2s ease"
};

function StatusBadge({ status }: { status: string }) {
  const s = status.toUpperCase().replace(/_/g, "");
  let bg = "#f5f0e8";
  let color = "#8a6200";
  let border = "rgba(185,138,62,0.2)";

  if (s.includes("PAID") || s.includes("PROCESSING")) {
    bg = "#dcfce7";
    color = "#166534";
    border = "rgba(34,197,94,0.18)";
  } else if (s.includes("SHIPPED")) {
    bg = "#dbeafe";
    color = "#1d4ed8";
    border = "rgba(59,130,246,0.18)";
  } else if (s.includes("DELIVERED")) {
    bg = "#ecfdf5";
    color = "#059669";
    border = "rgba(16,185,129,0.18)";
  } else if (s.includes("CANCEL")) {
    bg = "#fee2e2";
    color = "#b91c1c";
    border = "rgba(239,68,68,0.18)";
  } else if (s.includes("REFUND")) {
    bg = "#ffedd5";
    color = "#c2410c";
    border = "rgba(249,115,22,0.18)";
  }

  return (
    <span
      style={{
        background: bg,
        color,
        border: `1px solid ${border}`,
        fontSize: "11px",
        fontWeight: 700,
        padding: "4px 10px",
        borderRadius: "999px",
        display: "inline-flex",
        alignItems: "center",
        gap: "6px"
      }}
    >
      <span
        style={{
          width: "6px",
          height: "6px",
          borderRadius: "50%",
          background: color,
          display: "inline-block"
        }}
      />
      {status.replace(/_/g, " ")}
    </span>
  );
}

type StatCard = {
  label: string;
  value: string;
  tone: string;
  icon: React.ReactNode;
  note: string;
};

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

  if (err) {
    return (
      <div
        role="alert"
        style={{
          ...cardStyle,
          borderColor: "rgba(239,68,68,0.24)",
          background: "linear-gradient(180deg, #fff, #fff5f5)",
          color: t.danger
        }}
      >
        {err}
      </div>
    );
  }

  if (!data) {
    return (
      <div
        role="status"
        style={{
          ...cardStyle,
          color: "var(--admin-text-muted, #8a7060)",
          display: "flex",
          alignItems: "center",
          gap: "10px"
        }}
      >
        <Clock3 size={18} color="#b98a3e" />
        🌿 Loading dashboard...
      </div>
    );
  }

  const thSt: React.CSSProperties = {
    padding: "12px 16px",
    fontSize: "11px",
    fontWeight: 700,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "var(--admin-text-muted, #8a7060)",
    background: "var(--admin-table-head, linear-gradient(180deg,#f2ede5,#f9f7f4))",
    textAlign: "left",
    whiteSpace: "nowrap"
  };

  const tdSt: React.CSSProperties = {
    padding: "14px 16px",
    fontSize: "13px",
    color: "var(--admin-text, #4a3f38)",
    borderBottom: "1px solid var(--admin-card-border, #f0ece6)"
  };

  const lowStockCount = data.lowStockAlerts.length;

  const statCards: StatCard[] = [
    {
      label: "Orders today",
      value: String(data.ordersCount.today),
      tone: "#1c352a",
      icon: <ShoppingCart size={18} />,
      note: "Live order flow"
    },
    {
      label: "Orders (7 days)",
      value: String(data.ordersCount.thisWeek),
      tone: "#2d5040",
      icon: <Layers3 size={18} />,
      note: "Weekly volume"
    },
    {
      label: "Orders (month)",
      value: String(data.ordersCount.thisMonth),
      tone: "#b98a3e",
      icon: <BadgeIndianRupee size={18} />,
      note: "Month momentum"
    },
    {
      label: "Active products",
      value: String(data.productsByStatus.active),
      tone: "#1c352a",
      icon: <PackageCheck size={18} />,
      note: "Ready to sell"
    },
    {
      label: "Draft products",
      value: String(data.productsByStatus.draft),
      tone: "#f59e0b",
      icon: <Box size={18} />,
      note: "Needs review"
    },
    {
      label: "Archived",
      value: String(data.productsByStatus.archived),
      tone: "#94a3b8",
      icon: <Layers3 size={18} />,
      note: "Off catalog"
    },
    {
      label: "Low stock SKUs",
      value: String(lowStockCount),
      tone: t.danger,
      icon: <AlertTriangle size={18} />,
      note: lowStockCount > 0 ? "Needs action" : "All healthy"
    }
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
        style={{
          ...cardStyle,
          padding: "24px",
          background: "linear-gradient(135deg, #1c352a 0%, #2d5040 100%)",
          borderRadius: "16px"
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: "16px",
            flexWrap: "wrap"
          }}
        >
          <div>
            <h2 style={{ fontSize: "24px", fontWeight: 800, color: "#faf5ec", letterSpacing: "-0.03em" }}>
              🌿 Dashboard
            </h2>
            <p style={{ fontSize: "13px", color: "#a8c4b0", marginTop: "6px", maxWidth: "680px" }}>
              Store operations overview — orders, products, inventory risk, customers, and recent
              activity. Financial statements live under Accounting → Financial Reports.
            </p>
          </div>
          <Link
            href="/admin/orders"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              padding: "10px 14px",
              borderRadius: "999px",
              textDecoration: "none",
              color: "#fff",
              background: "linear-gradient(135deg, #b98a3e, #c8960a)",
              boxShadow: "0 4px 16px rgba(185,138,62,0.35)",
              fontSize: "13px",
              fontWeight: 700
            }}
          >
            Open orders
            <ArrowRight size={15} />
          </Link>
        </div>
      </motion.div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
          gap: "16px"
        }}
      >
        {statCards.map((item, index) => (
          <motion.div
            key={item.label}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.04 * index, duration: 0.24 }}
            style={{
              ...cardStyle,
              padding: "18px",
              borderBottom: `3px solid ${item.tone}20`,
              borderBottomLeftRadius: "0px",
              borderBottomRightRadius: "0px"
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.boxShadow = "0 10px 28px rgba(28,53,42,0.12)";
              e.currentTarget.style.transform = "translateY(-3px)";
              e.currentTarget.style.borderColor = "#e0d4b0";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.boxShadow = "0 1px 2px rgba(15,23,42,0.04)";
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.borderColor = "var(--admin-card-border, #e8e2d9)";
            }}
          >
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "10px" }}>
              <div>
                <p
                  style={{
                    fontSize: "11px",
                    fontWeight: 700,
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    color: "var(--admin-text-muted, #8a7060)"
                  }}
                >
                  {item.label}
                </p>
                <p
                  style={{
                    fontSize: "1.7rem",
                    lineHeight: 1.1,
                    fontWeight: 800,
                    color: "var(--admin-text, #2c2420)",
                    marginTop: "12px"
                  }}
                >
                  {item.value}
                </p>
                <p style={{ fontSize: "12px", color: "var(--admin-text-muted, #8a7060)", marginTop: "8px" }}>{item.note}</p>
              </div>
              <span
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: "12px",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: item.tone,
                  background: `${item.tone}18`,
                  flexShrink: 0
                }}
              >
                {item.icon}
              </span>
            </div>
          </motion.div>
        ))}
      </div>

      <div>
        <h3 style={{ fontSize: "15px", fontWeight: 800, color: "var(--admin-text, #2c2420)", marginBottom: "12px", borderLeft: "3px solid #b98a3e", paddingLeft: "10px" }}>Analytics</h3>
        <AdminDashboardAnalytics />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: "24px" }}>
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, delay: 0.08 }}
          style={cardStyle}
        >
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
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: "12px",
                  background: lowStockCount > 0 ? "rgba(239,68,68,0.12)" : "rgba(28,53,42,0.1)",
                  color: lowStockCount > 0 ? "#b91c1c" : "#1c352a",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center"
                }}
              >
                <AlertTriangle size={18} />
              </div>
              <div>
                <h3 style={{ fontSize: "15px", fontWeight: 800, color: "var(--admin-text, #2c2420)", borderLeft: "3px solid #b98a3e", paddingLeft: "10px" }}>Low Stock</h3>
                <p style={{ fontSize: "12px", color: "var(--admin-text-muted, #8a7060)", marginTop: "2px" }}>
                  Priority list for quick inventory follow-up
                </p>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <span
                style={{
                  background: lowStockCount > 0 ? "#fee2e2" : "#f0fdf4",
                  color: lowStockCount > 0 ? "#b91c1c" : "#166534",
                  fontSize: "12px",
                  fontWeight: 700,
                  padding: "4px 10px",
                  borderRadius: "999px",
                  border: `1px solid ${lowStockCount > 0 ? "rgba(239,68,68,0.18)" : "rgba(34,197,94,0.18)"}`
                }}
              >
                {lowStockCount} SKU{lowStockCount === 1 ? "" : "s"}
              </span>
              <Link
                href="/admin/inventory"
                style={{ fontSize: "12px", color: "#b98a3e", textDecoration: "none", fontWeight: 700 }}
              >
                View all
              </Link>
            </div>
          </div>

          {lowStockCount === 0 ? (
            <p style={{ fontSize: "13px", color: "var(--admin-text-muted, #8a7060)", textAlign: "center", padding: "26px 0" }}>
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
                    gap: "10px",
                    padding: "12px 0",
                    borderBottom: "1px solid var(--admin-card-border, #f0ece6)",
                    transition: "background 0.15s ease"
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "rgba(185,138,62,0.03)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "transparent";
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <p
                      style={{
                        fontSize: "13px",
                        fontWeight: 700,
                        color: "var(--admin-text, #2c2420)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap"
                      }}
                    >
                      {a.productName}
                    </p>
                    <p style={{ fontSize: "11px", color: "var(--admin-text-muted, #8a7060)", marginTop: "4px" }}>
                      SKU {a.sku} · {a.onHand} on hand
                    </p>
                  </div>
                  <span
                    style={{
                      background: "#fff1f2",
                      color: "#be123c",
                      fontSize: "11px",
                      fontWeight: 700,
                      padding: "4px 9px",
                      borderRadius: "999px",
                      flexShrink: 0,
                      border: "1px solid rgba(244,63,94,0.14)"
                    }}
                  >
                    Low
                  </span>
                </div>
              ))}
            </div>
          )}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, delay: 0.12 }}
          style={cardStyle}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: "16px",
              gap: "12px",
              flexWrap: "wrap"
            }}
          >
            <div>
              <h3 style={{ fontSize: "15px", fontWeight: 800, color: "var(--admin-text, #2c2420)", borderLeft: "3px solid #b98a3e", paddingLeft: "10px" }}>Recent Orders</h3>
              <p style={{ fontSize: "12px", color: "var(--admin-text-muted, #8a7060)", marginTop: "2px" }}>
                Latest checkout activity without changing the current data source
              </p>
            </div>
            <Link
              href="/admin/orders"
              style={{ fontSize: "12px", color: "#b98a3e", textDecoration: "none", fontWeight: 700 }}
            >
              All orders
            </Link>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0 }}>
              <thead>
                <tr>
                  <th style={{ ...thSt, borderTopLeftRadius: "12px" }}>Order</th>
                  <th style={thSt}>Customer</th>
                  <th style={thSt}>Amount</th>
                  <th style={thSt}>Status</th>
                  <th style={{ ...thSt, borderTopRightRadius: "12px" }}>Date</th>
                </tr>
              </thead>
              <tbody>
                {data.recentOrders.map((o) => (
                  <tr
                    key={o.id}
                    style={{ transition: "background 0.15s ease" }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLTableRowElement).style.background = "var(--admin-row-hover, #faf5ec)";
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLTableRowElement).style.background = "transparent";
                    }}
                  >
                    <td style={tdSt}>
                      <Link
                        href={`/admin/orders/${o.id}`}
                        style={{
                          fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                          fontWeight: 700,
                          color: "#b98a3e",
                          textDecoration: "none"
                        }}
                      >
                        {o.orderNumber}
                      </Link>
                    </td>
                    <td style={tdSt}>{o.email}</td>
                    <td style={{ ...tdSt, fontWeight: 700, color: "var(--admin-text, #2c2420)" }}>{formatINRFromPaise(o.grandTotalInPaise)}</td>
                    <td style={tdSt}>
                      <StatusBadge status={o.status} />
                    </td>
                    <td style={{ ...tdSt, color: "var(--admin-text-muted, #8a7060)", fontSize: "12px", whiteSpace: "nowrap" }}>
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
        </motion.div>
      </div>
    </div>
  );
}
