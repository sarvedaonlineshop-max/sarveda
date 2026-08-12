"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  fetchZohoBooksAnalytics,
  fetchZohoBooksChannels,
  fetchZohoBooksOrderDetail,
  fetchZohoBooksOrders,
  fetchZohoBooksProducts,
  type ZohoHistoricalAnalyticsData,
  type ZohoHistoricalOrderDetail,
  type ZohoHistoricalOrderRow,
  type ZohoHistoricalProductRow,
} from "@/lib/admin-api";
import { formatMinorFromPaise } from "@/lib/money";
import { useAdminUser } from "@/components/admin/AdminUserContext";

type DateRange = { from: string; to: string };

function toIsoDate(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function currentMonthRange(): DateRange {
  const now = new Date();
  return { from: toIsoDate(new Date(now.getFullYear(), now.getMonth(), 1)), to: toIsoDate(now) };
}

function lastDaysRange(days: number): DateRange {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - (days - 1));
  return { from: toIsoDate(from), to: toIsoDate(to) };
}

function formatDisplayDate(dateIso: string) {
  return new Date(`${dateIso}T00:00:00`).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatRangeLabel(range: DateRange) {
  return `${formatDisplayDate(range.from)} → ${formatDisplayDate(range.to)}`;
}

function MetricCard({ label, value, sub }: { label: string; value: string | number; sub?: React.ReactNode }) {
  return (
    <div
      className="rounded-lg border border-[#e8e2d9] bg-white px-4 py-3"
      style={{ borderBottom: "3px solid rgba(185,138,62,0.3)" }}
    >
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8a7060]">{label}</p>
      <div className="mt-1 text-xl font-bold leading-tight text-[#1c352a]">{value}</div>
      {sub ? <div className="mt-1 text-xs text-[#8a7060]">{sub}</div> : null}
    </div>
  );
}

