"use client";

import { useEffect, useState } from "react";

import type {
  AdminReportPeriod,
  AdminReportType,
  AdminReportsAnalytics
} from "@/lib/admin-api";
import { downloadAdminReportExcel, fetchAdminReportAnalytics } from "@/lib/admin-api";
import { formatINRFromPaise } from "@/lib/money";

const card: React.CSSProperties = {
  background: "#fff",
  borderRadius: "12px",
  border: "1px solid #e8e2d9",
  boxShadow: "0 1px 4px rgba(44,36,32,0.06)",
  padding: "20px 24px"
};

const PERIODS: Array<{ id: AdminReportPeriod; label: string }> = [
  { id: "daily", label: "Daily" },
  { id: "weekly", label: "Weekly" },
  { id: "monthly", label: "Monthly" },
  { id: "financial_year", label: "Financial year" }
];

const REPORTS: Array<{
  type: AdminReportType;
  title: string;
  blurb: string;
}> = [
  {
    type: "sales",
    title: "Sales",
    blurb: "Paid orders with totals, coupons, and gateway IDs."
  },
  {
    type: "products",
    title: "Products",
    blurb: "Units sold and revenue by SKU in the selected period."
  },
  {
    type: "customers",
    title: "Customers",
    blurb: "Customer accounts with period and lifetime order totals."
  },
  {
    type: "vendors",
    title: "Vendor / warehouse",
    blurb: "Pickup locations with units dispatched and revenue."
  },
  {
    type: "razorpay",
    title: "Razorpay revenue",
    blurb: "Captured Razorpay payments from our Payment records."
  },
  {
    type: "paypal",
    title: "PayPal revenue",
    blurb: "Captured PayPal payments from our Payment records."
  },
  {
    type: "stripe",
    title: "Stripe revenue",
    blurb: "Captured Stripe payments from our Payment records."
  },
  {
    type: "gateways",
    title: "All gateways",
    blurb: "Combined Razorpay + PayPal + Stripe payment ledger."
  }
];

