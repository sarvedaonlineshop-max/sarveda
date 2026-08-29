"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { AdminPagination } from "@/components/admin/AdminPagination";
import { AdminTableSkeleton } from "@/components/admin/AdminSkeleton";
import type { AdminOrdersQuery, OrdersListData } from "@/lib/admin-api";
import { downloadAdminOrdersExport, fetchAdminOrders } from "@/lib/admin-api";
import { formatMinorFromPaise } from "@/lib/money";
import { formatAdminOrderStatusLabel } from "@/lib/order-status-display";

const buckets = [
  { value: "all", label: "All" },
  { value: "paid", label: "Paid" },
  { value: "pending", label: "Pending payment" },
  { value: "abandoned", label: "Abandoned" },
  { value: "cancelled", label: "Cancelled" },
  { value: "refunded", label: "Refunded" },
  { value: "shipped", label: "Shipped" },
  { value: "delivered", label: "Delivered" }
] as const;

function StatusBadge({
  status,
  paymentStatus,
  paymentProvider
}: {
  status: string;
  paymentStatus: string;
  paymentProvider?: string | null;
}) {
  const label = formatAdminOrderStatusLabel(status, paymentStatus, paymentProvider);
  const s = label.toUpperCase().replace(/\s/g, "");
  let bg = "#f3f4f6",
    color = "#374151";
  if (s.includes("PAID") || s.includes("PROCESSING")) {
    bg = "#dcfce7";
    color = "#166534";
  } else if (s.includes("SHIPPED")) {
    bg = "#dbeafe";
    color = "#1e40af";
  } else if (s.includes("DELIVERED")) {
    bg = "#f0fdf4";
    color = "#15803d";
  } else if (s === "ABANDONED" || s === "ATTEMPTED") {
    bg = "#fef3c7";
    color = "#92400e";
  } else if (s.includes("CANCEL")) {
    bg = "#fee2e2";
    color = "#991b1b";
  } else if (s.includes("REFUND")) {
    bg = "#fef3c7";
    color = "#92400e";
  } else if (s.includes("PENDING")) {
    bg = "#f3f4f6";
    color = "#374151";
  }
  return (
    <span
      style={{
        background: bg,
        color,
        fontSize: "11px",
        fontWeight: 600,
        padding: "3px 10px",
        borderRadius: "999px",
        whiteSpace: "nowrap",
        border: `1px solid ${color}30`,
        display: "inline-flex",
        alignItems: "center"
      }}
    >
      <span
        style={{
          width: "6px",
          height: "6px",
          borderRadius: "50%",
          background: color,
          display: "inline-block",
          marginRight: "5px",
          flexShrink: 0
        }}
      />
      {label}
    </span>
  );
}

const card: React.CSSProperties = {
  background: "var(--admin-card-bg, #fff)",
  borderRadius: "12px",
  border: "1px solid var(--admin-card-border, #e8e2d9)",
  boxShadow: "0 1px 2px rgba(15,23,42,0.045), 0 8px 24px rgba(15,23,42,0.04)"
};
const thSt: React.CSSProperties = {
  padding: "11px 16px",
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
  padding: "12px 16px",
  fontSize: "13px",
  color: "var(--admin-text, #4a3f38)",
  borderBottom: "1px solid var(--admin-card-border, #f0ece6)"
};
const inputSt: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "8px 10px",
  borderRadius: "8px",
  border: "1px solid var(--admin-card-border, #e8e2d9)",
  background: "var(--admin-card-bg, #fff)",
  color: "var(--admin-text, #2c2420)",
  fontSize: "13px"
};
const labelSt: React.CSSProperties = {
  display: "block",
  fontSize: "11px",
  fontWeight: 600,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  color: "var(--admin-text-muted, #8a7060)",
  marginBottom: "4px"
};

