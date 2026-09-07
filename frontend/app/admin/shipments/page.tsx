"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { AdminPagination } from "@/components/admin/AdminPagination";
import { AdminTableSkeleton } from "@/components/admin/AdminSkeleton";
import type { AdminShipmentsQuery, ShipmentsListData } from "@/lib/admin-api";
import { fetchAdminShipments } from "@/lib/admin-api";
import { formatMinorFromPaise } from "@/lib/money";

const buckets = [
  { value: "all", label: "All shipments" },
  { value: "ready", label: "Ready to ship" },
  { value: "created", label: "Created" },
  { value: "picked", label: "Picked" },
  { value: "intransit", label: "In transit" },
  { value: "ofd", label: "Out for delivery" },
  { value: "delivered", label: "Delivered" },
  { value: "rto", label: "RTO" }
] as const;

function shipmentBadge(status: string | null, kind: "ready" | "shipment") {
  const label =
    kind === "ready"
      ? "READY TO SHIP"
      : (status ?? "UNKNOWN").replace(/_/g, " ");
  let bg = "#f3f4f6";
  let color = "#374151";
  if (kind === "ready") {
    bg = "#fef3c7";
    color = "#92400e";
  } else if (status === "CREATED" || status === "PICKED") {
    bg = "#dbeafe";
    color = "#1e40af";
  } else if (status === "INTRANSIT" || status === "OUT_FOR_DELIVERY") {
    bg = "#e0e7ff";
    color = "#3730a3";
  } else if (status === "DELIVERED") {
    bg = "#dcfce7";
    color = "#166534";
  } else if (status === "RTO") {
    bg = "#fee2e2";
    color = "#991b1b";
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
        border: `1px solid ${color}30`
      }}
    >
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