function SectionShell({
  title,
  right,
  children,
}: {
  title: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-[#e8e2d9] bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#f0ece6] px-4 py-3">
        <h3 className="text-sm font-semibold text-[#1c352a]">{title}</h3>
        {right}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function statusBadge(status: string) {
  if (status === "PAID") return "bg-emerald-50 text-emerald-800 ring-emerald-200";
  if (status === "REFUNDED") return "bg-amber-50 text-amber-900 ring-amber-200";
  if (status === "CANCELLED") return "bg-red-50 text-red-800 ring-red-200";
  return "bg-stone-100 text-stone-700 ring-stone-200";
}

export function ZohoBooksHistoricalPanel() {
  const user = useAdminUser();
  const canSeeRevenue = user?.email?.toLowerCase() === "arjun@sarveda.com";

  const [draft, setDraft] = useState<DateRange>(currentMonthRange);
  const [applied, setApplied] = useState<DateRange>(currentMonthRange);
  const [channel, setChannel] = useState<string>("ALL");
  const [channels, setChannels] = useState<string[]>([]);
  const [analytics, setAnalytics] = useState<ZohoHistoricalAnalyticsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [productSearch, setProductSearch] = useState("");
  const [productSort, setProductSort] = useState<"top_sold" | "least_sold">("top_sold");
  const [productRows, setProductRows] = useState<ZohoHistoricalProductRow[]>([]);
  const [productTotal, setProductTotal] = useState(0);
  const [productSuggestions, setProductSuggestions] = useState<string[]>([]);
  const [productLoading, setProductLoading] = useState(false);

  const [orderSearch, setOrderSearch] = useState("");
  const [orderCity, setOrderCity] = useState("");
  const [orderState, setOrderState] = useState("");
  const [orderCountry, setOrderCountry] = useState("");
  const [orderSort, setOrderSort] = useState<"highest" | "lowest">("highest");
  const [orderRows, setOrderRows] = useState<ZohoHistoricalOrderRow[]>([]);
  const [orderTotal, setOrderTotal] = useState(0);
  const [orderOptions, setOrderOptions] = useState<{ cities: string[]; states: string[]; countries: string[] }>({
    cities: [],
    states: [],
    countries: [],
  });
  const [orderLoading, setOrderLoading] = useState(false);

  const [selectedOrder, setSelectedOrder] = useState<ZohoHistoricalOrderDetail | null>(null);
  const [orderDetailLoading, setOrderDetailLoading] = useState(false);

  const productListRef = useRef<HTMLDivElement | null>(null);
  const orderListRef = useRef<HTMLDivElement | null>(null);

  const allTimeBounds = useMemo<DateRange>(() => {
    if (analytics?.range.allTimeFrom && analytics?.range.allTimeTo) {
      return { from: analytics.range.allTimeFrom, to: analytics.range.allTimeTo };
    }
    return { from: "2024-04-01", to: toIsoDate(new Date()) };
  }, [analytics?.range.allTimeFrom, analytics?.range.allTimeTo]);

  const loadAnalytics = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [a, ch] = await Promise.all([
        fetchZohoBooksAnalytics({
          from: applied.from,
          to: applied.to,
          channel: channel === "ALL" ? undefined : channel,
        }),
        fetchZohoBooksChannels(),
      ]);
      setAnalytics(a);
      setChannels(ch.channels);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load All marketplaces analytics");
    } finally {
      setLoading(false);
    }
  }, [applied.from, applied.to, channel]);

  const loadProducts = useCallback(
    async (offset = 0, append = false) => {
      setProductLoading(true);
      try {
        const data = await fetchZohoBooksProducts({
          from: applied.from,
          to: applied.to,
          channel: channel === "ALL" ? undefined : channel,
          search: productSearch || undefined,
          sort: productSort,
          limit: 25,
          offset,
        });
        setProductTotal(data.total);
        setProductSuggestions(data.suggestions);
        setProductRows((prev) => (append ? [...prev, ...data.items] : data.items));
      } finally {
        setProductLoading(false);
      }
    },
    [applied.from, applied.to, channel, productSearch, productSort]
  );

  const loadOrders = useCallback(
    async (offset = 0, append = false) => {
      setOrderLoading(true);
      try {
        const data = await fetchZohoBooksOrders({
          from: applied.from,
          to: applied.to,
          channel: channel === "ALL" ? undefined : channel,
          search: orderSearch || undefined,
          city: orderCity || undefined,
          state: orderState || undefined,
          country: orderCountry || undefined,
          sort: orderSort,
          limit: 25,
          offset,
        });
        setOrderTotal(data.total);
        setOrderOptions(data.options);
        setOrderRows((prev) => (append ? [...prev, ...data.items] : data.items));
      } finally {
        setOrderLoading(false);
      }
    },
    [applied.from, applied.to, channel, orderSearch, orderCity, orderState, orderCountry, orderSort]
  );

  useEffect(() => {
    void loadAnalytics();
  }, [loadAnalytics]);

  useEffect(() => {
    void loadProducts(0, false);
  }, [loadProducts]);

  useEffect(() => {
    void loadOrders(0, false);
  }, [loadOrders]);

  function attachInfiniteLoader(
    el: HTMLDivElement | null,
    count: number,
    total: number,
    busy: boolean,
    loader: (offset: number, append: boolean) => Promise<void>
  ) {
    if (!el) return undefined;
    const onScroll = () => {
      if (busy || count >= total) return;
      if (el.scrollTop + el.clientHeight >= el.scrollHeight - 80) {
        void loader(count, true);
      }
    };
    el.addEventListener("scroll", onScroll);
    return () => el.removeEventListener("scroll", onScroll);
  }

  useEffect(() => attachInfiniteLoader(productListRef.current, productRows.length, productTotal, productLoading, loadProducts), [
    productRows.length,
    productTotal,
    productLoading,
    loadProducts,
  ]);

  useEffect(() => attachInfiniteLoader(orderListRef.current, orderRows.length, orderTotal, orderLoading, loadOrders), [
    orderRows.length,
    orderTotal,
    orderLoading,
    loadOrders,
  ]);

  async function openOrder(invoiceId: string) {
    setOrderDetailLoading(true);
    try {
      const detail = await fetchZohoBooksOrderDetail(invoiceId);
      setSelectedOrder(detail);
    } finally {
      setOrderDetailLoading(false);
    }
  }

  const moneyInr = (paise: number) => formatMinorFromPaise(paise, "INR");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-[#e8e2d9] bg-white p-3">
        <label className="text-xs font-semibold uppercase tracking-wider text-[#8a7060]">
          From
          <input
            type="date"
            value={draft.from}
            onChange={(e) => setDraft((d) => ({ ...d, from: e.target.value }))}
            className="mt-1 block rounded-md border border-[#e0d8ce] px-2 py-1.5 text-sm text-[#2c2420]"
          />
        </label>
        <label className="text-xs font-semibold uppercase tracking-wider text-[#8a7060]">
          To
          <input
            type="date"
            value={draft.to}
            onChange={(e) => setDraft((d) => ({ ...d, to: e.target.value }))}
            className="mt-1 block rounded-md border border-[#e0d8ce] px-2 py-1.5 text-sm text-[#2c2420]"
          />
        </label>
        <label className="text-xs font-semibold uppercase tracking-wider text-[#8a7060]">
          Channel
          <select
            value={channel}
            onChange={(e) => setChannel(e.target.value)}
            className="mt-1 block min-w-[10rem] rounded-md border border-[#e0d8ce] px-2 py-1.5 text-sm text-[#2c2420]"
          >
            <option value="ALL">All channels</option>
            {channels.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() => setApplied(draft)}
          className="rounded-md bg-[#1c352a] px-3 py-2 text-sm font-semibold text-[#faf5ec]"
        >
          Filter
        </button>
        <button
          type="button"
          onClick={() => {
            const next = currentMonthRange();
            setDraft(next);
            setApplied(next);
          }}
          className="rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 bg-[#f0f7f3] text-[#1c352a] ring-[#a8c4b0]"
        >
          This month
        </button>
        <button
          type="button"
          onClick={() => {
            const next = lastDaysRange(7);
            setDraft(next);
            setApplied(next);
          }}
          className="rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 bg-[#faf5ec] text-[#8a6200] ring-[#e0d4b0]"
        >
          Last 7 days
        </button>
        <button
          type="button"
          onClick={() => {
            setDraft(allTimeBounds);
            setApplied(allTimeBounds);
          }}
          className="rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 bg-[#f5f0e8] text-[#4a3f38] ring-[#e8e2d9]"
        >
          All time
        </button>
        <p className="w-full text-xs text-[#8a7060]">
          Showing <span className="font-medium text-[#1c352a]">{formatRangeLabel(applied)}</span>
        </p>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      ) : null}

      {loading && !analytics ? (
        <p className="py-10 text-center text-sm text-[#8a7060]">Loading all marketplaces analytics…</p>
      ) : analytics ? (
        <>
          <div className={`grid gap-3 ${canSeeRevenue ? "md:grid-cols-4" : "md:grid-cols-3"}`}>
            <MetricCard label="Orders" value={analytics.totals.orders.toLocaleString("en-IN")} />
            <MetricCard
              label="Units sold"
              value={analytics.totals.unitsSold.toLocaleString("en-IN")}
              sub={`${analytics.totals.lineItems.toLocaleString("en-IN")} line items`}
            />
            {canSeeRevenue ? (
              <MetricCard
                label="Revenue (reporting INR)"
                value={moneyInr(analytics.totals.revenueInInrPaise)}
                sub="FX-normalized"
              />
            ) : null}
            <MetricCard
              label="Top seller"
              value={analytics.topSeller?.productName ?? "—"}
              sub={
                analytics.topSeller ? (
                  <div>
                    <div>{analytics.topSeller.unitsSold} units</div>
                    {analytics.topSeller.variantName ? <div>{analytics.topSeller.variantName}</div> : null}
                    <div className="font-mono text-[10px] text-[#8a7060]">{analytics.topSeller.sku}</div>
                  </div>
                ) : undefined
              }
            />
          </div>

          <SectionShell
            title="Products"
            right={
              <div className="flex flex-wrap items-center gap-2">
                <input
                  list="all-marketplaces-product-suggestions"
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  placeholder="Search product name"
                  className="w-56 rounded-md border border-[#e0d8ce] px-3 py-1.5 text-sm text-[#2c2420]"
                />
                <datalist id="all-marketplaces-product-suggestions">
                  {productSuggestions.map((name) => (
                    <option key={name} value={name} />
                  ))}
                </datalist>
                <select
                  value={productSort}
                  onChange={(e) => setProductSort(e.target.value as "top_sold" | "least_sold")}
                  className="rounded-md border border-[#e0d8ce] px-2 py-1.5 text-sm text-[#2c2420]"
                >
                  <option value="top_sold">Top sold</option>
                  <option value="least_sold">Least sold</option>
                </select>
                <button
                  type="button"
                  onClick={() => void loadProducts(0, false)}
                  className="rounded-md bg-[#1c352a] px-3 py-1.5 text-sm font-semibold text-[#faf5ec]"
                >
                  Apply
                </button>
              </div>
            }
          >
            <div className="mb-3 text-xs text-[#8a7060]">
              Unique products and variants from all historical marketplace orders: {productTotal.toLocaleString("en-IN")}
            </div>
            <div ref={productListRef} className="max-h-[34rem] overflow-auto rounded-lg border border-[#efe9df]">
              <table className="min-w-full text-sm">
                <thead className="sticky top-0 bg-[#faf9f7] text-left text-[11px] uppercase tracking-wider text-[#8a7060]">
                  <tr>
                    <th className="px-4 py-2">Product name</th>
                    <th className="px-4 py-2">Variant name</th>
                    <th className="px-4 py-2">SKU</th>
                    <th className="px-4 py-2 text-right">Units sold</th>
                  </tr>
                </thead>
                <tbody>
                  {productRows.map((row) => (
                    <tr key={`${row.sku}-${row.productName}-${row.variantName}`} className="border-t border-[#f0ece6]">
                      <td className="px-4 py-2 text-[#1c352a]">{row.productName}</td>
                      <td className="px-4 py-2 text-[#4a3f38]">{row.variantName || "—"}</td>
                      <td className="px-4 py-2 font-mono text-xs text-[#8a7060]">{row.sku}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{row.unitsSold}</td>
                    </tr>
                  ))}
                  {productLoading ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-3 text-center text-sm text-[#8a7060]">
                        Loading…
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </SectionShell>

          <SectionShell
            title="Orders"
            right={
              <div className="flex flex-wrap items-center gap-2">
                <input
                  value={orderSearch}
                  onChange={(e) => setOrderSearch(e.target.value)}
                  placeholder="Order id, customer, city or region"
                  className="w-64 rounded-md border border-[#e0d8ce] px-3 py-1.5 text-sm text-[#2c2420]"
                />
                <select
                  value={orderCity}
                  onChange={(e) => setOrderCity(e.target.value)}
                  className="rounded-md border border-[#e0d8ce] px-2 py-1.5 text-sm text-[#2c2420]"
                >
                  <option value="">All cities</option>
                  {orderOptions.cities.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
                <select
                  value={orderState}
                  onChange={(e) => setOrderState(e.target.value)}
                  className="rounded-md border border-[#e0d8ce] px-2 py-1.5 text-sm text-[#2c2420]"
                >
                  <option value="">All regions</option>
                  {orderOptions.states.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
                <select
                  value={orderCountry}
                  onChange={(e) => setOrderCountry(e.target.value)}
                  className="rounded-md border border-[#e0d8ce] px-2 py-1.5 text-sm text-[#2c2420]"
                >
                  <option value="">All countries</option>
                  {orderOptions.countries.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
                <select
                  value={orderSort}
                  onChange={(e) => setOrderSort(e.target.value as "highest" | "lowest")}
                  className="rounded-md border border-[#e0d8ce] px-2 py-1.5 text-sm text-[#2c2420]"
                >
                  <option value="highest">Highest order</option>
                  <option value="lowest">Lowest order</option>
                </select>
                <button
                  type="button"
                  onClick={() => void loadOrders(0, false)}
                  className="rounded-md bg-[#1c352a] px-3 py-1.5 text-sm font-semibold text-[#faf5ec]"
                >
                  Apply
                </button>
              </div>
            }
          >
            <div className="mb-3 text-xs text-[#8a7060]">
              Orders in result set: {orderTotal.toLocaleString("en-IN")}
            </div>
            <div ref={orderListRef} className="max-h-[34rem] overflow-auto rounded-lg border border-[#efe9df]">
              <table className="min-w-full text-sm">
                <thead className="sticky top-0 bg-[#faf9f7] text-left text-[11px] uppercase tracking-wider text-[#8a7060]">
                  <tr>
                    <th className="px-4 py-2">Order date</th>
                    <th className="px-4 py-2">Order id</th>
                    <th className="px-4 py-2">Customer</th>
                    <th className="px-4 py-2">Region</th>
                    <th className="px-4 py-2">Items</th>
                    <th className="px-4 py-2 text-right">Amount</th>
                    <th className="px-4 py-2">Status</th>
                    <th className="px-4 py-2 text-right">View</th>
                  </tr>
                </thead>
                <tbody>
                  {orderRows.map((row) => (
                    <tr key={row.zohoInvoiceId} className="border-t border-[#f0ece6]">
                      <td className="px-4 py-2">{formatDisplayDate(row.invoiceDate)}</td>
                      <td className="px-4 py-2 font-mono text-xs text-[#1c352a]">{row.invoiceNumber}</td>
                      <td className="px-4 py-2 text-[#4a3f38]">{row.customerName || "—"}</td>
                      <td className="px-4 py-2 text-[#4a3f38]">
                        {[row.billingCity, row.billingState, row.billingCountry].filter(Boolean).join(", ") || "—"}
                      </td>
                      <td className="max-w-[18rem] truncate px-4 py-2 text-[#4a3f38]" title={row.itemsShort}>
                        {row.itemsShort}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {formatMinorFromPaise(row.totalInMinor, row.currency)}
                      </td>
                      <td className="px-4 py-2">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${statusBadge(row.orderStatus)}`}>
                          {row.orderStatus}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => void openOrder(row.zohoInvoiceId)}
                          className="rounded-md border border-[#d8cdbd] px-2.5 py-1 text-xs font-semibold text-[#1c352a]"
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  ))}
                  {orderLoading ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-3 text-center text-sm text-[#8a7060]">
                        Loading…
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </SectionShell>
        </>
      ) : null}

      {selectedOrder || orderDetailLoading ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
          <div className="max-h-[90vh] w-full max-w-4xl overflow-auto rounded-2xl bg-white shadow-2xl">
            <div className="sticky top-0 flex items-center justify-between border-b border-[#eee7dd] bg-white px-5 py-4">
              <div>
                <h3 className="text-lg font-semibold text-[#1c352a]">
                  {selectedOrder?.invoiceNumber || "Loading order…"}
                </h3>
                <p className="text-xs text-[#8a7060]">Historical marketplace order details</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedOrder(null)}
                className="rounded-md border border-[#d8cdbd] px-3 py-1.5 text-sm text-[#4a3f38]"
              >
                Close
              </button>
            </div>
            {orderDetailLoading || !selectedOrder ? (
              <div className="p-8 text-center text-sm text-[#8a7060]">Loading order details…</div>
            ) : (
              <div className="space-y-5 p-5">
                <div className="grid gap-3 md:grid-cols-4">
                  <MetricCard label="Order date" value={formatDisplayDate(selectedOrder.invoiceDate)} />
                  <MetricCard label="Status" value={selectedOrder.status} />
                  <MetricCard label="Channel" value={selectedOrder.channel} />
                  <MetricCard
                    label="Grand total"
                    value={formatMinorFromPaise(selectedOrder.totalInMinor, selectedOrder.currency)}
                  />
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <SectionShell title="Customer details">
                    <div className="space-y-1 text-sm text-[#4a3f38]">
                      <div><span className="font-medium text-[#1c352a]">Name:</span> {selectedOrder.customerName || "—"}</div>
                      <div><span className="font-medium text-[#1c352a]">Email:</span> {selectedOrder.email || "—"}</div>
                      <div><span className="font-medium text-[#1c352a]">Phone:</span> {selectedOrder.phone || "—"}</div>
                      <div><span className="font-medium text-[#1c352a]">Billing:</span> {[selectedOrder.billingAddress.city, selectedOrder.billingAddress.state, selectedOrder.billingAddress.country, selectedOrder.billingAddress.postalCode].filter(Boolean).join(", ") || "—"}</div>
                      <div><span className="font-medium text-[#1c352a]">Shipping:</span> {[selectedOrder.shippingAddress.city, selectedOrder.shippingAddress.state, selectedOrder.shippingAddress.country].filter(Boolean).join(", ") || "—"}</div>
                    </div>
                  </SectionShell>
                  <SectionShell title="Grand total split">
                    <div className="space-y-1 text-sm text-[#4a3f38]">
                      <div><span className="font-medium text-[#1c352a]">Subtotal:</span> {formatMinorFromPaise(selectedOrder.subtotalInMinor, selectedOrder.currency)}</div>
                      <div><span className="font-medium text-[#1c352a]">Shipping:</span> {formatMinorFromPaise(selectedOrder.shippingInMinor, selectedOrder.currency)}</div>
                      <div><span className="font-medium text-[#1c352a]">Tax:</span> {formatMinorFromPaise(selectedOrder.taxInMinor, selectedOrder.currency)}</div>
                      <div><span className="font-medium text-[#1c352a]">Discount:</span> {formatMinorFromPaise(selectedOrder.discountInMinor, selectedOrder.currency)}</div>
                      <div><span className="font-medium text-[#1c352a]">Balance:</span> {formatMinorFromPaise(selectedOrder.balanceInMinor, selectedOrder.currency)}</div>
                      <div><span className="font-medium text-[#1c352a]">Grand total:</span> {formatMinorFromPaise(selectedOrder.totalInMinor, selectedOrder.currency)}</div>
                    </div>
                  </SectionShell>
                </div>

                <SectionShell title="Items">
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead className="bg-[#faf9f7] text-left text-[11px] uppercase tracking-wider text-[#8a7060]">
                        <tr>
                          <th className="px-4 py-2">Item</th>
                          <th className="px-4 py-2">SKU</th>
                          <th className="px-4 py-2 text-right">Qty</th>
                          <th className="px-4 py-2 text-right">Unit</th>
                          <th className="px-4 py-2 text-right">Line total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedOrder.lines.map((line, idx) => (
                          <tr key={`${line.sku}-${idx}`} className="border-t border-[#f0ece6]">
                            <td className="px-4 py-2 text-[#4a3f38]">{line.itemName || "—"}</td>
                            <td className="px-4 py-2 font-mono text-xs text-[#8a7060]">{line.sku || "—"}</td>
                            <td className="px-4 py-2 text-right tabular-nums">{line.quantity}</td>
                            <td className="px-4 py-2 text-right tabular-nums">
                              {formatMinorFromPaise(line.unitPriceInMinor, selectedOrder.currency)}
                            </td>
                            <td className="px-4 py-2 text-right tabular-nums">
                              {formatMinorFromPaise(line.lineTotalInMinor, selectedOrder.currency)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </SectionShell>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