function todayYmd(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

export default function AdminOrdersPage() {
  const [bucket, setBucket] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<OrdersListData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [exportErr, setExportErr] = useState<string | null>(null);
  const [exportLoading, setExportLoading] = useState<"pdf" | "xlsx" | null>(null);

  const [orderNumber, setOrderNumber] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [place, setPlace] = useState("");
  const [country, setCountry] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [todayOnly, setTodayOnly] = useState(false);

  const [applied, setApplied] = useState({
    orderNumber: "",
    customerName: "",
    place: "",
    country: "",
    from: "",
    to: "",
    todayOnly: false
  });

  const queryParams = useMemo((): AdminOrdersQuery => {
    return {
      bucket: bucket === "all" ? undefined : bucket,
      page,
      limit: 20,
      orderNumber: applied.orderNumber || undefined,
      customerName: applied.customerName || undefined,
      place: applied.place || undefined,
      country: applied.country || undefined,
      today: applied.todayOnly || undefined,
      from: applied.todayOnly ? undefined : applied.from || undefined,
      to: applied.todayOnly ? undefined : applied.to || undefined
    };
  }, [applied, bucket, page]);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const res = await fetchAdminOrders(queryParams);
      setData(res);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load orders");
      setData(null);
    }
  }, [queryParams]);

  useEffect(() => {
    void load();
  }, [load]);

  const applyFilters = () => {
    setPage(1);
    setApplied({
      orderNumber: orderNumber.trim(),
      customerName: customerName.trim(),
      place: place.trim(),
      country: country.trim(),
      from: from.trim(),
      to: to.trim(),
      todayOnly
    });
  };

  const clearFilters = () => {
    setOrderNumber("");
    setCustomerName("");
    setPlace("");
    setCountry("");
    setFrom("");
    setTo("");
    setTodayOnly(false);
    setPage(1);
    setApplied({
      orderNumber: "",
      customerName: "",
      place: "",
      country: "",
      from: "",
      to: "",
      todayOnly: false
    });
  };

  const exportParams = useMemo(
    (): Omit<AdminOrdersQuery, "page" | "limit"> => ({
      bucket: bucket === "all" ? undefined : bucket,
      orderNumber: applied.orderNumber || undefined,
      customerName: applied.customerName || undefined,
      place: applied.place || undefined,
      country: applied.country || undefined,
      today: applied.todayOnly || undefined,
      from: applied.todayOnly ? undefined : applied.from || undefined,
      to: applied.todayOnly ? undefined : applied.to || undefined
    }),
    [applied, bucket]
  );

  const runExport = async (format: "pdf" | "xlsx") => {
    setExportErr(null);
    setExportLoading(format);
    try {
      await downloadAdminOrdersExport(format, exportParams);
    } catch (e) {
      setExportErr(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExportLoading(null);
    }
  };

  const counts = data?.counts;

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
        <h1 style={{ fontSize: "26px", fontWeight: 800, color: "#faf5ec", margin: 0 }}>🛒 Orders</h1>
        <p style={{ fontSize: "12px", color: "#a8c4b0", marginTop: "6px", marginBottom: 0 }}>
          Pending payment = unpaid within 15 minutes · Abandoned = payment never completed · Cancelled = paid or COD
          order cancelled
        </p>
      </div>

      <div style={{ ...card, padding: "16px 18px" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
            gap: "12px",
            alignItems: "end"
          }}
        >
          <div>
            <label style={labelSt} htmlFor="ord-id">
              Order ID
            </label>
            <input
              id="ord-id"
              value={orderNumber}
              onChange={(e) => setOrderNumber(e.target.value)}
              placeholder="SRV-…"
              style={inputSt}
            />
          </div>
          <div>
            <label style={labelSt} htmlFor="ord-customer">
              Customer name
            </label>
            <input
              id="ord-customer"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Name / email / phone"
              style={inputSt}
            />
          </div>
          <div>
            <label style={labelSt} htmlFor="ord-place">
              Place
            </label>
            <input
              id="ord-place"
              value={place}
              onChange={(e) => setPlace(e.target.value)}
              placeholder="City / state / PIN"
              style={inputSt}
            />
          </div>
          <div>
            <label style={labelSt} htmlFor="ord-country">
              Country
            </label>
            <input
              id="ord-country"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              placeholder="IN / US / GB"
              style={inputSt}
            />
          </div>
          <div>
            <label style={labelSt} htmlFor="ord-from">
              From
            </label>
            <input
              id="ord-from"
              type="date"
              value={from}
              disabled={todayOnly}
              onChange={(e) => setFrom(e.target.value)}
              style={{ ...inputSt, opacity: todayOnly ? 0.5 : 1 }}
            />
          </div>
          <div>
            <label style={labelSt} htmlFor="ord-to">
              To
            </label>
            <input
              id="ord-to"
              type="date"
              value={to}
              disabled={todayOnly}
              onChange={(e) => setTo(e.target.value)}
              style={{ ...inputSt, opacity: todayOnly ? 0.5 : 1 }}
            />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <label
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                fontSize: "13px",
                color: "var(--admin-text, #4a3f38)",
                cursor: "pointer",
                userSelect: "none"
              }}
            >
              <input
                type="checkbox"
                checked={todayOnly}
                onChange={(e) => {
                  const on = e.target.checked;
                  setTodayOnly(on);
                  if (on) {
                    const d = todayYmd();
                    setFrom(d);
                    setTo(d);
                  }
                }}
              />
              Today only
            </label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
              <button
                type="button"
                onClick={applyFilters}
                style={{
                  padding: "8px 14px",
                  borderRadius: "8px",
                  border: "none",
                  background: "linear-gradient(135deg, #1c352a, #2d5040)",
                  color: "#fffbf5",
                  fontSize: "13px",
                  fontWeight: 600,
                  cursor: "pointer"
                }}
              >
                Search
              </button>
              <button
                type="button"
                onClick={clearFilters}
                style={{
                  padding: "8px 14px",
                  borderRadius: "8px",
                  border: "1px solid var(--admin-card-border, #e8e2d9)",
                  background: "transparent",
                  color: "#6b5c52",
                  fontSize: "13px",
                  fontWeight: 500,
                  cursor: "pointer"
                }}
              >
                Clear
              </button>
              <button
                type="button"
                disabled={exportLoading !== null}
                onClick={() => void runExport("xlsx")}
                style={{
                  padding: "8px 14px",
                  borderRadius: "8px",
                  border: "1px solid #1e3a2f",
                  background: exportLoading === "xlsx" ? "#faf5ec" : "#fff",
                  color: "#1c352a",
                  fontSize: "13px",
                  fontWeight: 600,
                  cursor: "pointer",
                  opacity: exportLoading ? 0.7 : 1
                }}
              >
                {exportLoading === "xlsx" ? "Exporting…" : "Export Excel"}
              </button>
              <button
                type="button"
                disabled={exportLoading !== null}
                onClick={() => void runExport("pdf")}
                style={{
                  padding: "8px 14px",
                  borderRadius: "8px",
                  border: "1px solid #1e3a2f",
                  background: exportLoading === "pdf" ? "#faf5ec" : "#fff",
                  color: "#1c352a",
                  fontSize: "13px",
                  fontWeight: 600,
                  cursor: "pointer",
                  opacity: exportLoading ? 0.7 : 1
                }}
              >
                {exportLoading === "pdf" ? "Exporting…" : "Export PDF"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {exportErr ? (
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
          ⚠️ {exportErr}
        </p>
      ) : null}

      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
        {buckets.map((b) => {
          const count = counts?.[b.value as keyof NonNullable<typeof counts>];
          const active = bucket === b.value;
          return (
            <button
              key={b.value}
              type="button"
              onClick={() => {
                setPage(1);
                setBucket(b.value);
              }}
              onMouseEnter={(e) => {
                if (active) return;
                e.currentTarget.style.background = "#faf5ec";
                e.currentTarget.style.borderColor = "#b98a3e";
              }}
              onMouseLeave={(e) => {
                if (active) return;
                e.currentTarget.style.background = "var(--admin-card-bg, #fff)";
                e.currentTarget.style.borderColor = "var(--admin-card-border, #e8e2d9)";
              }}
              style={{
                padding: "7px 14px",
                borderRadius: "999px",
                fontSize: "13px",
                fontWeight: 500,
                cursor: "pointer",
                border: "1px solid",
                borderColor: active ? "#1e3a2f" : "var(--admin-card-border, #e8e2d9)",
                background: active ? "linear-gradient(135deg, #1c352a, #2d5040)" : "var(--admin-card-bg, #fff)",
                color: active ? "#fffbf5" : "#6b5c52",
                transition: "all 0.15s",
                boxShadow: active ? "0 2px 8px rgba(28,53,42,0.20)" : "none",
                display: "inline-flex",
                alignItems: "center",
                gap: "6px"
              }}
            >
              <span>{b.label}</span>
              <span
                style={{
                  fontSize: "11px",
                  fontWeight: 700,
                  minWidth: "18px",
                  padding: "1px 6px",
                  borderRadius: "999px",
                  background: active ? "rgba(255,255,255,0.18)" : "#f0ece6",
                  color: active ? "#fffbf5" : "#5a4a40"
                }}
              >
                {typeof count === "number" ? count : "–"}
              </span>
            </button>
          );
        })}
      </div>

      {err && (
        <p style={{ color: "#dc2626", fontSize: "13px" }} role="alert">
          {err}
        </p>
      )}

      {!data ? (
        <AdminTableSkeleton rows={8} cols={7} />
      ) : (
        <>
          <div style={{ ...card, overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #f0ece6" }}>
                  {["Order", "Customer", "Place", "Items", "Amount", "Status", "Date"].map((h) => (
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
                        <div style={{ fontWeight: 600, color: "var(--admin-text, #2c2420)", fontSize: "13px" }}>
                          {o.customerName}
                        </div>
                      ) : null}
                      <div style={{ fontSize: "11px", color: "var(--admin-text-muted, #8a7060)" }}>{o.email}</div>
                    </td>
                    <td style={tdSt}>
                      <div style={{ fontSize: "12px" }}>
                        {[o.city, o.state].filter(Boolean).join(", ") || "—"}
                      </div>
                      {o.country ? (
                        <div style={{ fontSize: "11px", color: "var(--admin-text-muted, #8a7060)" }}>{o.country}</div>
                      ) : null}
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
                      <StatusBadge
                        status={o.status}
                        paymentStatus={o.paymentStatus}
                        paymentProvider={o.paymentProvider}
                      />
                    </td>
                    <td
                      style={{
                        ...tdSt,
                        fontSize: "12px",
                        color: "var(--admin-text-muted, #8a7060)",
                        whiteSpace: "nowrap"
                      }}
                    >
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