export default function AdminShipmentsPage() {
  const [bucket, setBucket] = useState<string>("ready");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ShipmentsListData | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [orderNumber, setOrderNumber] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [place, setPlace] = useState("");
  const [country, setCountry] = useState("");
  const [awb, setAwb] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [todayOnly, setTodayOnly] = useState(false);

  const [applied, setApplied] = useState({
    orderNumber: "",
    customerName: "",
    place: "",
    country: "",
    awb: "",
    from: "",
    to: "",
    todayOnly: false
  });

  const queryParams = useMemo((): AdminShipmentsQuery => {
    return {
      bucket,
      page,
      limit: 20,
      orderNumber: applied.orderNumber || undefined,
      customerName: applied.customerName || undefined,
      place: applied.place || undefined,
      country: applied.country || undefined,
      awb: applied.awb || undefined,
      today: applied.todayOnly || undefined,
      from: applied.todayOnly ? undefined : applied.from || undefined,
      to: applied.todayOnly ? undefined : applied.to || undefined
    };
  }, [applied, bucket, page]);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const res = await fetchAdminShipments(queryParams);
      setData(res);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load shipments");
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
      awb: awb.trim(),
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
    setAwb("");
    setFrom("");
    setTo("");
    setTodayOnly(false);
    setPage(1);
    setApplied({
      orderNumber: "",
      customerName: "",
      place: "",
      country: "",
      awb: "",
      from: "",
      to: "",
      todayOnly: false
    });
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
        <h1 style={{ fontSize: "26px", fontWeight: 800, color: "#faf5ec", margin: 0 }}>🚚 Shipments</h1>
        <p style={{ fontSize: "12px", color: "#a8c4b0", marginTop: "6px", marginBottom: 0 }}>
          Logistics desk · Ready = paid order with no AWB yet · Open a row to create/sync shipment on the order ·
          Returns reverse pickups stay under{" "}
          <a href="/admin/returns" style={{ color: "#e8d5a8", fontWeight: 600 }}>
            Returns
          </a>
        </p>
      </div>

      <div style={{ ...card, padding: "16px 18px" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
            gap: "12px",
            alignItems: "end"
          }}
        >
          <div>
            <label style={labelSt} htmlFor="ship-ord">
              Order ID
            </label>
            <input
              id="ship-ord"
              value={orderNumber}
              onChange={(e) => setOrderNumber(e.target.value)}
              placeholder="SRV-…"
              style={inputSt}
            />
          </div>
          <div>
            <label style={labelSt} htmlFor="ship-awb">
              AWB
            </label>
            <input
              id="ship-awb"
              value={awb}
              onChange={(e) => setAwb(e.target.value)}
              placeholder="Waybill"
              style={inputSt}
            />
          </div>
          <div>
            <label style={labelSt} htmlFor="ship-customer">
              Customer
            </label>
            <input
              id="ship-customer"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Name / email / phone"
              style={inputSt}
            />
          </div>
          <div>
            <label style={labelSt} htmlFor="ship-place">
              Place
            </label>
            <input
              id="ship-place"
              value={place}
              onChange={(e) => setPlace(e.target.value)}
              placeholder="City / state / PIN"
              style={inputSt}
            />
          </div>
          <div>
            <label style={labelSt} htmlFor="ship-country">
              Country
            </label>
            <input
              id="ship-country"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              placeholder="IN / US / GB"
              style={inputSt}
            />
          </div>
          <div>
            <label style={labelSt} htmlFor="ship-from">
              From
            </label>
            <input
              id="ship-from"
              type="date"
              value={from}
              disabled={todayOnly}
              onChange={(e) => setFrom(e.target.value)}
              style={{ ...inputSt, opacity: todayOnly ? 0.5 : 1 }}
            />
          </div>
          <div>
            <label style={labelSt} htmlFor="ship-to">
              To
            </label>
            <input
              id="ship-to"
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
            </div>
          </div>
        </div>
      </div>

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
                fontSize: "13px",
                fontWeight: 500,
                cursor: "pointer",
                border: "1px solid",
                borderColor: active ? "#1e3a2f" : "var(--admin-card-border, #e8e2d9)",
                background: active
                  ? "linear-gradient(135deg, #1c352a, #2d5040)"
                  : "var(--admin-card-bg, #fff)",
                color: active ? "#fffbf5" : "#6b5c52",
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

      {err ? (
        <p style={{ color: "#dc2626", fontSize: "13px" }} role="alert">
          {err}
        </p>
      ) : null}

      {!data ? (
        <AdminTableSkeleton rows={8} cols={8} />
      ) : (
        <>
          <div style={{ ...card, overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #f0ece6" }}>
                  {["Order", "Customer", "Place", "Courier / AWB", "Items", "Amount", "Status", "Date"].map(
                    (h) => (
                      <th key={h} style={thSt}>
                        {h}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody>
                {data.items.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ ...tdSt, textAlign: "center", color: "#8a7060" }}>
                      No shipments in this bucket
                    </td>
                  </tr>
                ) : (
                  data.items.map((row) => (
                    <tr
                      key={row.id}
                      onClick={() => {
                        window.location.href = `/admin/orders/${row.orderId}`;
                      }}
                      style={{ cursor: "pointer" }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLElement).style.background =
                          "var(--admin-row-hover, #faf5ec)";
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLElement).style.background = "";
                      }}
                    >
                      <td style={tdSt}>
                        <Link
                          href={`/admin/orders/${row.orderId}`}
                          style={{
                            fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                            fontWeight: 600,
                            color: "#b98a3e",
                            textDecoration: "none"
                          }}
                        >
                          {row.orderNumber}
                        </Link>
                      </td>
                      <td style={tdSt}>
                        {row.customerName ? (
                          <div style={{ fontWeight: 600, fontSize: "13px" }}>{row.customerName}</div>
                        ) : null}
                        <div style={{ fontSize: "11px", color: "var(--admin-text-muted, #8a7060)" }}>
                          {row.email}
                        </div>
                      </td>
                      <td style={tdSt}>
                        <div style={{ fontSize: "12px" }}>
                          {[row.city, row.state].filter(Boolean).join(", ") || "—"}
                        </div>
                        {row.country ? (
                          <div style={{ fontSize: "11px", color: "var(--admin-text-muted, #8a7060)" }}>
                            {row.country}
                          </div>
                        ) : null}
                      </td>
                      <td style={tdSt}>
                        {row.kind === "ready" ? (
                          <span style={{ fontSize: "12px", color: "#92400e", fontWeight: 600 }}>
                            Create on order →
                          </span>
                        ) : (
                          <>
                            <div style={{ fontWeight: 600, fontSize: "12px" }}>{row.courier || "—"}</div>
                            {row.awb ? (
                              row.trackingUrl ? (
                                <a
                                  href={row.trackingUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  style={{
                                    fontFamily: "ui-monospace, monospace",
                                    fontSize: "11px",
                                    color: "#1e40af"
                                  }}
                                >
                                  {row.awb}
                                </a>
                              ) : (
                                <div
                                  style={{
                                    fontFamily: "ui-monospace, monospace",
                                    fontSize: "11px",
                                    color: "#5a4a40"
                                  }}
                                >
                                  {row.awb}
                                </div>
                              )
                            ) : (
                              <div style={{ fontSize: "11px", color: "#8a7060" }}>No AWB</div>
                            )}
                          </>
                        )}
                      </td>
                      <td style={tdSt}>
                        <span style={{ fontSize: "12px" }}>{row.itemCount} units</span>
                        {row.linePreview.length > 0 ? (
                          <div
                            title={row.linePreview.join(" · ")}
                            style={{
                              fontSize: "11px",
                              color: "var(--admin-text-muted, #8a7060)",
                              maxWidth: "160px",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap"
                            }}
                          >
                            {row.linePreview.join(" · ")}
                          </div>
                        ) : null}
                      </td>
                      <td style={{ ...tdSt, fontWeight: 700 }}>
                        {formatMinorFromPaise(row.grandTotalInPaise, row.currency)}
                      </td>
                      <td style={tdSt}>{shipmentBadge(row.shipmentStatus, row.kind)}</td>
                      <td style={{ ...tdSt, whiteSpace: "nowrap", fontSize: "12px" }}>
                        {new Date(row.createdAt).toLocaleString("en-IN", {
                          timeZone: "Asia/Kolkata",
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                          hour: "numeric",
                          minute: "2-digit"
                        })}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <AdminPagination
            page={page}
            totalPages={data.pagination.totalPages}
            total={data.pagination.total}
            itemLabel="shipments"
            onPrev={() => setPage((p) => Math.max(1, p - 1))}
            onNext={() => setPage((p) => Math.min(data.pagination.totalPages, p + 1))}
          />
        </>
      )}
    </div>
  );
}
