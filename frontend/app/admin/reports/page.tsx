"use client";

import { useState } from "react";
import { Lock } from "lucide-react";

import type { AdminReportPeriod, AdminReportType } from "@/lib/admin-api";
import { downloadAdminReportExcel } from "@/lib/admin-api";
import { useIsSuperAdmin } from "@/components/admin/AdminUserContext";

const card: React.CSSProperties = {
  background: "#fff",
  borderRadius: "12px",
  border: "1px solid #e8e2d9",
  boxShadow: "0 4px 20px rgba(28,53,42,0.08)",
  padding: "20px 24px",
  borderLeft: "3px solid rgba(185,138,62,0.2)"
};

const PERIODS: Array<{ id: AdminReportPeriod; label: string }> = [
  { id: "daily", label: "Daily" },
  { id: "weekly", label: "Weekly" },
  { id: "monthly", label: "Monthly" },
  { id: "financial_year", label: "Financial year" }
];

const PERIOD_ICONS: Record<string, string> = {
  daily: "📅",
  weekly: "📆",
  monthly: "🗓️",
  financial_year: "📋"
};

const REPORT_ICONS: Record<string, string> = {
  sales: "💰",
  products: "📦",
  customers: "👥",
  vendors: "🏪",
  razorpay: "💳",
  paypal: "🌐",
  stripe: "⚡",
  gateways: "🔗"
};

const REPORTS: Array<{
  type: AdminReportType;
  title: string;
  blurb: string;
  superAdminOnly?: boolean;
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
    blurb: "Customer accounts with period and lifetime order totals.",
    superAdminOnly: true
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
  const isSuper = useIsSuperAdmin();
  const [period, setPeriod] = useState<AdminReportPeriod>("monthly");
  const [busy, setBusy] = useState<AdminReportType | null>(null);
  const [downloadErr, setDownloadErr] = useState<string | null>(null);

  async function onDownload(type: AdminReportType) {
    if (type === "customers" && !isSuper) {
      setDownloadErr("Only super admin can download customer data");
      return;
    }
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
      <div
        style={{
          background: "linear-gradient(135deg, #1c352a 0%, #2d5040 100%)",
          borderRadius: "16px",
          padding: "22px 28px",
          marginBottom: "4px"
        }}
      >
        <h1 style={{ fontSize: "26px", fontWeight: 800, color: "#faf5ec", margin: 0 }}>
          📊 Store Reports
        </h1>
        <p style={{ fontSize: "13px", color: "#a8c4b0", marginTop: "4px" }}>
          Operational Excel exports for sales, products, customers, and payments. Financial
          statements and ledgers live under Accounting → Financial Reports. Customer downloads are
          super-admin only. Sales analytics also appear on the{" "}
          <a href="/admin" style={{ color: "#f6c95a", fontWeight: 700 }}>
            Dashboard
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
            <h2
              style={{
                fontSize: "16px",
                fontWeight: 800,
                color: "#1c352a",
                borderLeft: "3px solid #b98a3e",
                paddingLeft: "10px"
              }}
            >
              Download Excel
            </h2>
            <p style={{ fontSize: "12px", color: "#8a7060", marginTop: "4px" }}>
              Gateway sheets use captured payments stored in Sarveda (Razorpay / PayPal / Stripe).
            </p>
          </div>
          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
            {PERIODS.map((p) => {
              const active = period === p.id;
              return (
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
                    borderColor: active ? "#1c352a" : "#e0d8ce",
                    background: active
                      ? "linear-gradient(135deg, #1c352a, #2d5040)"
                      : "#fff",
                    color: active ? "#fffbf5" : "#6b5c52",
                    boxShadow: active ? "0 2px 6px rgba(28,53,42,0.25)" : "none",
                    transition: "all 0.15s"
                  }}
                  onMouseEnter={(e) => {
                    if (active) return;
                    e.currentTarget.style.background = "#faf5ec";
                    e.currentTarget.style.borderColor = "#b98a3e";
                  }}
                  onMouseLeave={(e) => {
                    if (active) return;
                    e.currentTarget.style.background = "#fff";
                    e.currentTarget.style.borderColor = "#e0d8ce";
                  }}
                >
                  {PERIOD_ICONS[p.id]} {p.label}
                </button>
              );
            })}
          </div>
        </div>

        {downloadErr ? (
          <p
            style={{
              color: "#dc2626",
              fontSize: "13px",
              marginBottom: "12px",
              background: "#fef2f2",
              borderRadius: "8px",
              borderLeft: "3px solid #dc2626",
              padding: "10px 14px"
            }}
            role="alert"
          >
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
          {REPORTS.map((r) => {
            const locked = Boolean(r.superAdminOnly && !isSuper);
            return (
              <div
                key={r.type}
                style={{
                  border: "1px solid #e8e4db",
                  borderRadius: "10px",
                  padding: "14px 16px",
                  background: locked ? "#f3f1ed" : "#faf9f7",
                  borderTop: "3px solid rgba(185,138,62,0.15)",
                  transition: "all 0.2s",
                  cursor: "default",
                  opacity: locked ? 0.85 : 1
                }}
                onMouseEnter={(e) => {
                  if (locked) return;
                  e.currentTarget.style.boxShadow = "0 4px 16px rgba(28,53,42,0.08)";
                  e.currentTarget.style.borderTopColor = "rgba(185,138,62,0.4)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.boxShadow = "none";
                  e.currentTarget.style.borderTopColor = "rgba(185,138,62,0.15)";
                }}
              >
                <p style={{ fontSize: "28px", marginBottom: "8px" }}>{REPORT_ICONS[r.type]}</p>
                <p style={{ fontSize: "15px", fontWeight: 800, color: "#1c352a" }}>
                  {r.title}
                  {r.superAdminOnly ? (
                    <span
                      style={{
                        marginLeft: "8px",
                        fontSize: "10px",
                        fontWeight: 700,
                        letterSpacing: "0.06em",
                        textTransform: "uppercase",
                        color: "#92400e",
                        background: "#fef3c7",
                        borderRadius: "999px",
                        padding: "2px 8px",
                        verticalAlign: "middle"
                      }}
                    >
                      Super admin
                    </span>
                  ) : null}
                </p>
                <p
                  style={{
                    fontSize: "12px",
                    color: "#6b5c52",
                    marginTop: "4px",
                    minHeight: "36px",
                    lineHeight: 1.55
                  }}
                >
                  {r.blurb}
                </p>
                {locked ? (
                  <button
                    type="button"
                    disabled
                    title="Only super admin can download customer data"
                    style={{
                      marginTop: "12px",
                      height: "36px",
                      padding: "0 14px",
                      borderRadius: "8px",
                      border: "1px solid #d6d3d1",
                      background: "#e7e5e4",
                      color: "#78716c",
                      fontSize: "12px",
                      fontWeight: 600,
                      cursor: "not-allowed",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px"
                    }}
                  >
                    <Lock size={14} /> Locked
                  </button>
                ) : (
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
                      background:
                        busy === r.type
                          ? "#4a7c59"
                          : "linear-gradient(135deg, #1c352a, #2d5040)",
                      color: "#fffbf5",
                      fontSize: "12px",
                      fontWeight: 600,
                      cursor: busy !== null ? "wait" : "pointer",
                      opacity: busy !== null && busy !== r.type ? 0.55 : 1,
                      boxShadow: "0 2px 6px rgba(28,53,42,0.2)"
                    }}
                  >
                    {busy === r.type ? "⏳ Preparing..." : "📥 Download .xlsx"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
