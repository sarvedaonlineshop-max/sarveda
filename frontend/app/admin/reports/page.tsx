"use client";

import { useState } from "react";

import type { AdminReportPeriod, AdminReportType } from "@/lib/admin-api";
import { downloadAdminReportExcel } from "@/lib/admin-api";

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
  const [period, setPeriod] = useState<AdminReportPeriod>("monthly");
  const [busy, setBusy] = useState<AdminReportType | null>(null);
  const [downloadErr, setDownloadErr] = useState<string | null>(null);

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

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      <div>
        <h1 style={{ fontSize: "22px", fontWeight: 700, color: "#2c2420" }}>Reports</h1>
        <p style={{ fontSize: "13px", color: "#8a7060", marginTop: "4px" }}>
          Excel exports only. Product sales analytics moved to{" "}
          <a href="/admin/analytics" style={{ color: "#1e3a2f", fontWeight: 600 }}>
            Analytics
          </a>
          .
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
                {busy === r.type ? "Preparing..." : "Download .xlsx"}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
