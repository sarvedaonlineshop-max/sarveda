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
      <div>
        <h1 style={{ fontSize: "22px", fontWeight: 700, color: "#2c2420" }}>Payment Reconciliation</h1>
        <p style={{ fontSize: "13px", color: "#8a7060", marginTop: "4px" }}>Compare order payment status with gateway payment rows. Use per-order Razorpay sync on mismatches.</p>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
        <span style={{ fontSize: "13px", color: "#6b5c52" }}>Last</span>
        <select value={days} onChange={(e) => setDays(Number(e.target.value))}
          style={{ height: "38px", padding: "0 12px", borderRadius: "8px", border: "1px solid #e0d8ce", fontSize: "13px", background: "#fff", color: "#2c2420" }}>
          <option value={7}>7 days</option>
          <option value={30}>30 days</option>
          <option value={90}>90 days</option>
        </select>
      </div>

      {loading && <p style={{ color: "#8a7060" }}>Loading...</p>}
      {err && <p style={{ color: "#dc2626" }}>{err}</p>}

      {data && (
        <>
          <div style={{ ...card, background: data.mismatchCount > 0 ? "#fffbf0" : "#f0fdf4", borderColor: data.mismatchCount > 0 ? "#e0d4b0" : "#bbf7d0" }}>
            <p style={{ fontSize: "15px", fontWeight: 700, color: "#2c2420" }}>
              {data.mismatchCount} mismatch{data.mismatchCount !== 1 ? "es" : ""} of {data.total} orders
            </p>
          </div>

          {data.mismatches.length > 0 ? (
            <div style={{ background: "#fffbf0", borderRadius: "12px", border: "1px solid #e0d4b0", overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr style={{ borderBottom: "2px solid #e8e2c8" }}>
                  {["Order","Order Status","Payment","Provider",""].map((h, i) => (
                    <th key={i} style={{ padding: "11px 16px", fontSize: "11px", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#8a6200", background: "#fef9e7", textAlign: "left" }}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {data.mismatches.map((row) => (
                    <tr key={row.orderId} style={{ borderBottom: "1px solid #f5f0d8" }}>
                      <td style={{ padding: "12px 16px", fontFamily: "monospace", fontSize: "12px", color: "#4a3f38" }}>{row.orderNumber}</td>
                      <td style={{ padding: "12px 16px", fontSize: "13px", color: "#4a3f38" }}>{row.orderStatus}</td>
                      <td style={{ padding: "12px 16px", fontSize: "13px", color: "#4a3f38" }}>{row.paymentStatus}</td>
                      <td style={{ padding: "12px 16px", fontSize: "13px", color: "#4a3f38" }}>{row.provider ?? "—"}</td>
                      <td style={{ padding: "12px 16px" }}><Link href={`/admin/orders/${row.orderId}`} style={{ color: "#c8960a", fontSize: "13px", fontWeight: 600, textDecoration: "none" }}>Open →</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ ...card, textAlign: "center", padding: "40px" }}>
              <p style={{ fontSize: "15px", color: "#15803d", fontWeight: 600 }}>✓ No mismatches in this period</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
