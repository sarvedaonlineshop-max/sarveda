"use client";

import Link from "next/link";
import { ShoppingCart } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useRegisterAdminHeaderSlot } from "@/components/admin/AdminHeaderSlotContext";
import { AdminPagination } from "@/components/admin/AdminPagination";
import { AdminTableSkeleton } from "@/components/admin/AdminSkeleton";
import type { AdminOrdersQuery, OrdersListData } from "@/lib/admin-api";
import { downloadAdminOrdersExport, fetchAdminOrders } from "@/lib/admin-api";
import { formatMinorFromPaise } from "@/lib/money";
import { formatAdminOrderStatusLabel } from "@/lib/order-status-display";

const onlineBuckets = [
  { value: "all", label: "All" },
  { value: "new", label: "New" },
  { value: "processed", label: "Processed" },
  { value: "abandoned", label: "Abandoned" },
  { value: "cancelled", label: "Cancelled" },
  { value: "refunded", label: "Refunded" }
] as const;

const codBuckets = [
  { value: "all", label: "All" },
  { value: "new", label: "New" },
  { value: "processed", label: "Processed" },
  { value: "cancelled", label: "Cancelled" },
  { value: "refunded", label: "Refunded" }
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
        fontSize: "14px",
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
  fontSize: "14px",
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
  fontSize: "16px",
  color: "var(--admin-text, #4a3f38)",
  borderBottom: "1px solid var(--admin-card-border, #f0ece6)"
};
const inputSt: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "6px 8px",
  borderRadius: "8px",
  border: "1px solid var(--admin-card-border, #e8e2d9)",
  background: "var(--admin-card-bg, #fff)",
  color: "var(--admin-text, #2c2420)",
  fontSize: "15px",
  minWidth: 0
};
const labelSt: React.CSSProperties = {
  display: "block",
  fontSize: "13px",
  fontWeight: 600,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  color: "var(--admin-text-muted, #8a7060)",
  marginBottom: "3px",
  whiteSpace: "nowrap"
};

