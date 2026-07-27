"use client";

import { useEffect, useMemo, useState } from "react";

import type { AdminWooProductAnalytics, WooDumpProductRow } from "@/lib/admin-api";
import { fetchAdminWooAnalytics } from "@/lib/admin-api";
import { formatINRFromPaise } from "@/lib/money";

const card: React.CSSProperties = {
  background: "#fff",
  borderRadius: "12px",
  border: "1px solid #e8e2d9",
  boxShadow: "0 1px 4px rgba(44,36,32,0.06)",
  padding: "20px 24px"
};

type TabId = AdminWooProductAnalytics["tab"];
type ProductSub = "most" | "least" | "po" | "drop" | "places" | "orders" | "repeat";

const TABS: Array<{ id: TabId; label: string }> = [
  { id: "products", label: "Products" },
  { id: "orders", label: "Orders" },
  { id: "returns", label: "Returns" },
  { id: "refunds", label: "Refunds" },
  { id: "customers", label: "Customers" }
];

const PRODUCT_SUBS: Array<{ id: ProductSub; label: string }> = [
  { id: "most", label: "Most sold" },
  { id: "least", label: "Least sold" },
  { id: "po", label: "Raise PO" },
  { id: "drop", label: "Drop" },
  { id: "places", label: "Top places" },
  { id: "orders", label: "Highest orders" },
  { id: "repeat", label: "Repeat customers" }
];

function money(n: number) {
  return formatINRFromPaise(Math.round(n * 100));
}

