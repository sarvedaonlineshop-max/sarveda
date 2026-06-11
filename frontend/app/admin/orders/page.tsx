"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { AdminPagination } from "@/components/admin/AdminPagination";
import type { OrdersListData } from "@/lib/admin-api";
import { downloadAdminOrdersPdf, fetchAdminOrders } from "@/lib/admin-api";
import { formatMinorFromPaise } from "@/lib/money";
import { formatAdminOrderStatusLabel } from "@/lib/order-status-display";

const buckets = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending (48h)" },
  { value: "abandoned", label: "Abandoned" },
  { value: "attempted", label: "Attempted" },
  { value: "cancelled", label: "Cancelled" },
  { value: "refunded", label: "Refunded" },
  { value: "paid", label: "Paid" },
  { value: "shipped", label: "Shipped" },
  { value: "delivered", label: "Delivered" }
] as const;

function StatusBadge({ status, paymentStatus }: { status: string; paymentStatus: string }) {
  const label = formatAdminOrderStatusLabel(status, paymentStatus);
  const s = label.toUpperCase().replace(/\s/g, "");
  let bg = "#f3f4f6", color = "#374151";
  if (s.includes("PAID") || s.includes("PROCESSING")) { bg = "#dcfce7"; color = "#166534"; }
  else if (s.includes("SHIPPED")) { bg = "#dbeafe"; color = "#1e40af"; }
  else if (s.includes("DELIVERED")) { bg = "#f0fdf4"; color = "#15803d"; }
  else if (s === "ATTEMPTED") { bg = "#fef3c7"; color = "#92400e"; }
  else if (s.includes("CANCEL")) { bg = "#fee2e2"; color = "#991b1b"; }
  else if (s.includes("REFUND")) { bg = "#fef3c7"; color = "#92400e"; }
  else if (s.includes("PENDING")) { bg = "#f3f4f6"; color = "#374151"; }
  return <span style={{ background: bg, color, fontSize: "11px", fontWeight: 600, padding: "3px 10px", borderRadius: "999px", whiteSpace: "nowrap" }}>{label}</span>;
}

const card: React.CSSProperties = { background: "#fff", borderRadius: "12px", border: "1px solid #e8e2d9", boxShadow: "0 1px 4px rgba(44,36,32,0.06)" };
const thSt: React.CSSProperties = { padding: "11px 16px", fontSize: "11px", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#8a7060", background: "#f9f7f4", textAlign: "left", whiteSpace: "nowrap" };
const tdSt: React.CSSProperties = { padding: "12px 16px", fontSize: "13px", color: "#4a3f38", borderBottom: "1px solid #f0ece6" };

export default function AdminOrdersPage() {
  const [bucket, setBucket] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<OrdersListData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pdfErr, setPdfErr] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const res = await fetchAdminOrders({ bucket: bucket === "all" ? undefined : bucket, page, limit: 20 });
      setData(res);
    } catch (e) { setErr(e instanceof Error ? e.message : "Failed to load orders"); setData(null); }
  }, [bucket, page]);

  useEffect(() => { void load(); }, [load]);

  const exportPdf = async (range: "today" | "week" | "month" | "year") => {
    setPdfErr(null); setPdfLoading(range);
    try { await downloadAdminOrdersPdf(range); }
    catch (e) { setPdfErr(e instanceof Error ? e.message : "PDF export failed"); }
    finally { setPdfLoading(null); }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: "12px" }}>
        <div>
          <h1 style={{ fontSize: "22px", fontWeight: 700, color: "#2c2420" }}>Orders</h1>
          <p style={{ fontSize: "13px", color: "#8a7060", marginTop: "4px" }}>
            Attempted = payment never completed. Cancelled = paid or COD order that was cancelled. Abandoned = unpaid
            over 48h.
          </p>
        </div>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          {(["today","week","month","year"] as const).map((range) => (
            <button key={range} type="button" disabled={pdfLoading !== null} onClick={() => void exportPdf(range)}
              style={{ padding: "8px 14px", borderRadius: "8px", fontSize: "12px", fontWeight: 500, cursor: "pointer", border: "1px solid #e0d8ce", background: "#fff", color: "#6b5c52", opacity: pdfLoading ? 0.6 : 1 }}>
              {pdfLoading === range ? "Preparing…" : `PDF: ${range}`}
            </button>
          ))}
        </div>
      </div>
      {pdfErr && <p style={{ color: "#dc2626", fontSize: "13px" }}>{pdfErr}</p>}

      {/* Status filters */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
        {buckets.map((b) => (
          <button key={b.value} type="button" onClick={() => { setPage(1); setBucket(b.value); }}
            style={{ padding: "7px 16px", borderRadius: "999px", fontSize: "13px", fontWeight: 500, cursor: "pointer", border: "1px solid", borderColor: bucket === b.value ? "#1e3a2f" : "#e0d8ce", background: bucket === b.value ? "#1e3a2f" : "#fff", color: bucket === b.value ? "#fffbf5" : "#6b5c52", transition: "all 0.15s" }}>
            {b.label}
          </button>
        ))}
      </div>

      {err && <p style={{ color: "#dc2626", fontSize: "13px" }} role="alert">{err}</p>}

      {!data ? <p style={{ color: "#8a7060" }}>Loading...</p> : (
        <>
          <div style={{ ...card, overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr style={{ borderBottom: "2px solid #f0ece6" }}>
                {["Order","Customer","Items","Amount","Status","Date"].map((h) => <th key={h} style={thSt}>{h}</th>)}
              </tr></thead>
              <tbody>
                {data.items.map((o) => (
                  <tr key={o.id} onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "#faf8f5"; }} onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = ""; }}>
                    <td style={tdSt}><Link href={`/admin/orders/${o.id}`} style={{ fontFamily: "monospace", fontWeight: 600, color: "#c8960a", textDecoration: "none" }}>{o.orderNumber}</Link></td>
                    <td style={tdSt}>
                      <div style={{ fontWeight: 500, color: "#2c2420" }}>{o.email}</div>
                      {o.customerName && <div style={{ fontSize: "12px", color: "#8a7060" }}>{o.customerName}</div>}
                    </td>
                    <td style={tdSt}>
                      <span style={{ fontSize: "12px" }}>{o.itemCount} units</span>
                      {o.linePreview.length > 0 && <div style={{ fontSize: "11px", color: "#8a7060", maxWidth: "180px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.linePreview.join(" · ")}</div>}
                    </td>
                    <td style={{ ...tdSt, fontWeight: 600 }}>{formatMinorFromPaise(o.grandTotalInPaise, o.currency)}</td>
                    <td style={tdSt}><StatusBadge status={o.status} paymentStatus={o.paymentStatus} /></td>
                    <td style={{ ...tdSt, fontSize: "12px", color: "#8a7060", whiteSpace: "nowrap" }}>{new Date(o.createdAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <AdminPagination page={page} totalPages={data.pagination.totalPages} total={data.pagination.total} itemLabel="orders" onPrev={() => setPage((p) => Math.max(1, p - 1))} onNext={() => setPage((p) => Math.min(data.pagination.totalPages, p + 1))} />
        </>
      )}
    </div>
  );
}
