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
  return <span style={{ background: bg, color, fontSize: "11px", fontWeight: 600, padding: "3px 10px", borderRadius: "999px", whiteSpace: "nowrap", border: `1px solid ${color}30`, display: "inline-flex", alignItems: "center" }}><span style={{ width:"6px", height:"6px", borderRadius:"50%", background: color, display:"inline-block", marginRight:"5px", flexShrink:0 }} />{label}</span>;
}

const card: React.CSSProperties = { background: "var(--admin-card-bg, #fff)", borderRadius: "12px", border: "1px solid var(--admin-card-border, #e8e2d9)", boxShadow: "0 4px 20px rgba(28,53,42,0.08)" };
const thSt: React.CSSProperties = { padding: "11px 16px", fontSize: "11px", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--admin-text-muted, #8a7060)", background: "var(--admin-table-head, linear-gradient(180deg,#f2ede5,#f9f7f4))", textAlign: "left", whiteSpace: "nowrap" };
const tdSt: React.CSSProperties = { padding: "12px 16px", fontSize: "13px", color: "var(--admin-text, #4a3f38)", borderBottom: "1px solid var(--admin-card-border, #f0ece6)" };

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
      <div
        style={{
          background: "linear-gradient(135deg, #1c352a 0%, #2d5040 100%)",
          borderRadius: "16px",
          padding: "22px 28px",
          marginBottom: "4px"
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "16px", flexWrap: "wrap" }}>
          <div>
            <h1 style={{ fontSize: "26px", fontWeight: 800, color: "#faf5ec", margin: 0 }}>🛒 Orders</h1>
            <p style={{ fontSize: "12px", color: "#a8c4b0", marginTop: "6px", marginBottom: 0 }}>
              Attempted = payment never completed · Cancelled = paid/COD order cancelled · Abandoned = unpaid over 48h
            </p>
          </div>
          <div
            style={{
              background: "rgba(255,255,255,0.1)",
              borderRadius: "10px",
              padding: "4px",
              border: "1px solid rgba(255,255,255,0.15)",
              display: "flex",
              gap: "2px",
              flexWrap: "wrap"
            }}
          >
            {(["today", "week", "month", "year"] as const).map((range) => (
              <button
                key={range}
                type="button"
                disabled={pdfLoading !== null}
                onClick={() => void exportPdf(range)}
                style={{
                  padding: "6px 12px",
                  borderRadius: "8px",
                  fontSize: "12px",
                  fontWeight: 600,
                  cursor: "pointer",
                  border: "none",
                  background: pdfLoading === range ? "#faf5ec" : "transparent",
                  color: pdfLoading === range ? "#1c352a" : "#e8d8bc",
                  opacity: pdfLoading ? 0.6 : 1
                }}
              >
                {pdfLoading === range ? "Preparing…" : `📄 PDF: ${range}`}
              </button>
            ))}
          </div>
        </div>
      </div>
      {pdfErr ? (
        <p
          style={{
            background: "#fef2f2",
            borderLeft: "3px solid #dc2626",
            borderRadius: "8px",
            padding: "8px 12px",
            color: "#dc2626",
            fontSize: "13px",
            margin: 0
          }}
        >
          ⚠️ {pdfErr}
        </p>
      ) : null}

      {/* Status filters */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
        {buckets.map((b) => (
          <button
            key={b.value}
            type="button"
            onClick={() => {
              setPage(1);
              setBucket(b.value);
            }}
            onMouseEnter={(e) => {
              if (bucket === b.value) return;
              e.currentTarget.style.background = "#faf5ec";
              e.currentTarget.style.borderColor = "#b98a3e";
            }}
            onMouseLeave={(e) => {
              if (bucket === b.value) return;
              e.currentTarget.style.background = "var(--admin-card-bg, #fff)";
              e.currentTarget.style.borderColor = "var(--admin-card-border, #e8e2d9)";
            }}
            style={{
              padding: "7px 16px",
              borderRadius: "999px",
              fontSize: "13px",
              fontWeight: 500,
              cursor: "pointer",
              border: "1px solid",
              borderColor: bucket === b.value ? "#1e3a2f" : "var(--admin-card-border, #e8e2d9)",
              background: bucket === b.value ? "linear-gradient(135deg, #1c352a, #2d5040)" : "var(--admin-card-bg, #fff)",
              color: bucket === b.value ? "#fffbf5" : "#6b5c52",
              transition: "all 0.15s",
              boxShadow: bucket === b.value ? "0 2px 8px rgba(28,53,42,0.20)" : "none"
            }}
          >
            {b.label}
          </button>
        ))}
      </div>

      {err && (
        <p style={{ color: "#dc2626", fontSize: "13px" }} role="alert">
          {err}
        </p>
      )}

      {!data ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            color: "var(--admin-text-muted, #8a7060)",
            padding: "40px 16px",
            justifyContent: "center"
          }}
        >
          <span style={{ fontSize: "22px" }}>🛒</span>
          <span style={{ fontSize: "14px" }}>Loading orders…</span>
        </div>
      ) : (
        <>
          <div style={{ ...card, overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #f0ece6" }}>
                  {["Order", "Customer", "Items", "Amount", "Status", "Date"].map((h) => (
                    <th key={h} style={thSt}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.items.map((o) => (
                  <tr
                    key={o.id}
                    onClick={() => {
                      window.location.href = `/admin/orders/${o.id}`;
                    }}
                    style={{ cursor: "pointer" }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLElement).style.background = "var(--admin-row-hover, #faf5ec)";
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLElement).style.background = "";
                    }}
                  >
                    <td style={tdSt}>
                      <Link
                        href={`/admin/orders/${o.id}`}
                        style={{
                          fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                          fontWeight: 600,
                          color: "#b98a3e",
                          textDecoration: "none"
                        }}
                      >
                        {o.orderNumber}
                      </Link>
                    </td>
                    <td style={tdSt}>
                      {o.customerName ? (
                        <div style={{ fontWeight: 600, color: "var(--admin-text, #2c2420)", fontSize: "13px" }}>{o.customerName}</div>
                      ) : null}
                      <div style={{ fontSize: "11px", color: "var(--admin-text-muted, #8a7060)" }}>{o.email}</div>
                    </td>
                    <td style={tdSt}>
                      <span style={{ fontSize: "12px" }}>{o.itemCount} units</span>
                      {o.linePreview.length > 0 && (
                        <div
                          title={o.linePreview.join(" · ")}
                          style={{
                            fontSize: "11px",
                            color: "var(--admin-text-muted, #8a7060)",
                            maxWidth: "180px",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap"
                          }}
                        >
                          {o.linePreview.join(" · ")}
                        </div>
                      )}
                    </td>
                    <td style={{ ...tdSt, fontWeight: 700, color: "var(--admin-text, #2c2420)" }}>
                      {formatMinorFromPaise(o.grandTotalInPaise, o.currency)}
                    </td>
                    <td style={tdSt}>
                      <StatusBadge status={o.status} paymentStatus={o.paymentStatus} />
                    </td>
                    <td style={{ ...tdSt, fontSize: "12px", color: "var(--admin-text-muted, #8a7060)", whiteSpace: "nowrap" }}>
                      {new Date(o.createdAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <AdminPagination
            page={page}
            totalPages={data.pagination.totalPages}
            total={data.pagination.total}
            itemLabel="orders"
            onPrev={() => setPage((p) => Math.max(1, p - 1))}
            onNext={() => setPage((p) => Math.min(data.pagination.totalPages, p + 1))}
          />
        </>
      )}
    </div>
  );
}