function BarChart({
  rows,
  valueKey,
  labelKey
}: {
  rows: Array<Record<string, string | number>>;
  valueKey: string;
  labelKey: string;
}) {
  const max = Math.max(1, ...rows.map((r) => Number(r[valueKey]) || 0));
  if (rows.length === 0) {
    return <p style={{ fontSize: "13px", color: "#8a7060" }}>No trend data in this range.</p>;
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      {rows.map((r) => {
        const v = Number(r[valueKey]) || 0;
        const pct = Math.round((v / max) * 100);
        return (
          <div key={String(r[labelKey])} style={{ display: "grid", gridTemplateColumns: "72px 1fr 64px", gap: "10px", alignItems: "center" }}>
            <span style={{ fontSize: "12px", color: "#8a7060" }}>{String(r[labelKey])}</span>
            <div style={{ height: "10px", background: "#f0ece6", borderRadius: "999px", overflow: "hidden" }}>
              <div style={{ width: `${pct}%`, height: "100%", background: "#1e3a2f" }} />
            </div>
            <span style={{ fontSize: "12px", fontFamily: "monospace", color: "#2c2420", textAlign: "right" }}>
              {v}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function MiniTable({
  headers,
  rows,
  empty
}: {
  headers: string[];
  rows: React.ReactNode[][];
  empty: string;
}) {
  return (
    <div style={{ overflowX: "auto" }}>
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

function productRows(list: WooDumpProductRow[]) {
  return list.map((r, i) => [
    String(i + 1),
    r.productName,
    r.sku || "—",
    String(r.unitsSold),
    money(r.revenueInr)
  ]);
}

export default function AdminAnalyticsPage() {
  const [data, setData] = useState<AdminWooProductAnalytics | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabId>("products");
  const [productSub, setProductSub] = useState<ProductSub>("most");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [preset, setPreset] = useState<"all" | "month" | "year" | "custom">("all");

  const available = data?.meta.availableRange;

  useEffect(() => {
    setLoading(true);
    setErr(null);
    fetchAdminWooAnalytics({
      from: from || undefined,
      to: to || undefined,
      tab
    })
      .then((d) => {
        setData(d);
        if (!from && !to && d.meta.availableRange.minDate) {
          // keep empty for "all" unless user set filters; sync display defaults once
        }
      })
      .catch((e) => setErr(e instanceof Error ? e.message : "Failed to load analytics"))
      .finally(() => setLoading(false));
  }, [from, to, tab]);

  function applyPreset(next: "all" | "month" | "year" | "custom") {
    setPreset(next);
    if (!available?.minDate || !available?.maxDate) return;
    if (next === "all") {
      setFrom("");
      setTo("");
      return;
    }
    const max = available.maxDate;
    if (next === "month") {
      setFrom(max.slice(0, 7) + "-01");
      setTo(max);
      return;
    }
    if (next === "year") {
      setFrom(max.slice(0, 4) + "-01-01");
      setTo(max);
    }
  }

  const rangeLabel = useMemo(() => {
    if (!data) return "";
    const a = data.meta.appliedRange;
    return `${a.from} → ${a.to}`;
  }, [data]);

  if (err) return <p style={{ color: "#dc2626" }}>{err}</p>;

  const kpis = data?.overview.kpis;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <div>
        <h1 style={{ fontSize: "22px", fontWeight: 700, color: "#2c2420" }}>Analytics</h1>
      </div>

      <div style={card}>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "10px",
            alignItems: "end",
            justifyContent: "space-between"
          }}
        >
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
            {(
              [
                { id: "all" as const, label: "All time" },
                { id: "month" as const, label: "This month" },
                { id: "year" as const, label: "This year" },
                { id: "custom" as const, label: "Custom" }
              ] as const
            ).map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => applyPreset(p.id)}
                style={{
                  padding: "7px 12px",
                  borderRadius: "8px",
                  fontSize: "12px",
                  fontWeight: 700,
                  cursor: "pointer",
                  border: "1px solid",
                  borderColor: preset === p.id ? "#1e3a2f" : "#e0d8ce",
                  background: preset === p.id ? "#1e3a2f" : "#fff",
                  color: preset === p.id ? "#fffbf5" : "#6b5c52"
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "end" }}>
            <label style={{ fontSize: "12px", color: "#8a7060" }}>
              From
              <input
                type="date"
                value={from || data?.meta.availableRange.minDate || ""}
                min={available?.minDate}
                max={available?.maxDate}
                onChange={(e) => {
                  setPreset("custom");
                  setFrom(e.target.value);
                }}
                style={{
                  display: "block",
                  marginTop: "4px",
                  height: "36px",
                  border: "1px solid #e0d8ce",
                  borderRadius: "8px",
                  padding: "0 10px"
                }}
              />
            </label>
            <label style={{ fontSize: "12px", color: "#8a7060" }}>
              To
              <input
                type="date"
                value={to || data?.meta.availableRange.maxDate || ""}
                min={available?.minDate}
                max={available?.maxDate}
                onChange={(e) => {
                  setPreset("custom");
                  setTo(e.target.value);
                }}
                style={{
                  display: "block",
                  marginTop: "4px",
                  height: "36px",
                  border: "1px solid #e0d8ce",
                  borderRadius: "8px",
                  padding: "0 10px"
                }}
              />
            </label>
          </div>
        </div>
        {rangeLabel ? (
          <p style={{ fontSize: "12px", color: "#8a7060", marginTop: "10px" }}>Showing {rangeLabel}</p>
        ) : null}
      </div>

      {kpis ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
            gap: "12px"
          }}
        >
          {[
            { label: "Orders", value: String(kpis.orders) },
            { label: "Revenue", value: money(kpis.revenueInr) },
            { label: "AOV", value: money(kpis.aovInr) },
            { label: "Units", value: String(kpis.units) },
            { label: "Refunds", value: `${kpis.refundCount} · ${money(kpis.refundAmountInr)}` },
            { label: "Repeat buyers", value: String(kpis.repeatCustomerCount) }
          ].map((c) => (
            <div key={c.label} style={{ ...card, padding: "14px 16px" }}>
              <p
                style={{
                  fontSize: "11px",
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "#8a7060",
                  marginBottom: "6px"
                }}
              >
                {c.label}
              </p>
              <p style={{ fontSize: "1.05rem", fontWeight: 700, color: "#2c2420" }}>{c.value}</p>
            </div>
          ))}
        </div>
      ) : null}

      <div style={card}>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "16px" }}>
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              style={{
                padding: "8px 14px",
                borderRadius: "8px",
                fontSize: "13px",
                fontWeight: 700,
                cursor: "pointer",
                border: "1px solid",
                borderColor: tab === t.id ? "#1e3a2f" : "#e0d8ce",
                background: tab === t.id ? "#1e3a2f" : "#fff",
                color: tab === t.id ? "#fffbf5" : "#6b5c52"
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {loading || !data ? (
          <p style={{ color: "#8a7060", fontSize: "13px" }}>Loading analytics...</p>
        ) : (
          <>
            {data.overview.tips.length > 0 ? (
              <ul style={{ marginBottom: "16px", display: "flex", flexDirection: "column", gap: "6px" }}>
                {data.overview.tips.slice(0, 3).map((t) => (
                  <li key={t} style={{ fontSize: "13px", color: "#4a3f38" }}>
                    <span style={{ color: "#c8960a" }}>✦ </span>
                    {t}
                  </li>
                ))}
              </ul>
            ) : null}

            {tab === "products" && data.products ? (
              <>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "14px" }}>
                  {PRODUCT_SUBS.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setProductSub(s.id)}
                      style={{
                        padding: "6px 12px",
                        borderRadius: "8px",
                        fontSize: "12px",
                        fontWeight: 700,
                        cursor: "pointer",
                        border: "1px solid",
                        borderColor: productSub === s.id ? "#4a7c59" : "#e0d8ce",
                        background: productSub === s.id ? "#eef6f0" : "#fff",
                        color: "#2c2420"
                      }}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
                {productSub === "most"
                  ? MiniTable(
                      ["#", "Item", "SKU", "Units", "Revenue"],
                      productRows(data.products.mostSold),
                      "No products sold in this range."
                    )
                  : null}
                {productSub === "least"
                  ? MiniTable(
                      ["#", "Item", "SKU", "Units", "Revenue"],
                      productRows(data.products.leastSold),
                      "No products sold in this range."
                    )
                  : null}
                {productSub === "po"
                  ? MiniTable(
                      ["#", "Item", "SKU", "Units", "Revenue"],
                      productRows(data.products.purchaseOrderNeeded),
                      "No PO candidates (need ≥5 units in range)."
                    )
                  : null}
                {productSub === "drop"
                  ? MiniTable(
                      ["#", "Item", "SKU", "Units", "Revenue"],
                      productRows(data.products.dropCandidates),
                      "No drop candidates (1–2 units) in range."
                    )
                  : null}
                {productSub === "places"
                  ? MiniTable(
                      ["Place", "Orders", "Revenue"],
                      data.products.topPlaces.map((p) => [
                        `${p.city}${p.state ? `, ${p.state}` : ""}${p.country ? `, ${p.country}` : ""}`,
                        String(p.orderCount),
                        money(p.totalInr)
                      ]),
                      "No place data."
                    )
                  : null}
                {productSub === "orders"
                  ? MiniTable(
                      ["Order", "Customer", "City", "Total"],
                      data.products.highestOrders.map((o) => [
                        o.orderNumber,
                        <div key={o.orderNumber}>
                          <div style={{ fontWeight: 600 }}>{o.customerName}</div>
                          <div style={{ fontSize: "12px", color: "#8a7060" }}>{o.email}</div>
                        </div>,
                        o.city || "—",
                        money(o.totalInr)
                      ]),
                      "No orders."
                    )
                  : null}
                {productSub === "repeat"
                  ? MiniTable(
                      ["Customer", "Orders", "City", "Spend"],
                      data.products.repeatCustomers.map((c) => [
                        <div key={c.email}>
                          <div style={{ fontWeight: 600 }}>{c.name}</div>
                          <div style={{ fontSize: "12px", color: "#8a7060" }}>{c.email}</div>
                        </div>,
                        String(c.orderCount),
                        c.city || "—",
                        money(c.totalSpendInr)
                      ]),
                      "No repeat customers."
                    )
                  : null}
              </>
            ) : null}

            {tab === "orders" && data.orders ? (
              <div style={{ display: "grid", gap: "20px" }}>
                <div>
                  <h3 style={{ fontSize: "14px", fontWeight: 700, marginBottom: "10px" }}>Orders by status</h3>
                  <MiniTable(
                    ["Status", "Count"],
                    Object.entries(data.orders.byStatus)
                      .sort((a, b) => b[1] - a[1])
                      .map(([status, count]) => [status, String(count)]),
                    "No orders."
                  )}
                </div>
                <div>
                  <h3 style={{ fontSize: "14px", fontWeight: 700, marginBottom: "10px" }}>Monthly order trend</h3>
                  <BarChart rows={data.orders.orderTrend} labelKey="month" valueKey="orders" />
                </div>
                <div>
                  <h3 style={{ fontSize: "14px", fontWeight: 700, marginBottom: "10px" }}>Top places</h3>
                  <MiniTable(
                    ["Place", "Orders", "Revenue"],
                    data.orders.topPlaces.map((p) => [
                      `${p.city}${p.state ? `, ${p.state}` : ""}`,
                      String(p.orderCount),
                      money(p.totalInr)
                    ]),
                    "No place data."
                  )}
                </div>
                <div>
                  <h3 style={{ fontSize: "14px", fontWeight: 700, marginBottom: "10px" }}>Highest orders</h3>
                  <MiniTable(
                    ["Order", "Customer", "Total"],
                    data.orders.highestOrders.map((o) => [o.orderNumber, o.customerName, money(o.totalInr)]),
                    "No orders."
                  )}
                </div>
                <div>
                  <h3 style={{ fontSize: "14px", fontWeight: 700, marginBottom: "10px" }}>Repeat customers</h3>
                  <MiniTable(
                    ["Customer", "Orders", "Spend"],
                    data.orders.repeatCustomers.map((c) => [c.name, String(c.orderCount), money(c.totalSpendInr)]),
                    "No repeat customers."
                  )}
                </div>
              </div>
            ) : null}

            {tab === "returns" && data.returns ? (
              <div style={{ display: "grid", gap: "20px" }}>
                <p style={{ fontSize: "12px", color: "#8a7060" }}>{data.returns.note}</p>
                <div>
                  <h3 style={{ fontSize: "14px", fontWeight: 700, marginBottom: "10px" }}>Return trend</h3>
                  <BarChart rows={data.returns.returnTrend} labelKey="month" valueKey="units" />
                </div>
                <div>
                  <h3 style={{ fontSize: "14px", fontWeight: 700, marginBottom: "10px" }}>
                    Item return nature (top returned SKUs)
                  </h3>
                  {data.returns.returnItemTrend.length === 0 ? (
                    <p style={{ fontSize: "13px", color: "#8a7060" }}>
                      Few/no refunded line items in Woo for this range.
                    </p>
                  ) : (
                    data.returns.returnItemTrend.map((it) => (
                      <div key={`${it.sku}-${it.productName}`} style={{ marginBottom: "14px" }}>
                        <p style={{ fontSize: "13px", fontWeight: 600, marginBottom: "6px" }}>
                          {it.productName} {it.sku ? `· ${it.sku}` : ""}
                        </p>
                        <BarChart rows={it.months} labelKey="month" valueKey="units" />
                      </div>
                    ))
                  )}
                </div>
                <div>
                  <h3 style={{ fontSize: "14px", fontWeight: 700, marginBottom: "10px" }}>Items returned</h3>
                  <MiniTable(
                    ["Item", "SKU", "Units", "Value"],
                    data.returns.returnedItems
                      .slice(0, 30)
                      .map((r) => [r.productName, r.sku || "—", String(r.unitsSold), money(r.revenueInr)]),
                    "No returned items."
                  )}
                </div>
                <div>
                  <h3 style={{ fontSize: "14px", fontWeight: 700, marginBottom: "10px" }}>
                    Returns by customer
                  </h3>
                  <MiniTable(
                    ["Customer", "Email", "Units", "Lines"],
                    data.returns.returnsByCustomer.map((c) => [
                      c.customerName,
                      c.email,
                      String(c.units),
                      String(c.lines)
                    ]),
                    "No customer returns."
                  )}
                </div>
              </div>
            ) : null}

            {tab === "refunds" && data.refunds ? (
              <div style={{ display: "grid", gap: "20px" }}>
                <div>
                  <h3 style={{ fontSize: "14px", fontWeight: 700, marginBottom: "10px" }}>Refund amount trend</h3>
                  <BarChart rows={data.refunds.refundTrend} labelKey="month" valueKey="amountInr" />
                </div>
                <div>
                  <h3 style={{ fontSize: "14px", fontWeight: 700, marginBottom: "10px" }}>Refund reasons</h3>
                  <MiniTable(
                    ["Reason", "Count"],
                    data.refunds.refundReasons.map((r) => [r.reason, String(r.count)]),
                    "No refund reasons."
                  )}
                </div>
                <div>
                  <h3 style={{ fontSize: "14px", fontWeight: 700, marginBottom: "10px" }}>Refunds by customer</h3>
                  <MiniTable(
                    ["Customer", "Count", "Amount"],
                    data.refunds.refundsByCustomer.map((c) => [
                      c.customerName,
                      String(c.count),
                      money(c.amountInr)
                    ]),
                    "No refunds by customer."
                  )}
                </div>
                <div>
                  <h3 style={{ fontSize: "14px", fontWeight: 700, marginBottom: "10px" }}>Refund list</h3>
                  <MiniTable(
                    ["Date", "Order", "Customer", "Amount", "Reason"],
                    data.refunds.list.map((r) => [
                      r.date,
                      r.orderNumber,
                      r.customerName || r.email || "—",
                      money(r.amountInr),
                      r.reason
                    ]),
                    "No refunds in range."
                  )}
                </div>
              </div>
            ) : null}

            {tab === "customers" && data.customers ? (
              <div style={{ display: "grid", gap: "20px" }}>
                <p style={{ fontSize: "12px", color: "#8a7060" }}>{data.customers.note}</p>
                <p style={{ fontSize: "13px", color: "#2c2420" }}>
                  New customers in range: <strong>{data.customers.newCustomers}</strong>
                </p>
                <div>
                  <h3 style={{ fontSize: "14px", fontWeight: 700, marginBottom: "10px" }}>
                    Most visited (last active)
                  </h3>
                  <MiniTable(
                    ["Customer", "Email", "Last active", "City"],
                    data.customers.mostVisited.map((c) => [
                      c.name || "—",
                      c.email,
                      c.lastActive || "—",
                      c.city || "—"
                    ]),
                    "No login/activity signals in range."
                  )}
                </div>
                <div>
                  <h3 style={{ fontSize: "14px", fontWeight: 700, marginBottom: "10px" }}>
                    Most bought / repeating
                  </h3>
                  <MiniTable(
                    ["Customer", "Orders", "Spend", "Last order"],
                    data.customers.mostBought.map((c) => [
                      <div key={c.email}>
                        <div style={{ fontWeight: 600 }}>{c.name}</div>
                        <div style={{ fontSize: "12px", color: "#8a7060" }}>{c.email}</div>
                      </div>,
                      String(c.orderCount),
                      money(c.totalSpendInr),
                      c.lastOrderedAt
                    ]),
                    "No buyers in range."
                  )}
                </div>
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
