"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  fetchZohoBooksDateBounds,
  fetchZohoBooksOrderDetail,
  fetchZohoBooksOrders,
  fetchZohoBooksProductChannelBreakdown,
  fetchZohoBooksProducts,
  type ZohoHistoricalOrderDetail,
  type ZohoHistoricalOrderRow,
  type ZohoHistoricalProductRow,
  type ZohoProductChannelBreakdownData,
} from "@/lib/admin-api";
import { formatMinorFromPaise } from "@/lib/money";

type DateRange = { from: string; to: string };
type DatePreset = "today" | "week" | "month" | "year" | "all" | "custom";

function toIsoDate(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function todayRange(): DateRange {
  const t = toIsoDate(new Date());
  return { from: t, to: t };
}

function thisWeekRange(): DateRange {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? 6 : day - 1;
  const from = new Date(now);
  from.setDate(now.getDate() - diff);
  return { from: toIsoDate(from), to: toIsoDate(now) };
}

function currentMonthRange(): DateRange {
  const now = new Date();
  return { from: toIsoDate(new Date(now.getFullYear(), now.getMonth(), 1)), to: toIsoDate(now) };
}

function thisYearRange(): DateRange {
  const now = new Date();
  return { from: toIsoDate(new Date(now.getFullYear(), 0, 1)), to: toIsoDate(now) };
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

const PRESET_LABELS: Record<Exclude<DatePreset, "custom">, string> = {
  today: "Today",
  week: "This Week",
  month: "This Month",
  year: "This Year",
  all: "All Time",
};

const PRESET_PILL =
  "rounded-md border px-4 py-2 text-[14px] font-medium leading-tight transition-colors";
const PRESET_ACTIVE = "border-[#1c352a] bg-[#1c352a] text-[#faf5ec]";
const PRESET_INACTIVE = "border-[#d8cdbd] bg-white text-[#1c352a] hover:bg-[#faf9f7]";

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

function ChannelBarChart({ channels }: { channels: Array<{ channel: string; unitsSold: number }> }) {
  const max = Math.max(...channels.map((c) => c.unitsSold), 1);
  return (
    <div className="space-y-4">
      {channels.map((c) => (
        <div key={c.channel}>
          <div className="mb-1 flex justify-between text-sm text-[#4a3f38]">
            <span className="font-medium text-[#1c352a]">{c.channel}</span>
            <span className="tabular-nums">{c.unitsSold.toLocaleString("en-IN")} units</span>
          </div>
          <div className="h-7 overflow-hidden rounded-md bg-[#f0ece6]">
            <div
              className="h-full rounded-md bg-[#1c352a] transition-all"
              style={{ width: `${Math.max((c.unitsSold / max) * 100, c.unitsSold > 0 ? 2 : 0)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ZohoBooksHistoricalPanel() {
  const [datePreset, setDatePreset] = useState<DatePreset>("month");
  const [draft, setDraft] = useState<DateRange>(currentMonthRange);
  const [applied, setApplied] = useState<DateRange>(currentMonthRange);
  const [allTimeBounds, setAllTimeBounds] = useState<DateRange>({ from: "2024-04-01", to: toIsoDate(new Date()) });
  const [error, setError] = useState<string | null>(null);

  const [productSearchInput, setProductSearchInput] = useState("");
  const [productSearchApplied, setProductSearchApplied] = useState("");
  const [productSort, setProductSort] = useState<"top_sold" | "least_sold">("top_sold");
  const [productRows, setProductRows] = useState<ZohoHistoricalProductRow[]>([]);
  const [productTotal, setProductTotal] = useState(0);
  const [productSuggestions, setProductSuggestions] = useState<string[]>([]);
  const [productLoading, setProductLoading] = useState(false);
  const [productSuggestionsOpen, setProductSuggestionsOpen] = useState(false);

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

  const [channelBreakdown, setChannelBreakdown] = useState<ZohoProductChannelBreakdownData | null>(null);
  const [channelBreakdownLoading, setChannelBreakdownLoading] = useState(false);

  const productListRef = useRef<HTMLDivElement | null>(null);
  const orderListRef = useRef<HTMLDivElement | null>(null);
  const productSearchRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    fetchZohoBooksDateBounds()
      .then((bounds) => setAllTimeBounds(bounds))
      .catch(() => {
        /* keep fallback bounds */
      });
  }, []);

  useEffect(() => {
    if (datePreset === "all") {
      setDraft(allTimeBounds);
      setApplied(allTimeBounds);
    }
  }, [allTimeBounds, datePreset]);

  function applyPreset(preset: Exclude<DatePreset, "custom">) {
    let next: DateRange;
    switch (preset) {
      case "today":
        next = todayRange();
        break;
      case "week":
        next = thisWeekRange();
        break;
      case "month":
        next = currentMonthRange();
        break;
      case "year":
        next = thisYearRange();
        break;
      case "all":
        next = allTimeBounds;
        break;
    }
    setDatePreset(preset);
    setDraft(next);
    setApplied(next);
  }

  function applyCustomRange() {
    setDatePreset("custom");
    setApplied(draft);
  }

  const loadProducts = useCallback(
    async (offset = 0, append = false) => {
      setProductLoading(true);
      try {
        const data = await fetchZohoBooksProducts({
          from: applied.from,
          to: applied.to,
          search: productSearchApplied || undefined,
          sort: productSort,
          limit: 25,
          offset,
        });
        setProductTotal(data.total);
        setProductSuggestions(data.suggestions);
        setProductRows((prev) => (append ? [...prev, ...data.items] : data.items));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load products");
      } finally {
        setProductLoading(false);
      }
    },
    [applied.from, applied.to, productSearchApplied, productSort]
  );

  const loadOrders = useCallback(
    async (offset = 0, append = false) => {
      setOrderLoading(true);
      try {
        const data = await fetchZohoBooksOrders({
          from: applied.from,
          to: applied.to,
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
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load orders");
      } finally {
        setOrderLoading(false);
      }
    },
    [applied.from, applied.to, orderSearch, orderCity, orderState, orderCountry, orderSort]
  );

  useEffect(() => {
    void loadProducts(0, false);
  }, [loadProducts]);

  useEffect(() => {
    void loadOrders(0, false);
  }, [loadOrders]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setProductSearchApplied(productSearchInput.trim());
    }, 300);
    return () => window.clearTimeout(timer);
  }, [productSearchInput]);

  useEffect(() => {
    const term = productSearchInput.trim();
    if (!term) {
      setProductSuggestionsOpen(false);
      return;
    }
    setProductSuggestionsOpen(true);
  }, [productSearchInput, productSuggestions.length]);

  useEffect(() => {
    const onDocClick = (event: MouseEvent) => {
      if (!productSearchRef.current?.contains(event.target as Node)) {
        setProductSuggestionsOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

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

  useEffect(
    () => attachInfiniteLoader(productListRef.current, productRows.length, productTotal, productLoading, loadProducts),
    [productRows.length, productTotal, productLoading, loadProducts]
  );

  useEffect(
    () => attachInfiniteLoader(orderListRef.current, orderRows.length, orderTotal, orderLoading, loadOrders),
    [orderRows.length, orderTotal, orderLoading, loadOrders]
  );

  async function openOrder(invoiceId: string) {
    setOrderDetailLoading(true);
    try {
      const detail = await fetchZohoBooksOrderDetail(invoiceId);
      setSelectedOrder(detail);
    } finally {
      setOrderDetailLoading(false);
    }
  }

  async function openChannelBreakdown(row: ZohoHistoricalProductRow) {
    setChannelBreakdownLoading(true);
    setChannelBreakdown(null);
    try {
      const data = await fetchZohoBooksProductChannelBreakdown({
        from: applied.from,
        to: applied.to,
        sku: row.sku,
        productName: row.productName,
      });
      setChannelBreakdown(data);
    } finally {
      setChannelBreakdownLoading(false);
    }
  }

  function clearProductSearch() {
    setProductSearchInput("");
    setProductSearchApplied("");
    setProductSuggestionsOpen(false);
  }

  function selectProductSuggestion(name: string) {
    setProductSearchInput(name);
    setProductSearchApplied(name);
    setProductSuggestionsOpen(false);
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-[#e8e2d9] bg-white p-4">
        <div className="flex flex-wrap gap-2">
          {(Object.keys(PRESET_LABELS) as Array<Exclude<DatePreset, "custom">>).map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => applyPreset(preset)}
              className={`${PRESET_PILL} ${datePreset === preset ? PRESET_ACTIVE : PRESET_INACTIVE}`}
            >
              {PRESET_LABELS[preset]}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setDatePreset("custom")}
            className={`${PRESET_PILL} ${datePreset === "custom" ? PRESET_ACTIVE : PRESET_INACTIVE}`}
          >
            Custom
          </button>
        </div>

        {datePreset === "custom" ? (
          <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-[#f0ece6] pt-4">
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
            <button
              type="button"
              onClick={applyCustomRange}
              className={`${PRESET_PILL} ${PRESET_ACTIVE}`}
            >
              Apply
            </button>
          </div>
        ) : null}

        <p className="mt-3 text-sm text-[#8a7060]">
          Showing <span className="font-medium text-[#1c352a]">{formatRangeLabel(applied)}</span>
        </p>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
      ) : null}

      <SectionShell
        title="Products"
        right={
          <div className="ml-6 flex flex-1 justify-end gap-3">
            <div ref={productSearchRef} className="relative w-full max-w-[34rem]">
              <input
                value={productSearchInput}
                onChange={(e) => setProductSearchInput(e.target.value)}
                onFocus={() => {
                  if (productSearchInput.trim().length > 0 && productSuggestions.length > 0) {
                    setProductSuggestionsOpen(true);
                  }
                }}
                placeholder="Search product name"
                autoComplete="off"
                className="min-h-[42px] w-full rounded-full border border-[#e3d9c8] bg-white px-4 pr-10 text-sm text-[#2c2420] placeholder:text-[#9b8d81] focus:border-[#1c352a] focus:outline-none focus:ring-2 focus:ring-[#1c352a]/15"
              />
              {productSearchInput ? (
                <button
                  type="button"
                  onClick={clearProductSearch}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-lg leading-none text-[#8a7060] hover:text-[#1c352a]"
                  aria-label="Clear search input"
                >
                  ×
                </button>
              ) : null}
              {productSuggestionsOpen && productSearchInput.trim().length > 0 ? (
                <ul className="absolute left-0 right-0 top-[calc(100%+6px)] z-30 max-h-80 overflow-y-auto rounded-xl border border-[#e3d9c8] bg-white py-1 shadow-xl">
                  {productSuggestions.length > 0 ? (
                    productSuggestions.map((name) => (
                      <li key={name}>
                        <button
                          type="button"
                          onClick={() => selectProductSuggestion(name)}
                          className="w-full px-4 py-2.5 text-left text-sm text-[#2c2420] transition-colors hover:bg-[#faf5ec]"
                        >
                          {name}
                        </button>
                      </li>
                    ))
                  ) : (
                    <li className="px-4 py-3 text-sm text-[#8a7060]">No matching product suggestions</li>
                  )}
                </ul>
              ) : null}
            </div>
            <select
              value={productSort}
              onChange={(e) => setProductSort(e.target.value as "top_sold" | "least_sold")}
              className="min-h-[42px] rounded-md border border-[#e0d8ce] px-3 py-1.5 text-sm text-[#2c2420]"
            >
              <option value="top_sold">Top sold</option>
              <option value="least_sold">Least sold</option>
            </select>
          </div>
        }
      >
        {productSearchApplied ? (
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-md border border-[#d8cdbd] bg-[#faf5ec] px-3 py-1.5 text-sm text-[#1c352a]">
              <span className="text-[#8a7060]">Search:</span>
              <span className="font-medium">{productSearchApplied}</span>
              <button
                type="button"
                onClick={clearProductSearch}
                className="ml-1 text-base leading-none text-[#8a7060] hover:text-[#1c352a]"
                aria-label="Remove search filter"
              >
                ×
              </button>
            </span>
            <span className="text-sm text-[#8a7060]">
              {productLoading && productRows.length === 0
                ? "Searching…"
                : `${productTotal.toLocaleString("en-IN")} result${productTotal === 1 ? "" : "s"}`}
            </span>
          </div>
        ) : (
          <div className="mb-3 text-sm text-[#8a7060]">
            {productTotal.toLocaleString("en-IN")} products in selected period
          </div>
        )}

        <div ref={productListRef} className="max-h-[34rem] overflow-auto rounded-lg border border-[#efe9df]">
          <table className="min-w-full text-sm">
            <thead className="sticky top-0 bg-[#faf9f7] text-left text-[11px] uppercase tracking-wider text-[#8a7060]">
              <tr>
                <th className="px-4 py-2">Product name</th>
                <th className="px-4 py-2">SKU</th>
                <th className="px-4 py-2 text-right">Units sold</th>
                <th className="px-4 py-2 text-right">Marketplaces</th>
              </tr>
            </thead>
            <tbody>
              {productRows.map((row) => (
                <tr key={`${row.sku}-${row.productName}`} className="border-t border-[#f0ece6]">
                  <td className="px-4 py-2 text-[#1c352a]">{row.productName}</td>
                  <td className="px-4 py-2 font-mono text-xs text-[#8a7060]">{row.sku}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{row.unitsSold.toLocaleString("en-IN")}</td>
                  <td className="px-4 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => void openChannelBreakdown(row)}
                      className="rounded-md border border-[#d8cdbd] px-2.5 py-1 text-xs font-semibold text-[#1c352a] hover:bg-[#faf9f7]"
                    >
                      View chart
                    </button>
                  </td>
                </tr>
              ))}
              {productLoading ? (
                <tr>
                  <td colSpan={4} className="px-4 py-3 text-center text-sm text-[#8a7060]">
                    Loading…
                  </td>
                </tr>
              ) : null}
              {!productLoading && productRows.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-sm text-[#8a7060]">
                    No products match your search.
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
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${statusBadge(row.orderStatus)}`}
                    >
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

      {channelBreakdown || channelBreakdownLoading ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-auto rounded-2xl bg-white shadow-2xl">
            <div className="sticky top-0 flex items-center justify-between border-b border-[#eee7dd] bg-white px-5 py-4">
              <div>
                <h3 className="text-lg font-semibold text-[#1c352a]">
                  {channelBreakdown?.productName || "Loading…"}
                </h3>
                <p className="text-xs text-[#8a7060]">
                  Units sold by marketplace · {formatRangeLabel(applied)}
                  {channelBreakdown ? ` · SKU ${channelBreakdown.sku}` : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setChannelBreakdown(null)}
                className="rounded-md border border-[#d8cdbd] px-3 py-1.5 text-sm text-[#4a3f38]"
              >
                Close
              </button>
            </div>
            <div className="p-5">
              {channelBreakdownLoading || !channelBreakdown ? (
                <p className="py-8 text-center text-sm text-[#8a7060]">Loading marketplace breakdown…</p>
              ) : channelBreakdown.channels.length === 0 ? (
                <p className="py-8 text-center text-sm text-[#8a7060]">No sales in this period.</p>
              ) : (
                <>
                  <p className="mb-4 text-sm text-[#8a7060]">
                    Total:{" "}
                    <span className="font-semibold text-[#1c352a]">
                      {channelBreakdown.totalUnits.toLocaleString("en-IN")} units
                    </span>{" "}
                    across {channelBreakdown.channels.length} marketplace
                    {channelBreakdown.channels.length === 1 ? "" : "s"}
                  </p>
                  <ChannelBarChart channels={channelBreakdown.channels} />
                </>
              )}
            </div>
          </div>
        </div>
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
                  <div className="rounded-lg border border-[#e8e2d9] bg-white px-4 py-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8a7060]">Order date</p>
                    <div className="mt-1 text-xl font-bold text-[#1c352a]">{formatDisplayDate(selectedOrder.invoiceDate)}</div>
                  </div>
                  <div className="rounded-lg border border-[#e8e2d9] bg-white px-4 py-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8a7060]">Status</p>
                    <div className="mt-1 text-xl font-bold text-[#1c352a]">{selectedOrder.status}</div>
                  </div>
                  <div className="rounded-lg border border-[#e8e2d9] bg-white px-4 py-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8a7060]">Channel</p>
                    <div className="mt-1 text-xl font-bold text-[#1c352a]">{selectedOrder.channel}</div>
                  </div>
                  <div className="rounded-lg border border-[#e8e2d9] bg-white px-4 py-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8a7060]">Grand total</p>
                    <div className="mt-1 text-xl font-bold text-[#1c352a]">
                      {formatMinorFromPaise(selectedOrder.totalInMinor, selectedOrder.currency)}
                    </div>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <SectionShell title="Customer details">
                    <div className="space-y-1 text-sm text-[#4a3f38]">
                      <div>
                        <span className="font-medium text-[#1c352a]">Name:</span> {selectedOrder.customerName || "—"}
                      </div>
                      <div>
                        <span className="font-medium text-[#1c352a]">Email:</span> {selectedOrder.email || "—"}
                      </div>
                      <div>
                        <span className="font-medium text-[#1c352a]">Phone:</span> {selectedOrder.phone || "—"}
                      </div>
                      <div>
                        <span className="font-medium text-[#1c352a]">Billing:</span>{" "}
                        {[selectedOrder.billingAddress.city, selectedOrder.billingAddress.state, selectedOrder.billingAddress.country, selectedOrder.billingAddress.postalCode]
                          .filter(Boolean)
                          .join(", ") || "—"}
                      </div>
                      <div>
                        <span className="font-medium text-[#1c352a]">Shipping:</span>{" "}
                        {[selectedOrder.shippingAddress.city, selectedOrder.shippingAddress.state, selectedOrder.shippingAddress.country]
                          .filter(Boolean)
                          .join(", ") || "—"}
                      </div>
                    </div>
                  </SectionShell>
                  <SectionShell title="Grand total split">
                    <div className="space-y-1 text-sm text-[#4a3f38]">
                      <div>
                        <span className="font-medium text-[#1c352a]">Subtotal:</span>{" "}
                        {formatMinorFromPaise(selectedOrder.subtotalInMinor, selectedOrder.currency)}
                      </div>
                      <div>
                        <span className="font-medium text-[#1c352a]">Shipping:</span>{" "}
                        {formatMinorFromPaise(selectedOrder.shippingInMinor, selectedOrder.currency)}
                      </div>
                      <div>
                        <span className="font-medium text-[#1c352a]">Tax:</span>{" "}
                        {formatMinorFromPaise(selectedOrder.taxInMinor, selectedOrder.currency)}
                      </div>
                      <div>
                        <span className="font-medium text-[#1c352a]">Discount:</span>{" "}
                        {formatMinorFromPaise(selectedOrder.discountInMinor, selectedOrder.currency)}
                      </div>
                      <div>
                        <span className="font-medium text-[#1c352a]">Balance:</span>{" "}
                        {formatMinorFromPaise(selectedOrder.balanceInMinor, selectedOrder.currency)}
                      </div>
                      <div>
                        <span className="font-medium text-[#1c352a]">Grand total:</span>{" "}
                        {formatMinorFromPaise(selectedOrder.totalInMinor, selectedOrder.currency)}
                      </div>
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
