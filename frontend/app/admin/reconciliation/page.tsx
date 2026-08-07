"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { fetchPaymentsReconciliation } from "@/lib/admin-api";

const card: React.CSSProperties = { background: "#fff", borderRadius: "12px", border: "1px solid #e8e2d9", boxShadow: "0 1px 4px rgba(44,36,32,0.06)", padding: "20px 24px" };

export default function AdminReconciliationPage() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<Awaited<ReturnType<typeof fetchPaymentsReconciliation>> | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    void fetchPaymentsReconciliation(days).then(setData).catch((e) => setErr(e instanceof Error ? e.message : "Failed")).finally(() => setLoading(false));
  }, [days]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <div
        style={{
          background: "linear-gradient(135deg, #1c352a 0%, #2d5040 100%)",
          borderRadius: "16px",
          padding: "22px 28px",
          marginBottom: "4px"
        }}
      >
        <h1 style={{ fontSize: "26px", fontWeight: 800, color: "#faf5ec", margin: 0 }}>💳 Payment Reconciliation</h1>
        <p style={{ fontSize: "13px", color: "#a8c4b0", marginTop: "4px" }}>
          Compare order payment status with gateway payment rows. Use per-order Razorpay sync on mismatches.
        </p>
      </div>

      <div
        style={{
          background: "#fff",
          borderRadius: "12px",
          border: "1px solid #e8e2d9",
          boxShadow: "0 1px 4px rgba(44,36,32,0.06)",
          padding: "12px 16px",
          display: "flex",
          alignItems: "center",
          gap: "12px"
        }}
      >
        <span style={{ fontSize: "16px" }} aria-hidden>📅</span>
        <span style={{ fontSize: "12px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#8a7060" }}>Last</span>
        <select
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          style={{ height: "38px", padding: "0 12px", borderRadius: "8px", border: "1px solid #e0d8ce", fontSize: "13px", background: "#fff", color: "#2c2420", outline: "none" }}
          onFocus={(e) => { e.currentTarget.style.borderColor = "#b98a3e"; }}
          onBlur={(e) => { e.currentTarget.style.borderColor = "#e0d8ce"; }}
        >
          <option value={7}>7 days</option>
          <option value={30}>30 days</option>
          <option value={90}>90 days</option>
        </select>
      </div>

      {loading && (
        <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "#8a7060", padding: "40px 16px", justifyContent: "center" }}>
          <span style={{ fontSize: "24px" }}>💳</span>
          <span style={{ fontSize: "14px" }}>Loading reconciliation data…</span>
        </div>
      )}
      {err && <p style={{ color: "#dc2626" }}>{err}</p>}

      {data && (
        <>
          <div
            style={{
              ...card,
              transition: "all 0.15s",
              ...(data.mismatchCount > 0
                ? {
                    background: "linear-gradient(135deg, #fffbeb, #fef3c7)",
                    borderLeft: "4px solid #f59e0b",
                    borderRadius: "12px",
                    borderColor: "#e0d4b0"
                  }
                : {
                    background: "linear-gradient(135deg, #f0fdf4, #dcfce7)",
                    borderLeft: "4px solid #16a34a",
                    borderRadius: "12px",
                    borderColor: "#bbf7d0"
                  })
            }}
          >
            <p style={{ fontSize: "15px", fontWeight: 700, color: "#2c2420" }}>
              {data.mismatchCount > 0 ? (
                <>⚠️ {data.mismatchCount} mismatch{data.mismatchCount !== 1 ? "es" : ""} of {data.total} orders</>
              ) : (
                <>✅ No mismatches in this period</>
              )}
            </p>
          </div>

          {data.mismatches.length > 0 ? (
            <div
              style={{
                background: "linear-gradient(180deg, #fffbf0, #fff9e6)",
                borderRadius: "12px",
                border: "1px solid #e0d4b0",
                overflow: "hidden",
                boxShadow: "0 4px 20px rgba(185,138,62,0.08)"
              }}
            >
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr style={{ borderBottom: "2px solid #e8e2c8" }}>
                  {["Order","Order Status","Payment","Provider",""].map((h, i) => (
                    <th key={i} style={{ padding: "11px 16px", fontSize: "11px", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#92400e", background: "linear-gradient(180deg, #fef3c7, #fef9e7)", textAlign: "left" }}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {data.mismatches.map((row) => (
                    <tr
                      key={row.orderId}
                      style={{ borderBottom: "1px solid #f5f0d8", transition: "background 0.15s" }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = "#faf5ec"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                    >
                      <td style={{ padding: "12px 16px", fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: "12px", color: "#b98a3e" }}>{row.orderNumber}</td>
                      <td style={{ padding: "12px 16px", fontSize: "13px", color: "#4a3f38" }}>{row.orderStatus}</td>
                      <td style={{ padding: "12px 16px", fontSize: "13px", color: "#4a3f38" }}>{row.paymentStatus}</td>
                      <td style={{ padding: "12px 16px", fontSize: "13px", color: "#4a3f38" }}>{row.provider ?? "—"}</td>
                      <td style={{ padding: "12px 16px" }}>
                        <Link
                          href={`/admin/orders/${row.orderId}`}
                          style={{
                            color: "#b98a3e",
                            fontSize: "12px",
                            fontWeight: 700,
                            textDecoration: "none",
                            padding: "4px 10px",
                            background: "#faf5ec",
                            borderRadius: "6px",
                            display: "inline-block",
                            transition: "all 0.15s"
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = "#b98a3e";
                            e.currentTarget.style.color = "#fff";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = "#faf5ec";
                            e.currentTarget.style.color = "#b98a3e";
                          }}
                        >
                          Open →
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ ...card, textAlign: "center", padding: "40px", transition: "all 0.15s" }}>
              <p style={{ fontSize: "15px", color: "#15803d", fontWeight: 600 }}>✅ No mismatches in this period</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
