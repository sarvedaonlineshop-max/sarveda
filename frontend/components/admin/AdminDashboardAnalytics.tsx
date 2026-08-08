"use client";

import { useEffect, useMemo, useState } from "react";

import type { AdminWooProductAnalytics, WooDumpProductRow } from "@/lib/admin-api";
import { fetchAdminWooAnalytics } from "@/lib/admin-api";
import { formatINRFromPaise } from "@/lib/money";
import { useAdminUser } from "@/components/admin/AdminUserContext";

const REVENUE_VISIBLE_EMAIL = "arjun@sarveda.com";

const card: React.CSSProperties = {
  background: "#fff",
  borderRadius: "12px",
  border: "1px solid #e8e2d9",
  boxShadow: "0 1px 4px rgba(44,36,32,0.06)",
  padding: "20px 24px"
};

type TabId = AdminWooProductAnalytics["tab"];
type ProductSub = "most" | "least" | "po" | "drop";
type Preset = "month" | "year" | "custom" | "all";

const TABS: Array<{ id: TabId; label: string }> = [
  { id: "products", label: "Products" },
  { id: "orders", label: "Orders" },
  { id: "places", label: "Places" },
  { id: "returns", label: "Returns" },
  { id: "refunds", label: "Refunds" },
  { id: "customers", label: "Customers" }
];

const PRODUCT_SUBS: Array<{ id: ProductSub; label: string }> = [
  { id: "most", label: "Most sold" },
  { id: "least", label: "Least sold" },
  { id: "po", label: "Raise PO" },
  { id: "drop", label: "Drop" }
];

function money(n: number) {
  return formatINRFromPaise(Math.round(n * 100));
}