function todayYmd(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

export default function AdminOrdersPage() {
  const [channel, setChannel] = useState<"online" | "cod">("online");
  const [bucket, setBucket] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<OrdersListData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [exportErr, setExportErr] = useState<string | null>(null);
  const [exportLoading, setExportLoading] = useState<"pdf" | "xlsx" | null>(null);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement | null>(null);

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

  const buckets = channel === "cod" ? codBuckets : onlineBuckets;

  const queryParams = useMemo((): AdminOrdersQuery => {
    return {
      channel,
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
  }, [applied, bucket, channel, page]);

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

  useEffect(() => {
    if (!exportMenuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (!exportMenuRef.current?.contains(e.target as Node)) {
        setExportMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [exportMenuOpen]);

  const ordersLegend =
    channel === "online"
      ? "Online paid · New = just paid (awaiting Mark Processing) · Processed = processing through delivered · Abandoned = never paid · Cancelled = stopped · Refunded = money returned · Labels under Shipments → Ready to ship"
      : "COD · New = just placed · Processed = processing through delivered · Cancelled = stopped · Refunded = cash/manual return if collected · Labels under Shipments → Ready to ship";

  useRegisterAdminHeaderSlot(
    () => ({
      hideSearch: true,
      leading: (
        <div style={{ display: "flex", alignItems: "center", gap: "12px", minWidth: 0, maxWidth: "920px" }}>
          <ShoppingCart size={24} strokeWidth={2.25} color="#e8d5a8" aria-hidden />
          <div style={{ minWidth: 0 }}>
            <h1
              style={{
                margin: 0,
                fontSize: "23px",
                fontWeight: 700,
                color: "#faf5ec",
                lineHeight: 1.2,
                letterSpacing: "-0.02em"
              }}
            >
              Orders
            </h1>
            <p
              style={{
                margin: "3px 0 0",
                fontSize: "14px",
                lineHeight: 1.4,
                color: "#a8c4b0"
              }}
            >
              {ordersLegend.replace(/ · Labels under Shipments → Ready to ship$/, "")} · Labels under{" "}
              <Link href="/admin/shipments?bucket=ready" style={{ color: "#e8d5a8", fontWeight: 600 }}>
                Shipments → Ready to ship
              </Link>
            </p>
          </div>
        </div>
      )
    }),
    [ordersLegend]
  );

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
      channel,
      bucket: bucket === "all" ? undefined : bucket,
      orderNumber: applied.orderNumber || undefined,
      customerName: applied.customerName || undefined,
      place: applied.place || undefined,
      country: applied.country || undefined,
      today: applied.todayOnly || undefined,
      from: applied.todayOnly ? undefined : applied.from || undefined,
      to: applied.todayOnly ? undefined : applied.to || undefined
    }),
    [applied, bucket, channel]
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
  const channelCounts = data?.channelCounts;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      {/* Line 1 — payment channel line-tabs (SS7 style) */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "4px",
          borderBottom: "2px solid var(--admin-card-border, #e8e2d9)",
          paddingBottom: 0
        }}
      >
        {(
          [
            { value: "online" as const, label: "Online Paid", icon: "💳" },
            { value: "cod" as const, label: "Cash On Delivery", icon: "💵" }
          ] as const
        ).map((ch) => {
          const active = channel === ch.value;
          const count = channelCounts?.[ch.value];
          return (
            <button
              key={ch.value}
              type="button"
              onClick={() => {
                setChannel(ch.value);
                setBucket("all");
                setPage(1);
              }}
              style={{
                padding: "10px 16px",
                fontSize: "17px",
                fontWeight: active ? 700 : 500,
                cursor: "pointer",
                border: "none",
                background: "transparent",
                color: active ? "#1c352a" : "#8a7060",
                borderBottom: active ? "2px solid #b98a3e" : "2px solid transparent",
                marginBottom: "-2px",
                transition: "all 0.15s",
                display: "inline-flex",
                alignItems: "center",
                gap: "8px"
              }}
            >
              <span aria-hidden>{ch.icon}</span>
              <span>{ch.label}</span>
              <span
                style={{
                  fontSize: "14px",
                  fontWeight: 700,
                  minWidth: "18px",
                  padding: "1px 7px",
                  borderRadius: "999px",
                  background: active ? "rgba(28,53,42,0.1)" : "#f0ece6",
                  color: active ? "#1c352a" : "#5a4a40"
                }}
              >
                {typeof count === "number" ? count : "–"}
              </span>
            </button>
          );
        })}
      </div>

      {/* Line 2 — status pills */}
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
              style={{
                padding: "7px 14px",
                borderRadius: "999px",
                fontSize: "16px",
                fontWeight: 500,
                cursor: "pointer",
                border: "1px solid",
                borderColor: active ? "#1e3a2f" : "var(--admin-card-border, #e8e2d9)",
                background: active
                  ? "linear-gradient(135deg, #1c352a, #2d5040)"
                  : "var(--admin-card-bg, #fff)",
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
                  fontSize: "14px",
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

      {/* Line 3 — search filters + exports (wrap so Exports stays visible) */}
      <div
        style={{
          ...card,
          padding: "12px 14px",
          display: "flex",
          flexWrap: "wrap",
          alignItems: "flex-end",
          gap: "8px",
          overflow: "visible"
        }}
      >
        <div style={{ flex: "1 1 90px", minWidth: "90px" }}>
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
        <div style={{ flex: "1.2 1 110px", minWidth: "110px" }}>
          <label style={labelSt} htmlFor="ord-customer">
            Customer
          </label>
          <input
            id="ord-customer"
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            placeholder="Name / email / phone"
            style={inputSt}
          />
        </div>
        <div style={{ flex: "1 1 95px", minWidth: "95px" }}>
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
        <div style={{ flex: "0.9 1 88px", minWidth: "88px" }}>
          <label style={labelSt} htmlFor="ord-country">
            Country
          </label>
          <input
            id="ord-country"
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            placeholder="India / US / UK"
            style={inputSt}
          />
        </div>
        <div style={{ flex: "0.8 1 108px", minWidth: "108px" }}>
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
        <div style={{ flex: "0.8 1 108px", minWidth: "108px" }}>
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
        <label
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            fontSize: "15px",
            color: "var(--admin-text, #4a3f38)",
            cursor: "pointer",
            userSelect: "none",
            whiteSpace: "nowrap",
            paddingBottom: "6px",
            flex: "0 0 auto"
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
          Today
        </label>
        <button
          type="button"
          onClick={applyFilters}
          style={{
            padding: "7px 12px",
            borderRadius: "8px",
            border: "none",
            background: "linear-gradient(135deg, #1c352a, #2d5040)",
            color: "#fffbf5",
            fontSize: "15px",
            fontWeight: 600,
            cursor: "pointer",
            whiteSpace: "nowrap",
            flex: "0 0 auto"
          }}
        >
          Search
        </button>
        <button
          type="button"
          onClick={clearFilters}
          style={{
            padding: "7px 12px",
            borderRadius: "8px",
            border: "1px solid var(--admin-card-border, #e8e2d9)",
            background: "transparent",
            color: "#6b5c52",
            fontSize: "15px",
            fontWeight: 500,
            cursor: "pointer",
            whiteSpace: "nowrap",
            flex: "0 0 auto"
          }}
        >
          Clear
        </button>
        <div ref={exportMenuRef} style={{ position: "relative", flex: "0 0 auto", marginLeft: "auto", zIndex: 30 }}>
          <button
            type="button"
            disabled={exportLoading !== null}
            onClick={() => setExportMenuOpen((o) => !o)}
            style={{
              padding: "7px 12px",
              borderRadius: "8px",
              border: "1px solid #1e3a2f",
              background: "#fff",
              color: "#1c352a",
              fontSize: "15px",
              fontWeight: 600,
              cursor: "pointer",
              whiteSpace: "nowrap",
              opacity: exportLoading ? 0.7 : 1
            }}
          >
            {exportLoading ? "Exporting…" : "Exports ▾"}
          </button>
          {exportMenuOpen ? (
            <div
              role="menu"
              style={{
                position: "absolute",
                right: 0,
                top: "calc(100% + 4px)",
                zIndex: 40,
                minWidth: "160px",
                background: "#ffffff",
                border: "1px solid var(--admin-card-border, #e8e2d9)",
                borderRadius: "10px",
                boxShadow: "0 12px 28px rgba(15,23,42,0.18)",
                padding: "6px",
                display: "flex",
                flexDirection: "column",
                gap: "2px"
              }}
            >
              <button
                type="button"
                role="menuitem"
                disabled={exportLoading !== null}
                onClick={() => {
                  setExportMenuOpen(false);
                  void runExport("xlsx");
                }}
                style={{
                  textAlign: "left",
                  padding: "8px 10px",
                  borderRadius: "8px",
                  border: "none",
                  background: "transparent",
                  cursor: "pointer",
                  fontSize: "16px",
                  fontWeight: 600,
                  color: "#1c352a"
                }}
              >
                Export Excel
              </button>
              <button
                type="button"
                role="menuitem"
                disabled={exportLoading !== null}
                onClick={() => {
                  setExportMenuOpen(false);
                  void runExport("pdf");
                }}
                style={{
                  textAlign: "left",
                  padding: "8px 10px",
                  borderRadius: "8px",
                  border: "none",
                  background: "transparent",
                  cursor: "pointer",
                  fontSize: "16px",
                  fontWeight: 600,
                  color: "#1c352a"
                }}
              >
                Export PDF
              </button>
            </div>
          ) : null}
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
            fontSize: "16px",
            margin: 0
          }}
        >
          ⚠️ {exportErr}
        </p>
      ) : null}

      {err && (
        <p style={{ color: "#dc2626", fontSize: "16px" }} role="alert">
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
                        <div style={{ fontWeight: 600, color: "var(--admin-text, #2c2420)", fontSize: "16px" }}>
                          {o.customerName}
                        </div>
                      ) : null}
                      <div style={{ fontSize: "14px", color: "var(--admin-text-muted, #8a7060)" }}>{o.email}</div>
                    </td>
                    <td style={tdSt}>
                      <div style={{ fontSize: "15px" }}>
                        {[o.city, o.state].filter(Boolean).join(", ") || "—"}
                      </div>
                      {o.country ? (
                        <div style={{ fontSize: "14px", color: "var(--admin-text-muted, #8a7060)" }}>{o.country}</div>
                      ) : null}
                    </td>
                    <td style={tdSt}>
                      <span style={{ fontSize: "15px" }}>{o.itemCount} units</span>
                      {o.linePreview.length > 0 && (
                        <div
                          title={o.linePreview.join(" · ")}
                          style={{
                            fontSize: "14px",
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
                        fontSize: "15px",
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