export default function AdminReportsPage() {
  const [analytics, setAnalytics] = useState<AdminReportsAnalytics | null>(null);
  const [period, setPeriod] = useState<AdminReportPeriod>("monthly");
  const [busy, setBusy] = useState<AdminReportType | null>(null);
  const [downloadErr, setDownloadErr] = useState<string | null>(null);
  const [analyticsErr, setAnalyticsErr] = useState<string | null>(null);
  const [activeStatTab, setActiveStatTab] = useState<
    "items" | "customers" | "places" | "orders"
  >("items");

  useEffect(() => {
    setAnalyticsErr(null);
    fetchAdminReportAnalytics()
      .then(setAnalytics)
      .catch((e) => setAnalyticsErr(e instanceof Error ? e.message : "Failed to load analytics"));
  }, []);

  async function onDownload(type: AdminReportType) {
    setDownloadErr(null);
    setBusy(type);
    try {
      await downloadAdminReportExcel(type, period);
    } catch (e) {
      setDownloadErr(e instanceof Error ? e.message : "Download failed");
    } finally {
      setBusy(null);
    }
  }

  function formatWhen(iso: string) {
    return new Date(iso).toLocaleString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  function sectionTitle(title: string, meta?: string) {
    return (
      <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
        <h2 style={{ fontSize: "15px", fontWeight: 700, color: "#2c2420" }}>{title}</h2>
        {meta ? <p style={{ fontSize: "12px", color: "#8a7060" }}>{meta}</p> : null}
      </div>
    );
  }

  function renderMiniTable(
    headers: string[],
    rows: React.ReactNode[][],
    empty: string
  ) {
    return (
      <div style={{ overflowX: "auto", marginTop: "14px" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
          <thead>
            <tr>
              {headers.map((h) => (
                <th
                  key={h}
                  style={{
                    textAlign: "left",
                    padding: "10px 12px",
                    color: "#8a7060",
                    fontSize: "11px",
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    borderBottom: "1px solid #eee6dc"
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={headers.length} style={{ padding: "16px 12px", color: "#8a7060" }}>
                  {empty}
                </td>
              </tr>
            ) : (
              rows.map((row, i) => (
                <tr key={i}>
                  {row.map((cell, j) => (
                    <td
                      key={j}
                      style={{
                        padding: "10px 12px",
                        borderBottom: "1px solid #f4efe8",
                        verticalAlign: "top",
                        color: "#2c2420"
                      }}
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      <div>
        <h1 style={{ fontSize: "22px", fontWeight: 700, color: "#2c2420" }}>Reports</h1>
      </div>

      <div style={card}>
        {sectionTitle(
          "Order analytics",
          analytics
            ? `${analytics.totals.orders} delivered Woo orders · top items from Woo dump`
            : undefined
        )}
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "16px", marginBottom: "18px" }}>
          {[
            { id: "items" as const, label: "Top 10 items sold" },
            { id: "customers" as const, label: "Repeat customers" },
            { id: "places" as const, label: "Top places" },
            { id: "orders" as const, label: "Highest orders" }
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveStatTab(tab.id)}
              style={{
                padding: "8px 14px",
                borderRadius: "8px",
                fontSize: "13px",
                fontWeight: 700,
                cursor: "pointer",
                border: "1px solid",
                borderColor: activeStatTab === tab.id ? "#1e3a2f" : "#e0d8ce",
                background: activeStatTab === tab.id ? "#1e3a2f" : "#fff",
                color: activeStatTab === tab.id ? "#fffbf5" : "#6b5c52"
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {analyticsErr ? (
          <p style={{ color: "#dc2626", fontSize: "13px", marginTop: "10px" }}>{analyticsErr}</p>
        ) : null}
        {!analytics ? (
          <p style={{ color: "#8a7060", fontSize: "13px", marginTop: "12px" }}>Loading analytics...</p>
        ) : (
          <div
            style={{
              border: "1px solid #f0ece6",
              borderRadius: "10px",
              padding: "14px 16px",
              background: "#faf8f5"
            }}
          >
            {activeStatTab === "items"
              ? renderMiniTable(
                  ["Item", "SKU", "Units", "Revenue"],
                  analytics.topItems.map((item) => [
                    <div key={`${item.sku}-name`}>
                      <div style={{ fontWeight: 600 }}>{item.productName}</div>
                      {item.slug ? <div style={{ color: "#8a7060", fontSize: "12px" }}>{item.slug}</div> : null}
                    </div>,
                    item.sku,
                    String(item.unitsSold),
                    formatINRFromPaise(Math.round(item.revenueInr * 100))
                  ]),
                  "No dump top-items file found on server."
                )
              : null}
            {activeStatTab === "customers"
              ? renderMiniTable(
                  ["Customer", "Orders", "City", "Spend"],
                  analytics.repeatCustomers.map((customer) => [
                    <div key={`${customer.email}-name`}>
                      <div style={{ fontWeight: 600 }}>{customer.name}</div>
                      <div style={{ color: "#8a7060", fontSize: "12px" }}>{customer.email}</div>
                    </div>,
                    String(customer.orderCount),
                    customer.city || "—",
                    formatINRFromPaise(Math.round(customer.totalSpendInr * 100))
                  ]),
                  "No repeat customers found."
                )
              : null}
            {activeStatTab === "places"
              ? renderMiniTable(
                  ["Place", "Orders", "Revenue"],
                  analytics.topPlaces.map((place) => [
                    <div key={`${place.city}-${place.state}-${place.country}`}>
                      <div style={{ fontWeight: 600 }}>{place.city}</div>
                      <div style={{ color: "#8a7060", fontSize: "12px" }}>
                        {[place.state, place.country].filter(Boolean).join(", ") || "—"}
                      </div>
                    </div>,
                    String(place.orderCount),
                    formatINRFromPaise(Math.round(place.totalInr * 100))
                  ]),
                  "No place data found."
                )
              : null}
            {activeStatTab === "orders"
              ? renderMiniTable(
                  ["Order", "Customer", "Status", "Total"],
                  analytics.highestOrders.map((order) => [
                    <div key={order.orderNumber}>
                      <div style={{ fontWeight: 600 }}>{order.orderNumber}</div>
                      <div style={{ color: "#8a7060", fontSize: "12px" }}>{formatWhen(order.placedAt)}</div>
                    </div>,
                    <div key={`${order.orderNumber}-customer`}>
                      <div>{order.customerName}</div>
                      <div style={{ color: "#8a7060", fontSize: "12px" }}>{order.email}</div>
                    </div>,
                    order.status,
                    formatINRFromPaise(order.totalInPaise)
                  ]),
                  "No orders found."
                )
              : null}
          </div>
        )}
      </div>

      <div style={card}>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "12px",
            marginBottom: "16px"
          }}
        >
          <div>
            <h2 style={{ fontSize: "15px", fontWeight: 700, color: "#2c2420" }}>Download Excel</h2>
            <p style={{ fontSize: "12px", color: "#8a7060", marginTop: "4px" }}>
              Gateway sheets use captured payments stored in Sarveda (Razorpay / PayPal / Stripe).
            </p>
          </div>
          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
            {PERIODS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPeriod(p.id)}
                style={{
                  padding: "6px 12px",
                  borderRadius: "6px",
                  fontSize: "12px",
                  fontWeight: 600,
                  cursor: "pointer",
                  border: "1px solid",
                  borderColor: period === p.id ? "#1e3a2f" : "#e0d8ce",
                  background: period === p.id ? "#1e3a2f" : "#fff",
                  color: period === p.id ? "#fffbf5" : "#6b5c52"
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {downloadErr ? (
          <p style={{ color: "#dc2626", fontSize: "13px", marginBottom: "12px" }} role="alert">
            {downloadErr}
          </p>
        ) : null}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: "12px"
          }}
        >
          {REPORTS.map((r) => (
            <div
              key={r.type}
              style={{
                border: "1px solid #f0ece6",
                borderRadius: "10px",
                padding: "14px 16px",
                background: "#faf8f5"
              }}
            >
              <p style={{ fontSize: "14px", fontWeight: 700, color: "#2c2420" }}>{r.title}</p>
              <p style={{ fontSize: "12px", color: "#8a7060", marginTop: "4px", minHeight: "36px" }}>
                {r.blurb}
              </p>
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => void onDownload(r.type)}
                style={{
                  marginTop: "12px",
                  height: "36px",
                  padding: "0 14px",
                  borderRadius: "8px",
                  border: "none",
                  background: busy === r.type ? "#4a7c59" : "#1e3a2f",
                  color: "#fffbf5",
                  fontSize: "12px",
                  fontWeight: 600,
                  cursor: busy !== null ? "wait" : "pointer",
                  opacity: busy !== null && busy !== r.type ? 0.55 : 1
                }}
              >
                {busy === r.type ? "Preparing..." : "Download .xlsx"}
              </button>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}