function UnderlineTabs<T extends string>({
  items,
  active,
  onChange
}: {
  items: Array<{ id: T; label: string }>;
  active: T;
  onChange: (id: T) => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        gap: "22px",
        flexWrap: "wrap",
        borderBottom: "1px solid #e8e2d9",
        marginBottom: "16px"
      }}
    >
      {items.map((t) => {
        const on = active === t.id;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onChange(t.id)}
            style={{
              background: "transparent",
              border: "none",
              borderBottom: on ? "2px solid #b98a3e" : "2px solid transparent",
              marginBottom: "-1px",
              padding: "10px 2px 12px",
              fontSize: "14px",
              fontWeight: on ? 700 : 500,
              color: on ? "#1c352a" : "#8a7060",
              cursor: "pointer"
            }}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
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
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: "10px", color: "#8a7060", letterSpacing: "0.06em", textTransform: "uppercase" }}>
          Trend
        </span>
        <span style={{ fontSize: "10px", color: "#8a7060" }}>Max {max}</span>
      </div>
      {rows.map((r) => {
        const v = Number(r[valueKey]) || 0;
        const pct = Math.round((v / max) * 100);
        return (
          <div
            key={String(r[labelKey])}
            style={{ display: "grid", gridTemplateColumns: "90px 1fr 80px", gap: "10px", alignItems: "center" }}
          >
            <span style={{ fontSize: "12px", color: "#8a7060", fontFamily: "'JetBrains Mono', monospace" }}>
              {String(r[labelKey])}
            </span>
            <div style={{ height: "14px", background: "#e8e2d9", borderRadius: "999px", overflow: "hidden" }}>
              <div
                style={{
                  width: `${pct}%`,
                  height: "100%",
                  background: "linear-gradient(90deg, #1c352a, #48705a)",
                  borderRadius: "0 4px 4px 0",
                  position: "relative"
                }}
              >
                {pct > 30 ? (
                  <span
                    style={{
                      position: "absolute",
                      right: "8px",
                      top: "50%",
                      transform: "translateY(-50%)",
                      fontSize: "10px",
                      color: "white",
                      fontWeight: 700
                    }}
                  >
                    {v}
                  </span>
                ) : null}
              </div>
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

function renderMiniTable(headers: string[], rows: React.ReactNode[][], empty: string) {
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
              <tr
                key={i}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "#faf5ec";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                }}
              >
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

function monthBounds(maxDate: string): { from: string; to: string } {
  return { from: `${maxDate.slice(0, 7)}-01`, to: maxDate };
}

export function AdminDashboardAnalytics() {
  const adminUser = useAdminUser();
  const canSeeRevenue =
    (adminUser?.email ?? "").trim().toLowerCase() === REVENUE_VISIBLE_EMAIL;
  const [data, setData] = useState<AdminWooProductAnalytics | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabId>("products");
  const [productSub, setProductSub] = useState<ProductSub>("most");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [preset, setPreset] = useState<Preset>("month");
  const [rangeReady, setRangeReady] = useState(false);

  const available = data?.meta.availableRange;

  // Bootstrap default: this month of dump max date
  useEffect(() => {
    fetchAdminWooAnalytics({ tab: "products" })
      .then((d) => {
        const max = d.meta.availableRange.maxDate;
        if (max) {
          const b = monthBounds(max);
          setFrom(b.from);
          setTo(b.to);
          setPreset("month");
        }
        setRangeReady(true);
      })
      .catch((e) => {
        setErr(e instanceof Error ? e.message : "Failed to load analytics");
        setRangeReady(true);
      });
  }, []);

  useEffect(() => {
    if (!rangeReady) return;
    setLoading(true);
    setErr(null);
    fetchAdminWooAnalytics({
      from: from || undefined,
      to: to || undefined,
      tab
    })
      .then(setData)
      .catch((e) => setErr(e instanceof Error ? e.message : "Failed to load analytics"))
      .finally(() => setLoading(false));
  }, [from, to, tab, rangeReady]);

  function applyPreset(next: Preset) {
    setPreset(next);
    if (!available?.minDate || !available?.maxDate) return;
    const max = available.maxDate;
    if (next === "all") {
      setFrom("");
      setTo("");
      return;
    }
    if (next === "month") {
      const b = monthBounds(max);
      setFrom(b.from);
      setTo(b.to);
      return;
    }
    if (next === "year") {
      setFrom(`${max.slice(0, 4)}-01-01`);
      setTo(max);
    }
  }

  const rangeLabel = useMemo(() => {
    if (!data) return "";
    const a = data.meta.appliedRange;
    return `${a.from} to ${a.to}`;
  }, [data]);

  if (err) return <p style={{ color: "#dc2626" }}>{err}</p>;

  const kpis = data?.overview.kpis;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
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
                { id: "month" as const, label: "This month" },
                { id: "year" as const, label: "This year" },
                { id: "custom" as const, label: "Custom" },
                { id: "all" as const, label: "All time" }
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
                  background: preset === p.id ? "#1c352a" : "#fff",
                  color: preset === p.id ? "#fffbf5" : "#6b5c52",
                  boxShadow: preset === p.id ? "0 2px 8px rgba(28,53,42,0.20)" : "none"
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
                value={from || available?.minDate || ""}
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
                value={to || available?.maxDate || ""}
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
            ...(canSeeRevenue
              ? [{ label: "Revenue", value: money(kpis.revenueInr) }]
              : []),
            { label: "AOV", value: money(kpis.aovInr) },
            { label: "Units", value: String(kpis.units) },
            { label: "Refunds", value: `${kpis.refundCount}` },
            { label: "Repeat buyers", value: String(kpis.repeatCustomerCount) }
          ].map((c) => (
            <div
              key={c.label}
              style={
                c.label === "Revenue"
                  ? {
                      ...card,
                      padding: "14px 16px",
                      background: "linear-gradient(135deg, #1c352a, #2d5040)",
                      borderLeft: "none"
                    }
                  : { ...card, padding: "14px 16px", borderLeft: "3px solid #1c352a" }
              }
            >
              <p
                style={{
                  fontSize: "11px",
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: c.label === "Revenue" ? "#fffbf5" : "#8a7060",
                  marginBottom: "6px"
                }}
              >
                {c.label}
              </p>
              <p
                style={{
                  fontSize: "1.25rem",
                  fontWeight: 800,
                  color: c.label === "Revenue" ? "#e9d6ae" : "#2c2420"
                }}
              >
                {c.value}
              </p>
            </div>
          ))}
        </div>
      ) : null}

      <div style={card}>
        <UnderlineTabs items={TABS} active={tab} onChange={setTab} />

        {loading || !data ? (
          <p style={{ color: "#8a7060", fontSize: "13px" }}>Loading analytics...</p>
        ) : (
          <>
            {data.overview.tips.length > 0 ? (
              <div
                style={{
                  background: "linear-gradient(135deg, #faf5ec, #f0ebe0)",
                  border: "1px solid #e8e2d9",
                  borderRadius: "10px",
                  padding: "12px 14px",
                  marginBottom: "16px"
                }}
              >
                <ul style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  {data.overview.tips.slice(0, 3).map((t) => (
                    <li key={t} style={{ fontSize: "13px", color: "#4a3f38" }}>
                      <span style={{ color: "#b98a3e" }}>✦ </span>
                      {t}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {tab === "products" && data.products ? (
              <>
                <UnderlineTabs items={PRODUCT_SUBS} active={productSub} onChange={setProductSub} />
                {productSub === "most"
                  ? renderMiniTable(
                      ["#", "Item", "SKU", "Units", "Revenue"],
                      productRows(data.products.mostSold),
                      "No products sold in this range."
                    )
                  : null}
                {productSub === "least"
                  ? renderMiniTable(
                      ["#", "Item", "SKU", "Units", "Revenue"],
                      productRows(data.products.leastSold),
                      "No products sold in this range."
                    )
                  : null}
                {productSub === "po"
                  ? renderMiniTable(
                      ["#", "Item", "SKU", "Units", "Revenue"],
                      productRows(data.products.purchaseOrderNeeded),
                      "No PO candidates (need ≥5 units in range)."
                    )
                  : null}
                {productSub === "drop"
                  ? renderMiniTable(
                      ["#", "Item", "SKU", "Units", "Revenue"],
                      productRows(data.products.dropCandidates),
                      "No drop candidates (1–2 units) in range."
                    )
                  : null}
              </>
            ) : null}

            {tab === "orders" && data.orders ? (
              <div style={{ display: "grid", gap: "20px" }}>
                <div>
                  <h3 style={{ fontSize: "14px", fontWeight: 700, marginBottom: "10px" }}>Orders by status</h3>
                  {renderMiniTable(
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
                  <h3 style={{ fontSize: "14px", fontWeight: 700, marginBottom: "10px" }}>Top orders</h3>
                  {renderMiniTable(
                    ["Order", "Customer", "City", "Total"],
                    data.orders.highestOrders.map((o) => [
                      o.orderNumber,
                      <div key={o.orderNumber}>
                        <div style={{ fontWeight: 600 }}>{o.customerName}</div>
                        <div style={{ fontSize: "12px", color: "#8a7060" }}>{o.email}</div>
                      </div>,
                      o.city || "—",
                      money(o.totalInr)
                    ]),
                    "No orders."
                  )}
                </div>
              </div>
            ) : null}

            {tab === "places" && data.places ? (
              renderMiniTable(
                ["Place", "Orders", "Revenue"],
                data.places.topPlaces.map((p) => [
                  `${p.city}${p.state ? `, ${p.state}` : ""}${p.country ? `, ${p.country}` : ""}`,
                  String(p.orderCount),
                  money(p.totalInr)
                ]),
                "No place data."
              )
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
                    Item return nature
                  </h3>
                  {data.returns.returnItemTrend.length === 0 ? (
                    <p style={{ fontSize: "13px", color: "#8a7060" }}>Few/no refunded line items in this range.</p>
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
                  {renderMiniTable(
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
                  {renderMiniTable(
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
                  {renderMiniTable(
                    ["Reason", "Count"],
                    data.refunds.refundReasons.map((r) => [r.reason, String(r.count)]),
                    "No refund reasons."
                  )}
                </div>
                <div>
                  <h3 style={{ fontSize: "14px", fontWeight: 700, marginBottom: "10px" }}>Refunds by customer</h3>
                  {renderMiniTable(
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
                  {renderMiniTable(
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
                  {renderMiniTable(
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
                    Top / repeating customers
                  </h3>
                  {renderMiniTable(
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
