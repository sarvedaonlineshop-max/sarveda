"use client";

import { useEffect, useState } from "react";

import type {
  AdminReportPeriod,
  AdminReportType,
  AdminReportsAnalytics,
  DashboardData
} from "@/lib/admin-api";
import {
  downloadAdminReportExcel,
  fetchAdminDashboard,
  fetchAdminReportAnalytics
} from "@/lib/admin-api";
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
  const [data, setData] = useState<DashboardData | null>(null);
  const [analytics, setAnalytics] = useState<AdminReportsAnalytics | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [period, setPeriod] = useState<AdminReportPeriod>("monthly");
  const [busy, setBusy] = useState<AdminReportType | null>(null);
  const [downloadErr, setDownloadErr] = useState<string | null>(null);
  const [analyticsErr, setAnalyticsErr] = useState<string | null>(null);

  useEffect(() => {
    fetchAdminDashboard()
      .then(setData)
      .catch((e) => setErr(e instanceof Error ? e.message : "Failed"));
  }, []);

  useEffect(() => {
    setAnalyticsErr(null);
    fetchAdminReportAnalytics(period)
      .then(setAnalytics)
      .catch((e) => setAnalyticsErr(e instanceof Error ? e.message : "Failed to load analytics"));
  }, [period]);

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
        <h1 style={{ fontSize: "22px", fontWeight: 700, color: "#2c2420" }}>Revenue Reports</h1>
        <p style={{ fontSize: "13px", color: "#8a7060", marginTop: "4px" }}>
          Snapshot below is paid orders only. Excel exports use Asia/Kolkata dates; financial year is
          Apr–Mar.
        </p>
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
                {busy === r.type ? "Preparing…" : "Download .xlsx"}
              </button>
            </div>
          ))}
        </div>
      </div>

      <div style={card}>
        {sectionTitle(
          "Order analytics",
          analytics
            ? `${analytics.totals.orders} orders · ${analytics.totals.units} units · ${period.replace("_", " ")}`
            : undefined
        )}
        <p style={{ fontSize: "12px", color: "#8a7060", marginTop: "4px" }}>
          Top 10 lists are calculated from paid / processing / shipped / delivered orders in the selected period.
        </p>
        {analyticsErr ? (
          <p style={{ color: "#dc2626", fontSize: "13px", marginTop: "10px" }}>{analyticsErr}</p>
        ) : null}
        {!analytics ? (
          <p style={{ color: "#8a7060", fontSize: "13px", marginTop: "12px" }}>Loading analytics...</p>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))",
              gap: "16px",
              marginTop: "16px"
            }}
          >
            <div
              style={{ border: "1px solid #f0ece6", borderRadius: "10px", padding: "14px 16px", background: "#faf8f5" }}
            >
              {sectionTitle("Top 10 items sold")}
              {renderMiniTable(
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
                "No order items in this period."
              )}
            </div>

            <div
              style={{ border: "1px solid #f0ece6", borderRadius: "10px", padding: "14px 16px", background: "#faf8f5" }}
            >
              {sectionTitle("Top 10 repeat customers")}
              {renderMiniTable(
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
                "No repeat customers in this period."
              )}
            </div>

            <div
              style={{ border: "1px solid #f0ece6", borderRadius: "10px", padding: "14px 16px", background: "#faf8f5" }}
            >
              {sectionTitle("Top places orders are placed")}
              {renderMiniTable(
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
                "No place data in this period."
              )}
            </div>

            <div
              style={{ border: "1px solid #f0ece6", borderRadius: "10px", padding: "14px 16px", background: "#faf8f5" }}
            >
              {sectionTitle("Top 10 highest-value orders")}
              {renderMiniTable(
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
                "No orders in this period."
              )}
            </div>
          </div>
        )}
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
    </div>
  );
}
