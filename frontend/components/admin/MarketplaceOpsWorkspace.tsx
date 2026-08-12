"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

import type {
  AmazonSpConnectionStatus,
  AmazonSyncAllResult,
  EtsyConnectionStatus,
  FlipkartConnectionStatus,
  MarketplaceChannelCode,
  MarketplaceListingRow,
  MarketplaceOrderRow,
  MarketplaceOverviewData,
  MarketplaceReturnRow
} from "@/lib/admin-api";
import {
  fetchAmazonSpConnection,
  fetchEtsyConnection,
  fetchFlipkartConnection,
  fetchMarketplaceListings,
  fetchMarketplaceOrders,
  fetchMarketplaceOverview,
  fetchMarketplaceReturns,
  syncAmazonMarketplaceAll,
  syncEtsyMarketplaceAll,
  syncFlipkartMarketplaceAll
} from "@/lib/admin-api";
import { formatMinorFromPaise } from "@/lib/money";
import { ZohoBooksHistoricalPanel } from "@/components/admin/ZohoBooksHistoricalPanel";

type ViewTab = "overview" | "zoho_books" | MarketplaceChannelCode;
type ChannelSubTab = "overview" | "listings" | "orders" | "returns";
type DateRange = { from: string; to: string };
type ListingSort =
  | "sold_desc"
  | "sold_asc"
  | "returns_desc"
  | "returns_asc"
  | "stock_desc"
  | "stock_asc";

const CHART_COLORS = [
  "#1c352a",
  "#b98a3e",
  "#2d5040",
  "#c8960a",
  "#4a7c59",
  "#8a6200",
  "#7da58a",
  "#e0b86a"
];

const CHANNELS: Array<{ code: MarketplaceChannelCode; label: string }> = [
  { code: "AMAZON", label: "Amazon" },
  { code: "FLIPKART", label: "Flipkart" },
  { code: "ETSY", label: "Etsy" },
  { code: "AMALA", label: "Amala" },
  { code: "FIRSTCRY", label: "FirstCry" },
  { code: "TATA_1MG", label: "Tata 1mg" },
  { code: "SARVEDA", label: "Sarveda" }
];

const SUB_TABS: Array<{ id: ChannelSubTab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "listings", label: "Listings" },
  { id: "orders", label: "Orders" },
  { id: "returns", label: "Returns" }
];

function tone(label: string) {
  if (label.includes("DELIVER") || label === "ACTIVE" || label === "ok" || label === "CONNECTED" || label === "AUTO SYNC") {
    return "emerald";
  }
  if (label.includes("RETURN") || label.includes("REFUND") || label === "watch" || label === "NOT CONFIGURED") {
    return "amber";
  }
  if (label.includes("CANCEL") || label === "DELISTED" || label === "out" || label === "high") return "red";
  return "stone";
}

function badgeClass(name: string) {
  const t = tone(name);
  if (t === "emerald") return "bg-emerald-50 text-emerald-800 ring-emerald-200";
  if (t === "amber") return "bg-amber-50 text-amber-900 ring-amber-200";
  if (t === "red") return "bg-red-50 text-red-800 ring-red-200";
  return "bg-[#f5f0e8] text-[#4a3f38] ring-[#e0d8ce]";
}

function StatusPill({ label }: { label: string }) {
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${badgeClass(label)}`}>
      {label.replace(/_/g, " ")}
    </span>
  );
}

function SectionCard({
  title,
  right,
  children,
  compact = false
}: {
  title: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-[#e8e2d9] bg-white shadow-sm">
      <div
        className="flex flex-wrap items-center justify-between gap-3 border-b border-[#f0ece6] px-4 py-3"
        style={{ background: "linear-gradient(180deg, #f9f7f4, #fff)" }}
      >
        <h3
          className="text-sm font-bold text-[#1c352a]"
          style={{ borderLeft: "3px solid #b98a3e", paddingLeft: "8px" }}
        >
          {title}
        </h3>
        {right}
      </div>
      <div className={compact ? "p-3" : "p-4"}>{children}</div>
    </section>
  );
}

function MetricCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div
      className="rounded-lg border border-[#e8e2d9] bg-white px-4 py-3"
      style={{ borderBottom: "3px solid rgba(185,138,62,0.3)" }}
    >
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8a7060]">{label}</p>
      <p className="mt-1 text-xl font-bold text-[#1c352a]">{value}</p>
      {sub ? <p className="mt-1 text-xs text-[#8a7060]">{sub}</p> : null}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return <p className="py-8 text-center text-sm text-[#8a7060]">{message}</p>;
}

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

function boundsFromIsoDates(dates: string[]): DateRange {
  const days = dates.map((d) => d.slice(0, 10)).filter(Boolean).sort();
  if (days.length === 0) return currentMonthRange();
  return { from: days[0], to: days[days.length - 1] };
}

function inDateRange(dateIso: string | null | undefined, range: DateRange) {
  if (!dateIso) return false;
  const day = dateIso.slice(0, 10);
  return day >= range.from && day <= range.to;
}

function formatDisplayDate(dateIso: string) {
  return new Date(dateIso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric"
  });
}

function formatRangeLabel(range: DateRange) {
  return `${formatDisplayDate(range.from)} → ${formatDisplayDate(range.to)}`;
}

function returnEventDate(row: MarketplaceReturnRow) {
  return row.returnDate || row.receivedAt || row.createdAt;
}

function truncateLabel(value: string, max = 34) {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function copyText(value: string) {
  void navigator.clipboard.writeText(value);
}

function DateRangeFilter({
  draft,
  applied,
  allTimeBounds,
  onDraftChange,
  onApply,
  onQuick
}: {
  draft: DateRange;
  applied: DateRange;
  allTimeBounds: DateRange;
  onDraftChange: (next: DateRange) => void;
  onApply: () => void;
  onQuick: (next: DateRange) => void;
}) {
  return (
    <div
      className="flex flex-wrap items-end justify-between gap-3 rounded-xl border border-[#e8e2d9] bg-white px-4 py-3"
      style={{ boxShadow: "0 4px 16px rgba(28,53,42,0.06)" }}
    >
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8a7060]">From</label>
          <input
            type="date"
            value={draft.from}
            onChange={(e) => onDraftChange({ ...draft, from: e.target.value })}
            className="rounded-lg border border-[#e0d8ce] px-3 py-2 text-sm text-[#2c2420]"
          />
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8a7060]">To</label>
          <input
            type="date"
            value={draft.to}
            onChange={(e) => onDraftChange({ ...draft, to: e.target.value })}
            className="rounded-lg border border-[#e0d8ce] px-3 py-2 text-sm text-[#2c2420]"
          />
        </div>
        <button
          type="button"
          onClick={onApply}
          className="rounded-lg px-4 py-2 text-xs font-semibold text-white"
          style={{ background: "linear-gradient(135deg, #1c352a, #2d5040)", boxShadow: "0 2px 6px rgba(28,53,42,0.2)" }}
        >
          Filter
        </button>
        <div className="flex flex-wrap gap-1.5 pb-0.5">
          <button
            type="button"
            onClick={() => onQuick(currentMonthRange())}
            className="rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 bg-[#f0f7f3] text-[#1c352a] ring-[#a8c4b0]"
          >
            This month
          </button>
          <button
            type="button"
            onClick={() => onQuick(lastDaysRange(7))}
            className="rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 bg-[#faf5ec] text-[#8a6200] ring-[#e0d4b0]"
          >
            Last 7 days
          </button>
          <button
            type="button"
            onClick={() => onQuick(allTimeBounds)}
            className="rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 bg-[#f5f0e8] text-[#4a3f38] ring-[#e8e2d9]"
            title={`All time: ${formatRangeLabel(allTimeBounds)}`}
          >
            All time
          </button>
        </div>
      </div>
      <p className="text-xs text-[#8a7060]">
        Showing <span className="font-medium text-[#1c352a]">{formatRangeLabel(applied)}</span>
        <span className="mx-1.5 text-stone-300">·</span>
        All time covers <span className="font-medium text-[#1c352a]">{formatRangeLabel(allTimeBounds)}</span>
      </p>
    </div>
  );
}

function VerticalBarChart({
  title,
  rows,
  valueFormatter = (v: number) => String(v)
}: {
  title: string;
  rows: Array<{ label: string; value: number; color?: string }>;
  valueFormatter?: (v: number) => string;
}) {
  const max = Math.max(1, ...rows.map((row) => row.value));
  return (
    <SectionCard title={title}>
      {rows.length === 0 ? (
        <EmptyState message="No data in this range." />
      ) : (
        <div className="flex h-56 items-end justify-around gap-1.5 overflow-x-auto px-1 pt-4">
          {rows.map((row, idx) => {
            const height = row.value <= 0 ? 6 : Math.max(10, Math.round((row.value / max) * 180));
            const color = row.color || CHART_COLORS[idx % CHART_COLORS.length];
            return (
              <div key={`${title}:${row.label}`} className="flex min-w-[52px] flex-1 flex-col items-center gap-2">
                <span className="text-[11px] font-semibold text-[#4a3f38]">{valueFormatter(row.value)}</span>
                <div
                  className="w-full max-w-[40px] rounded-t-lg shadow-sm transition-all duration-500"
                  style={{
                    height,
                    background:
                      row.value <= 0
                        ? "linear-gradient(180deg, #e8e2d9 0%, #f0ece6 100%)"
                        : `linear-gradient(180deg, ${color} 0%, ${color}cc 100%)`
                  }}
                  title={`${row.label}: ${valueFormatter(row.value)}`}
                />
                <span className="max-w-full truncate text-center text-[10px] font-medium text-[#8a7060]">{row.label}</span>
              </div>
            );
          })}
        </div>
      )}
    </SectionCard>
  );
}

function SalesVsReturnsChart({
  title,
  rows
}: {
  title: string;
  rows: Array<{ label: string; sales: number; returns: number }>;
}) {
  const max = Math.max(1, ...rows.flatMap((row) => [row.sales, row.returns]));
  return (
    <SectionCard
      title={title}
      right={
        <div className="flex items-center gap-3 text-[11px] text-[#8a7060]">
          <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-[#1c352a]" /> Sales (orders)</span>
          <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-[#b98a3e]" /> Returns (units)</span>
        </div>
      }
    >
      <div className="flex h-60 items-end justify-around gap-2 overflow-x-auto px-1 pt-4">
        {rows.map((row) => {
          const salesH = row.sales <= 0 ? 6 : Math.max(10, Math.round((row.sales / max) * 190));
          const returnsH = row.returns <= 0 ? 6 : Math.max(10, Math.round((row.returns / max) * 190));
          return (
            <div key={row.label} className="flex min-w-[64px] flex-1 flex-col items-center gap-2">
              <div className="flex items-end gap-1">
                <div className="flex flex-col items-center gap-1">
                  <span className="text-[10px] font-semibold text-[#1c352a]">{row.sales}</span>
                  <div
                    className="w-5 rounded-t-md bg-gradient-to-b from-teal-400 to-teal-600 shadow-sm"
                    style={{ height: salesH }}
                    title={`${row.label} sales: ${row.sales}`}
                  />
                </div>
                <div className="flex flex-col items-center gap-1">
                  <span className="text-[10px] font-semibold text-[#8a6200]">{row.returns}</span>
                  <div
                    className="w-5 rounded-t-md bg-gradient-to-b from-[#b98a3e] to-[#8a6200] shadow-sm"
                    style={{ height: returnsH }}
                    title={`${row.label} returns: ${row.returns}`}
                  />
                </div>
              </div>
              <span className="max-w-full truncate text-center text-[10px] font-medium text-[#8a7060]">{row.label}</span>
            </div>
          );
        })}
      </div>
    </SectionCard>
  );
}

function focusTone(action: string) {
  if (action === "SCALE") return "bg-[#f0f7f3] text-[#1c352a] ring-[#a8c4b0]";
  if (action === "FIX RETURNS") return "bg-[#fef9c3] text-[#92400e] ring-[#fde68a]";
  if (action === "CLEAR BACKLOG") return "bg-amber-50 text-amber-900 ring-amber-200";
  if (action === "INTEGRATE") return "bg-[#faf5ec] text-[#8a6200] ring-[#e0d4b0]";
  return "bg-[#f5f0e8] text-[#4a3f38] ring-[#e0d8ce]";
}

function ChartBars({
  title,
  rows,
  valueFormatter = (v: number) => String(v),
  accent: _accent = "bg-[#1c352a]"
}: {
  title: string;
  rows: Array<{ label: string; value: number; sub?: string }>;
  valueFormatter?: (v: number) => string;
  accent?: string;
}) {
  const max = Math.max(1, ...rows.map((row) => row.value));
  return (
    <SectionCard title={title} compact>
      {rows.length === 0 ? (
        <EmptyState message="No data in this range." />
      ) : (
        <div className="space-y-2">
          {rows.map((row) => (
            <div key={`${title}:${row.label}`} className="grid grid-cols-[68px_minmax(0,1fr)_72px] items-center gap-3">
              <div className="text-[11px] text-[#8a7060]">{row.label}</div>
              <div>
                <div className="h-2.5 overflow-hidden rounded-full bg-[#f0ece6]">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.max(4, Math.round((row.value / max) * 100))}%`,
                      background: "linear-gradient(90deg, #1c352a, #2d5040)"
                    }}
                  />
                </div>
                {row.sub ? <div className="mt-1 truncate text-[11px] text-[#8a7060]">{row.sub}</div> : null}
              </div>
              <div className="text-right text-[11px] font-semibold text-[#1c352a]">{valueFormatter(row.value)}</div>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

function channelCurrency(code?: string | null): string {
  switch (code) {
    case "ETSY":
      return "USD";
    case "AMAZON":
    case "FLIPKART":
    case "AMALA":
    case "FIRSTCRY":
    case "TATA_1MG":
    case "SARVEDA":
      return "INR";
    default:
      return "INR";
  }
}

function money(amount: number | null | undefined, currency?: string | null) {
  return formatMinorFromPaise(amount, currency || "INR");
}

function OrderDetailModal({
  order,
  onClose
}: {
  order: MarketplaceOrderRow;
  onClose: () => void;
}) {
  const currency = order.currency || channelCurrency(order.channel.code);
  const subtotal = order.items.reduce((sum, item) => sum + (item.lineTotalInPaise ?? (item.unitPriceInPaise ?? 0) * item.quantity), 0);
  const rawOrder = (order.rawPayload?.order ?? {}) as { OrderTotal?: { Amount?: string; CurrencyCode?: string } };
  const grandTotal = rawOrder.OrderTotal?.Amount ? Math.round(Number(rawOrder.OrderTotal.Amount) * 100) : order.totalValueInPaise;
  const delta = Math.max(0, grandTotal - subtotal);
  return (
    <div className="fixed inset-0 z-[140] flex items-center justify-center bg-black/40 px-4">
      <div className="max-h-[85vh] w-full max-w-3xl overflow-auto rounded-2xl bg-white shadow-2xl dark:bg-stone-900">
        <div className="sticky top-0 flex items-center justify-between border-b border-[#e8e2d9] bg-white px-5 py-4">
          <div>
            <p className="text-sm font-semibold text-[#1c352a]">Order details</p>
            <p className="mt-1 text-xs text-[#8a7060]">{order.externalOrderId}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-xs font-medium"
            style={{ border: "1px solid #e0d8ce", color: "#4a3f38" }}
          >
            Close
          </button>
        </div>

        <div className="space-y-5 p-5 text-sm">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-lg border border-[#e8e2d9] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#8a7060]">Customer details</p>
              <div className="mt-2 space-y-1 text-sm text-[#4a3f38]">
                <p>{order.customerName || "Unknown"}</p>
                <p>{order.customerEmail || "Email not returned"}</p>
                <p>{order.customerPhone || "Phone not returned"}</p>
                <p>{[order.shipToCity, order.shipToState, order.shipToPostalCode].filter(Boolean).join(", ") || "Address not returned"}</p>
              </div>
            </div>
            <div className="rounded-lg border border-[#e8e2d9] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#8a7060]">Order summary</p>
              <div className="mt-2 space-y-1 text-sm text-[#4a3f38]">
                <p>Status: {order.status}</p>
                <p>Date: {new Date(order.orderDate).toLocaleString("en-IN")}</p>
                <p>Item count: {order.totalItems}</p>
                <p>Order total: {money(grandTotal, currency)}</p>
              </div>
            </div>
          </div>

          <SectionCard title="Items in this order">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="border-b border-[#e8e2d9]" style={{ background: "linear-gradient(180deg, #f2ede5, #f9f7f4)" }}>
                  <tr>
                    {["Product", "Variant", "SKU", "Qty", "Unit", "Line total"].map((h) => (
                      <th key={h} className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8a7060]">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {order.items.map((item) => (
                    <tr key={item.id} className="border-b border-[#f0ece6]">
                      <td className="px-3 py-3">{item.productName || item.productNameSnapshot || "Unknown"}</td>
                      <td className="px-3 py-3 text-xs text-[#8a7060]">{item.variantName || "Default"}</td>
                      <td
                        className="px-3 py-3 font-mono text-xs"
                        style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace", color: "#b98a3e" }}
                      >
                        {item.variantSku || item.skuSnapshot}
                      </td>
                      <td className="px-3 py-3">{item.quantity}</td>
                      <td className="px-3 py-3">{item.unitPriceInPaise ? money(item.unitPriceInPaise, currency) : "—"}</td>
                      <td className="px-3 py-3">{money(item.lineTotalInPaise ?? (item.unitPriceInPaise ?? 0) * item.quantity, currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>

          <div className="grid gap-3 md:grid-cols-2">
            <MetricCard label="Items subtotal" value={money(subtotal, currency)} />
            <MetricCard label="Grand total" value={money(grandTotal, currency)} sub={delta > 0 ? `Includes approx. ${money(delta, currency)} extra charges` : "No separate extra charges visible"} />
          </div>
        </div>
      </div>
    </div>
  );
}

export function MarketplaceOpsWorkspace() {
  const searchParams = useSearchParams();
  const initialChannel = searchParams.get("channel") as MarketplaceChannelCode | null;

  const [activeTab, setActiveTab] = useState<ViewTab>(
    initialChannel && CHANNELS.some((c) => c.code === initialChannel) ? initialChannel : "overview"
  );
  const [channelSubTab, setChannelSubTab] = useState<ChannelSubTab>("overview");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [overview, setOverview] = useState<MarketplaceOverviewData | null>(null);
  const [listings, setListings] = useState<MarketplaceListingRow[]>([]);
  const [orders, setOrders] = useState<MarketplaceOrderRow[]>([]);
  const [returns, setReturns] = useState<MarketplaceReturnRow[]>([]);
  const [amazonConnection, setAmazonConnection] = useState<AmazonSpConnectionStatus | null>(null);
  const [amazonLastSync, setAmazonLastSync] = useState<AmazonSyncAllResult | null>(null);
  const [etsyConnection, setEtsyConnection] = useState<EtsyConnectionStatus | null>(null);
  const [flipkartConnection, setFlipkartConnection] = useState<FlipkartConnectionStatus | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<MarketplaceOrderRow | null>(null);

  const [listingSearch, setListingSearch] = useState("");
  const [listingSort, setListingSort] = useState<ListingSort>("sold_desc");
  const monthDefault = useMemo(() => currentMonthRange(), []);
  const [ordersDraft, setOrdersDraft] = useState<DateRange>(monthDefault);
  const [ordersRange, setOrdersRange] = useState<DateRange>(monthDefault);
  const [returnsDraft, setReturnsDraft] = useState<DateRange>(monthDefault);
  const [returnsRange, setReturnsRange] = useState<DateRange>(monthDefault);
  const [channelOverviewDraft, setChannelOverviewDraft] = useState<DateRange>(monthDefault);
  const [channelOverviewRange, setChannelOverviewRange] = useState<DateRange>(monthDefault);
  const [mainOverviewDraft, setMainOverviewDraft] = useState<DateRange>(monthDefault);
  const [mainOverviewRange, setMainOverviewRange] = useState<DateRange>(monthDefault);
  const [globalListings, setGlobalListings] = useState<MarketplaceListingRow[]>([]);
  const [globalOrders, setGlobalOrders] = useState<MarketplaceOrderRow[]>([]);
  const [globalReturns, setGlobalReturns] = useState<MarketplaceReturnRow[]>([]);

  const activeChannel = activeTab === "overview" || activeTab === "zoho_books" ? null : activeTab;
  const activeChannelLabel = useMemo(
    () => CHANNELS.find((c) => c.code === activeChannel)?.label ?? "Marketplace",
    [activeChannel]
  );
  const activeCurrency = channelCurrency(activeChannel);

  useEffect(() => {
    void loadOverview();
  }, []);

  useEffect(() => {
    if (activeTab !== "overview") return;
    void loadGlobalChartData();
  }, [activeTab]);

  useEffect(() => {
    if (!activeChannel) return;
    void Promise.all([loadListings(activeChannel), loadOrders(activeChannel), loadReturns(activeChannel)]);
  }, [activeChannel]);

  useEffect(() => {
    if (activeChannel === "AMAZON") {
      void loadAmazonConnection();
    } else {
      setAmazonConnection(null);
    }
    if (activeChannel === "FLIPKART") {
      void loadFlipkartConnection();
    } else {
      setFlipkartConnection(null);
    }
    if (activeChannel === "ETSY") {
      void loadEtsyConnection();
    } else {
      setEtsyConnection(null);
    }
  }, [activeChannel]);

  useEffect(() => {
    const next = currentMonthRange();
    setChannelSubTab("overview");
    setListingSearch("");
    setListingSort("sold_desc");
    setOrdersDraft(next);
    setOrdersRange(next);
    setReturnsDraft(next);
    setReturnsRange(next);
    setChannelOverviewDraft(next);
    setChannelOverviewRange(next);
  }, [activeChannel]);

  async function loadOverview() {
    try {
      setError(null);
      setOverview(await fetchMarketplaceOverview());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load overview");
    }
  }

  async function loadGlobalChartData() {
    try {
      const [listingsData, ordersData, returnsData] = await Promise.all([
        fetchMarketplaceListings(),
        fetchMarketplaceOrders(),
        fetchMarketplaceReturns()
      ]);
      setGlobalListings(listingsData.items);
      setGlobalOrders(ordersData.items);
      setGlobalReturns(returnsData.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load overview charts");
    }
  }

  async function loadListings(channel: MarketplaceChannelCode) {
    const data = await fetchMarketplaceListings({ channelCode: channel });
    setListings(data.items);
  }

  async function loadOrders(channel: MarketplaceChannelCode) {
    const data = await fetchMarketplaceOrders({ channelCode: channel });
    setOrders(data.items);
  }

  async function loadReturns(channel: MarketplaceChannelCode) {
    const data = await fetchMarketplaceReturns({ channelCode: channel });
    setReturns(data.items);
  }

  async function loadAmazonConnection() {
    try {
      setAmazonConnection(await fetchAmazonSpConnection());
    } catch {
      setAmazonConnection(null);
    }
  }

  async function loadFlipkartConnection() {
    try {
      setFlipkartConnection(await fetchFlipkartConnection());
    } catch {
      setFlipkartConnection(null);
    }
  }

  async function loadEtsyConnection() {
    try {
      setEtsyConnection(await fetchEtsyConnection());
    } catch {
      setEtsyConnection(null);
    }
  }

  async function runFlipkartManualSync() {
    setBusy("flipkart-sync");
    setError(null);
    try {
      await syncFlipkartMarketplaceAll({ daysBack: 90, maxPages: 25 });
      if (activeChannel) {
        await Promise.all([loadListings(activeChannel), loadOrders(activeChannel), loadReturns(activeChannel)]);
      }
      await loadFlipkartConnection();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Flipkart sync failed");
    } finally {
      setBusy(null);
    }
  }

  async function runEtsyManualSync() {
    setBusy("etsy-sync");
    setError(null);
    setNotice(null);
    try {
      const result = await syncEtsyMarketplaceAll({ monthsBack: 24, maxPagesPerMonth: 10 });
      setNotice(
        result.message ||
          "Etsy sync started in the background (month by month). Refresh Listings/Orders/Returns in a few minutes."
      );
      if (activeChannel) {
        await Promise.all([loadListings(activeChannel), loadOrders(activeChannel), loadReturns(activeChannel)]);
      }
      await loadEtsyConnection();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Etsy sync failed");
    } finally {
      setBusy(null);
    }
  }

  async function runAmazonManualSync() {
    setBusy("amazon-sync");
    setError(null);
    setNotice(null);
    try {
      const result = await syncAmazonMarketplaceAll({
        monthsBack: 24,
        includeShipped: true,
        maxPagesPerMonth: 10
      });
      setAmazonLastSync(result);
      setNotice(
        result.message ||
          "Amazon sync started in the background (month by month). Refresh Listings/Orders/Returns in a few minutes."
      );
      if (activeChannel) {
        await Promise.all([loadListings(activeChannel), loadOrders(activeChannel), loadReturns(activeChannel)]);
      }
      await loadAmazonConnection();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Amazon sync failed");
    } finally {
      setBusy(null);
    }
  }

  const channelAllTimeBounds = useMemo(() => {
    const dates = [
      ...orders.map((row) => row.orderDate),
      ...returns.map((row) => returnEventDate(row))
    ];
    return boundsFromIsoDates(dates);
  }, [orders, returns]);

  const mainAllTimeBounds = useMemo(() => {
    const dates = [
      ...globalOrders.map((row) => row.orderDate),
      ...globalReturns.map((row) => returnEventDate(row)),
      ...globalListings.map((row) => row.updatedAt)
    ];
    return boundsFromIsoDates(dates);
  }, [globalOrders, globalReturns, globalListings]);

  const filteredOrders = useMemo(
    () => orders.filter((row) => inDateRange(row.orderDate, ordersRange)),
    [orders, ordersRange]
  );
  const filteredReturns = useMemo(
    () => returns.filter((row) => inDateRange(returnEventDate(row), returnsRange)),
    [returns, returnsRange]
  );

  const filteredListings = useMemo(() => {
    const needle = listingSearch.trim().toLowerCase();
    const base = listings.filter((row) => {
      if (!needle) return true;
      return [
        row.variant.productName,
        row.variant.variantName,
        row.variant.sku,
        row.listingId ?? ""
      ]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
    return [...base].sort((a, b) => {
      if (listingSort === "sold_desc") return b.recentSoldQty - a.recentSoldQty;
      if (listingSort === "sold_asc") return a.recentSoldQty - b.recentSoldQty;
      if (listingSort === "returns_desc") return b.recentReturnQty - a.recentReturnQty;
      if (listingSort === "returns_asc") return a.recentReturnQty - b.recentReturnQty;
      if (listingSort === "stock_desc") return b.zohoOnHand - a.zohoOnHand;
      return a.zohoOnHand - b.zohoOnHand;
    });
  }, [listings, listingSearch, listingSort]);

  const overviewOrders = useMemo(
    () => orders.filter((row) => inDateRange(row.orderDate, channelOverviewRange)),
    [orders, channelOverviewRange]
  );
  const overviewReturns = useMemo(
    () => returns.filter((row) => inDateRange(returnEventDate(row), channelOverviewRange)),
    [returns, channelOverviewRange]
  );

  const mainFilteredOrders = useMemo(
    () => globalOrders.filter((row) => inDateRange(row.orderDate, mainOverviewRange)),
    [globalOrders, mainOverviewRange]
  );
  const mainFilteredReturns = useMemo(
    () => globalReturns.filter((row) => inDateRange(returnEventDate(row), mainOverviewRange)),
    [globalReturns, mainOverviewRange]
  );

  const listingsByChannelChart = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of globalListings) {
      map.set(row.channel.code, (map.get(row.channel.code) ?? 0) + 1);
    }
    return CHANNELS.map((ch, idx) => ({
      label: ch.label,
      value: map.get(ch.code) ?? 0,
      color: CHART_COLORS[idx % CHART_COLORS.length]
    }));
  }, [globalListings]);

  const pendingDispatchChart = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of mainFilteredOrders) {
      if (!["RECEIVED", "CONFIRMED"].includes(row.status)) continue;
      map.set(row.channel.code, (map.get(row.channel.code) ?? 0) + 1);
    }
    return CHANNELS.map((ch, idx) => ({
      label: ch.label,
      value: map.get(ch.code) ?? 0,
      color: CHART_COLORS[idx % CHART_COLORS.length]
    }));
  }, [mainFilteredOrders]);

  const returnsByChannelChart = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of mainFilteredReturns) {
      if (row.status === "REFUNDED") continue;
      map.set(row.channel.code, (map.get(row.channel.code) ?? 0) + row.quantity);
    }
    return CHANNELS.map((ch, idx) => ({
      label: ch.label,
      value: map.get(ch.code) ?? 0,
      color: CHART_COLORS[idx % CHART_COLORS.length]
    }));
  }, [mainFilteredReturns]);

  const refundsByChannelChart = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of mainFilteredReturns) {
      if (row.status !== "REFUNDED") continue;
      map.set(row.channel.code, (map.get(row.channel.code) ?? 0) + row.quantity);
    }
    return CHANNELS.map((ch, idx) => ({
      label: ch.label,
      value: map.get(ch.code) ?? 0,
      color: CHART_COLORS[(idx + 3) % CHART_COLORS.length]
    }));
  }, [mainFilteredReturns]);

  const salesVsReturnsChart = useMemo(() => {
    const sales = new Map<string, number>();
    const rets = new Map<string, number>();
    for (const row of mainFilteredOrders) {
      sales.set(row.channel.code, (sales.get(row.channel.code) ?? 0) + 1);
    }
    for (const row of mainFilteredReturns) {
      rets.set(row.channel.code, (rets.get(row.channel.code) ?? 0) + row.quantity);
    }
    return CHANNELS.map((ch) => ({
      label: ch.label,
      sales: sales.get(ch.code) ?? 0,
      returns: rets.get(ch.code) ?? 0
    }));
  }, [mainFilteredOrders, mainFilteredReturns]);

  const marketplaceFocus = useMemo(() => {
    const unitsSold = new Map<string, number>();
    const orderCount = new Map<string, number>();
    const pending = new Map<string, number>();
    const returnUnits = new Map<string, number>();
    const refundUnits = new Map<string, number>();
    const listings = new Map<string, number>();

    for (const row of globalListings) {
      listings.set(row.channel.code, (listings.get(row.channel.code) ?? 0) + 1);
    }
    for (const row of mainFilteredOrders) {
      orderCount.set(row.channel.code, (orderCount.get(row.channel.code) ?? 0) + 1);
      if (["RECEIVED", "CONFIRMED"].includes(row.status)) {
        pending.set(row.channel.code, (pending.get(row.channel.code) ?? 0) + 1);
      }
      for (const item of row.items) {
        unitsSold.set(row.channel.code, (unitsSold.get(row.channel.code) ?? 0) + item.quantity);
      }
    }
    for (const row of mainFilteredReturns) {
      if (row.status === "REFUNDED") {
        refundUnits.set(row.channel.code, (refundUnits.get(row.channel.code) ?? 0) + row.quantity);
      } else {
        returnUnits.set(row.channel.code, (returnUnits.get(row.channel.code) ?? 0) + row.quantity);
      }
    }

    const rows = CHANNELS.map((ch) => {
      const orders = orderCount.get(ch.code) ?? 0;
      const sold = unitsSold.get(ch.code) ?? 0;
      const openReturns = returnUnits.get(ch.code) ?? 0;
      const refunded = refundUnits.get(ch.code) ?? 0;
      const totalReturns = openReturns + refunded;
      const listingCount = listings.get(ch.code) ?? 0;
      const pendingCount = pending.get(ch.code) ?? 0;
      const returnRate = sold > 0 ? totalReturns / sold : orders > 0 ? totalReturns / orders : 0;
      const isLive = listingCount > 0 || orders > 0 || totalReturns > 0;

      let action: "SCALE" | "FIX RETURNS" | "CLEAR BACKLOG" | "INTEGRATE" | "MONITOR" = "MONITOR";
      let reason = "Stable activity — keep watching weekly.";
      let priority = 50;

      if (!isLive) {
        action = "INTEGRATE";
        reason = "No listings/orders yet — finish API connect to unlock this channel.";
        priority = 35;
      } else if (pendingCount >= 5 && pendingCount >= Math.max(2, Math.round(orders * 0.15))) {
        action = "CLEAR BACKLOG";
        reason = `${pendingCount} orders waiting dispatch — ops bottleneck before growth.`;
        priority = 90 + pendingCount;
      } else if (sold >= 5 && returnRate >= 0.2) {
        action = "FIX RETURNS";
        reason = `${Math.round(returnRate * 100)}% return rate — fix listing quality before spending more on ads.`;
        priority = 85 + Math.round(returnRate * 100);
      } else if (orders >= 20 && returnRate < 0.12) {
        action = "SCALE";
        reason = `Strong sales (${orders} orders) with healthy returns — increase inventory & ads here first.`;
        priority = 70 + orders;
      } else if (orders > 0 && returnRate >= 0.15) {
        action = "FIX RETURNS";
        reason = `Return pressure rising (${Math.round(returnRate * 100)}%) — review top returned SKUs.`;
        priority = 65 + Math.round(returnRate * 40);
      } else if (orders > 0) {
        action = "MONITOR";
        reason = `${orders} orders in range — solid baseline, no urgent action.`;
        priority = 40 + orders;
      }

      return {
        code: ch.code,
        label: ch.label,
        orders,
        sold,
        openReturns,
        refunded,
        totalReturns,
        returnRate,
        pendingCount,
        listingCount,
        action,
        reason,
        priority,
        predictedNextMonthOrders: Math.max(0, Math.round(orders * (returnRate > 0.2 ? 0.85 : returnRate < 0.1 ? 1.15 : 1.0)))
      };
    }).sort((a, b) => b.priority - a.priority);

    const scale = rows.filter((r) => r.action === "SCALE");
    const fix = rows.filter((r) => r.action === "FIX RETURNS");
    const backlog = rows.filter((r) => r.action === "CLEAR BACKLOG");
    const integrate = rows.filter((r) => r.action === "INTEGRATE");
    const topSales = [...rows].sort((a, b) => b.orders - a.orders)[0];
    const worstReturns = [...rows].filter((r) => r.sold > 0 || r.orders > 0).sort((a, b) => b.returnRate - a.returnRate)[0];

    const conclusions: string[] = [];
    if (topSales && topSales.orders > 0) {
      conclusions.push(
        `${topSales.label} is the sales engine in this period (${topSales.orders} orders, ${topSales.sold} units). Predicted next-month volume ≈ ${topSales.predictedNextMonthOrders} orders if current trend holds.`
      );
    } else {
      conclusions.push("No marketplace has material sales in this range yet — prioritize finishing integrations and first syncs.");
    }
    if (worstReturns && worstReturns.returnRate >= 0.15) {
      conclusions.push(
        `${worstReturns.label} has the weakest quality signal: ${Math.round(worstReturns.returnRate * 100)}% returns (${worstReturns.totalReturns} units). Do not scale ads there until return rate drops below 12%.`
      );
    } else if (topSales && topSales.orders > 0) {
      conclusions.push("Return rates look manageable across live channels — safe to protect margin while growing the top seller.");
    }
    if (backlog[0]) {
      conclusions.push(`Immediate ops focus: clear ${backlog[0].label} dispatch backlog (${backlog[0].pendingCount} pending) before it hurts ratings.`);
    }
    if (scale[0]) {
      conclusions.push(`Best channel to invest in next: ${scale[0].label} — ${scale[0].reason}`);
    } else if (fix[0]) {
      conclusions.push(`Hold growth spend on ${fix[0].label} until returns cool down.`);
    }
    if (integrate.length > 0) {
      conclusions.push(
        `Still offline (${integrate.map((r) => r.label).join(", ")}): integrate in this order — Flipkart → Amala/FirstCry/Tata 1mg → Sarveda — so the comparison board fills with real data.`
      );
    }

    return { rows, conclusions };
  }, [globalListings, mainFilteredOrders, mainFilteredReturns]);

  const topSellingRows = useMemo(() => {
    const stats = new Map<string, { key: string; label: string; productName: string; variantName: string; units: number; returns: number; revenue: number }>();
    for (const order of overviewOrders) {
      for (const item of order.items) {
        const key = item.variantSku || item.skuSnapshot;
        const cur = stats.get(key) ?? {
          key,
          label: key,
          productName: item.productName || item.productNameSnapshot || "Unknown",
          variantName: item.variantName || "Default",
          units: 0,
          returns: 0,
          revenue: 0
        };
        cur.units += item.quantity;
        cur.revenue += item.lineTotalInPaise ?? (item.unitPriceInPaise ?? 0) * item.quantity;
        stats.set(key, cur);
      }
    }
    for (const ret of overviewReturns) {
      const key = ret.sku || "Unknown";
      const cur = stats.get(key);
      if (cur) cur.returns += ret.quantity;
    }
    return Array.from(stats.values()).sort((a, b) => b.units - a.units).slice(0, 10);
  }, [overviewOrders, overviewReturns]);

  const overviewConclusion = useMemo(() => {
    const currentSales = overviewOrders.length;
    const currentReturns = overviewReturns.reduce((sum, row) => sum + row.quantity, 0);
    const refundValue = overviewReturns.reduce((sum, row) => sum + (row.refundedAmountInPaise ?? 0), 0);
    const top = topSellingRows[0];
    const risky = [...topSellingRows]
      .filter((row) => row.units > 0)
      .map((row) => ({ ...row, ratio: row.returns / row.units }))
      .sort((a, b) => b.ratio - a.ratio)[0];

    const highlights: string[] = [];
    highlights.push(
      currentSales === 0
        ? "No orders landed in the selected period. This marketplace needs attention immediately."
        : `${currentSales} orders were placed in the selected period with ${currentReturns} returned units and ${money(refundValue, activeCurrency)} in refunds.`
    );
    if (top) {
      highlights.push(`Best seller right now is ${top.productName} (${top.variantName}) with ${top.units} units sold. Consider increasing depth on this variant.`);
    }
    if (risky && risky.ratio >= 0.3 && risky.returns >= 2) {
      highlights.push(`Watch ${risky.productName} (${risky.variantName}) closely: ${risky.returns} returns on ${risky.units} sold units. Consider pausing or improving this listing.`);
    } else {
      highlights.push("No SKU currently shows a severe return-risk pattern in the selected period.");
    }
    return highlights;
  }, [overviewOrders, overviewReturns, topSellingRows, activeCurrency]);

  const ordersByDay = useMemo(() => {
    const buckets = new Map<string, number>();
    for (let i = 6; i >= 0; i -= 1) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      buckets.set(d.toLocaleDateString("en-IN", { day: "numeric", month: "short" }), 0);
    }
    for (const order of overviewOrders) {
      const key = new Date(order.orderDate).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
      if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + 1);
    }
    return Array.from(buckets.entries()).map(([label, value]) => ({ label, value }));
  }, [overviewOrders]);

  const returnsByDay = useMemo(() => {
    const buckets = new Map<string, number>();
    for (let i = 6; i >= 0; i -= 1) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      buckets.set(d.toLocaleDateString("en-IN", { day: "numeric", month: "short" }), 0);
    }
    for (const ret of overviewReturns) {
      const key = new Date(returnEventDate(ret)).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
      if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + ret.quantity);
    }
    return Array.from(buckets.entries()).map(([label, value]) => ({ label, value }));
  }, [overviewReturns]);

  const refundsByDay = useMemo(() => {
    const buckets = new Map<string, number>();
    for (let i = 6; i >= 0; i -= 1) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      buckets.set(d.toLocaleDateString("en-IN", { day: "numeric", month: "short" }), 0);
    }
    for (const ret of overviewReturns) {
      const key = new Date(returnEventDate(ret)).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
      if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + Math.round((ret.refundedAmountInPaise ?? 0) / 100));
    }
    return Array.from(buckets.entries()).map(([label, value]) => ({ label, value }));
  }, [overviewReturns]);

  return (
    <div className="mx-auto max-w-[1440px] space-y-4 pt-2">
      <div style={{ background: "linear-gradient(135deg, #1c352a 0%, #2d5040 100%)", borderRadius: "16px", padding: "22px 28px" }}>
        <h1 style={{ fontSize: "26px", fontWeight: 800, color: "#faf5ec" }}>🛒 Marketplace Operations</h1>
        <p style={{ fontSize: "13px", color: "#a8c4b0", marginTop: "4px" }}>Multi-channel sales, listings, returns & syncs</p>
      </div>

      <div className="flex flex-wrap gap-5 border-b border-[#e8e2d9]">
        <button
          type="button"
          onClick={() => setActiveTab("overview")}
          className={`border-b-2 px-1 pb-2 text-sm font-medium ${activeTab === "overview" ? "border-[#b98a3e] text-[#1c352a] font-semibold" : "border-transparent text-[#8a7060] hover:text-[#1c352a] transition-colors"}`}
        >
          Overview
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("zoho_books")}
          className={`border-b-2 px-1 pb-2 text-sm font-medium ${activeTab === "zoho_books" ? "border-[#b98a3e] text-[#1c352a] font-semibold" : "border-transparent text-[#8a7060] hover:text-[#1c352a] transition-colors"}`}
        >
          Zoho Books
        </button>
        {CHANNELS.map((item) => (
          <button
            key={item.code}
            type="button"
            onClick={() => setActiveTab(item.code)}
            className={`border-b-2 px-1 pb-2 text-sm font-medium ${activeTab === item.code ? "border-[#b98a3e] text-[#1c352a] font-semibold" : "border-transparent text-[#8a7060] hover:text-[#1c352a] transition-colors"}`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {error ? <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" style={{ borderLeft: "3px solid #dc2626", borderRadius: "10px" }}>{error}</div> : null}
      {notice ? <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900" style={{ borderLeft: "3px solid #16a34a", borderRadius: "10px" }}>{notice}</div> : null}

      {activeTab === "zoho_books" ? <ZohoBooksHistoricalPanel /> : null}

      {activeTab === "overview" && overview ? (
        <div className="space-y-4">
          <DateRangeFilter
            draft={mainOverviewDraft}
            applied={mainOverviewRange}
            allTimeBounds={mainAllTimeBounds}
            onDraftChange={setMainOverviewDraft}
            onApply={() => setMainOverviewRange(mainOverviewDraft)}
            onQuick={(next) => {
              setMainOverviewDraft(next);
              setMainOverviewRange(next);
            }}
          />

          <div className="grid gap-3 md:grid-cols-4">
            <MetricCard label="Channels" value={overview.totals.channels} />
            <MetricCard label="Listings" value={overview.totals.listings} />
            <MetricCard
              label="Orders in range"
              value={mainFilteredOrders.length}
              sub={formatRangeLabel(mainOverviewRange)}
            />
            <MetricCard
              label="Returns in range"
              value={mainFilteredReturns.length}
              sub={`${mainFilteredReturns.reduce((sum, row) => sum + row.quantity, 0)} units`}
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <VerticalBarChart title="Listings by channel" rows={listingsByChannelChart} />
            <VerticalBarChart title="Pending dispatch" rows={pendingDispatchChart} />
            <VerticalBarChart title="Returns by channel (open)" rows={returnsByChannelChart} />
            <VerticalBarChart title="Refunds by channel" rows={refundsByChannelChart} />
          </div>

          <SalesVsReturnsChart title="Sales vs returns by marketplace" rows={salesVsReturnsChart} />

          <SectionCard title="Focus & prediction">
            <div className="space-y-4">
              <div className="space-y-2">
                {marketplaceFocus.conclusions.map((line) => (
                  <div
                    key={line}
                    className="rounded-lg border border-[#e8e2d9] px-4 py-3 text-sm text-[#4a3f38]" style={{ background: "linear-gradient(135deg, #f9f7f4, #faf5ec)", borderLeft: "3px solid rgba(185,138,62,0.3)" }}
                  >
                    {line}
                  </div>
                ))}
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="border-b border-[#e8e2d9]" style={{ background: "linear-gradient(180deg, #f2ede5, #f9f7f4)" }}>
                    <tr>
                      {[
                        "Marketplace",
                        "Orders",
                        "Units sold",
                        "Open returns",
                        "Refunded",
                        "Return rate",
                        "Pending",
                        "Next-month forecast",
                        "Focus"
                      ].map((h) => (
                        <th key={h} className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8a7060]">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {marketplaceFocus.rows.map((row) => (
                      <tr key={row.code} className="border-b border-[#f0ece6]">
                        <td className="px-3 py-3 font-semibold text-[#1c352a]">{row.label}</td>
                        <td className="px-3 py-3">{row.orders}</td>
                        <td className="px-3 py-3">{row.sold}</td>
                        <td className="px-3 py-3 font-semibold text-[#b98a3e]">{row.openReturns}</td>
                        <td className="px-3 py-3 font-semibold text-[#dc2626]">{row.refunded}</td>
                        <td className="px-3 py-3">{row.sold > 0 || row.orders > 0 ? `${Math.round(row.returnRate * 100)}%` : "—"}</td>
                        <td className="px-3 py-3">{row.pendingCount}</td>
                        <td className="px-3 py-3">{row.predictedNextMonthOrders}</td>
                        <td className="px-3 py-3">
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${focusTone(row.action)}`}>
                            {row.action}
                          </span>
                          <p className="mt-1 max-w-[240px] text-[11px] leading-snug text-[#8a7060]">{row.reason}</p>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Marketplace snapshot">
            <div className="grid gap-3 lg:grid-cols-3">
              {overview.channels.map((row, idx) => (
                <div
                  key={row.id}
                  className="rounded-xl border border-[#e8e2d9] p-4"
                  style={{ background: `linear-gradient(135deg, ${CHART_COLORS[idx % CHART_COLORS.length]}12, transparent)` }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold text-[#1c352a]">{row.displayName}</p>
                    <StatusPill label={row.isActive ? "ACTIVE" : "PAUSED"} />
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                    <div><p className="text-[#8a7060]">Listings</p><p className="font-semibold">{row.activeListingCount}/{row.listingCount}</p></div>
                    <div><p className="text-[#8a7060]">Orders</p><p className="font-semibold">{row.orderCount}</p></div>
                    <div><p className="text-[#8a7060]">Pending dispatch</p><p className="font-semibold">{row.dispatchPending}</p></div>
                    <div><p className="text-[#8a7060]">High stock risk</p><p className="font-semibold">{row.highRiskCount}</p></div>
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>
        </div>
      ) : null}

      {activeChannel ? (
        <>
          <div className="flex items-center justify-between border-b border-[#e8e2d9]">
            <div className="flex flex-wrap gap-4">
              {SUB_TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setChannelSubTab(tab.id)}
                  className={`border-b-2 px-1 pb-2 text-sm font-medium ${channelSubTab === tab.id ? "border-[#b98a3e] text-[#1c352a] font-semibold" : "border-transparent text-[#8a7060] hover:text-[#1c352a] transition-colors"}`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            {activeChannel === "AMAZON" ? (
              <button
                type="button"
                onClick={() => void runAmazonManualSync()}
                disabled={busy === "amazon-sync" || amazonConnection?.configured === false}
                className="mb-1 rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
                style={{
                  background: busy === "amazon-sync" ? "#4a7c59" : "linear-gradient(135deg, #1c352a, #2d5040)",
                  color: "#fffbf5",
                  border: "none",
                  boxShadow: "0 2px 6px rgba(28,53,42,0.2)",
                  borderRadius: "8px"
                }}
              >
                {busy === "amazon-sync" ? "Syncing..." : "Sync now"}
              </button>
            ) : activeChannel === "FLIPKART" ? (
              <button
                type="button"
                onClick={() => void runFlipkartManualSync()}
                disabled={busy === "flipkart-sync" || flipkartConnection?.configured === false}
                className="mb-1 rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
                style={{
                  background: busy === "flipkart-sync" ? "#4a7c59" : "linear-gradient(135deg, #1c352a, #2d5040)",
                  color: "#fffbf5",
                  border: "none",
                  boxShadow: "0 2px 6px rgba(28,53,42,0.2)",
                  borderRadius: "8px"
                }}
              >
                {busy === "flipkart-sync" ? "Syncing..." : "Sync now"}
              </button>
            ) : activeChannel === "ETSY" ? (
              <button
                type="button"
                onClick={() => void runEtsyManualSync()}
                disabled={busy === "etsy-sync" || etsyConnection?.configured === false}
                className="mb-1 rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
                style={{
                  background: busy === "etsy-sync" ? "#4a7c59" : "linear-gradient(135deg, #1c352a, #2d5040)",
                  color: "#fffbf5",
                  border: "none",
                  boxShadow: "0 2px 6px rgba(28,53,42,0.2)",
                  borderRadius: "8px"
                }}
              >
                {busy === "etsy-sync" ? "Syncing..." : "Sync now"}
              </button>
            ) : null}
          </div>

          {channelSubTab === "overview" ? (
            <div className="space-y-4">
              <DateRangeFilter
                draft={channelOverviewDraft}
                applied={channelOverviewRange}
                allTimeBounds={channelAllTimeBounds}
                onDraftChange={setChannelOverviewDraft}
                onApply={() => setChannelOverviewRange(channelOverviewDraft)}
                onQuick={(next) => {
                  setChannelOverviewDraft(next);
                  setChannelOverviewRange(next);
                }}
              />

              <SectionCard title={`${activeChannelLabel} weekly conclusion`}>
                <div className="space-y-3">
                  {overviewConclusion.map((line) => (
                    <div key={line} className="rounded-lg border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-700 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-200">
                      {line}
                    </div>
                  ))}
                  {amazonLastSync?.orders && amazonLastSync.listings && amazonLastSync.returns ? (
                    <div className="rounded-lg border border-stone-200 px-4 py-3 text-xs text-stone-500 dark:border-stone-700">
                      Last manual sync scanned {amazonLastSync.orders.fetched} orders, {amazonLastSync.listings.rows} listings, and {amazonLastSync.returns.rows} returns.
                    </div>
                  ) : null}
                </div>
              </SectionCard>

              <div className="grid gap-3 md:grid-cols-4">
                <MetricCard label="Orders" value={overviewOrders.length} />
                <MetricCard label="Returned units" value={overviewReturns.reduce((sum, row) => sum + row.quantity, 0)} />
                <MetricCard label="Refund value" value={money(overviewReturns.reduce((sum, row) => sum + (row.refundedAmountInPaise ?? 0), 0), activeCurrency)} />
                <div className="rounded-lg border border-stone-200 bg-white px-4 py-3 dark:border-stone-700 dark:bg-stone-900">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-500">Top seller</p>
                  {topSellingRows[0] ? (
                    <>
                      <p className="mt-1 text-base font-bold leading-snug text-stone-900 dark:text-stone-100">
                        {topSellingRows[0].productName}
                      </p>
                      <p className="mt-0.5 text-xs text-stone-500">{topSellingRows[0].variantName}</p>
                      <button
                        type="button"
                        onClick={() => copyText(topSellingRows[0].key)}
                        className="mt-1.5 inline-flex items-center gap-1 font-mono text-[11px] text-stone-500 underline-offset-2 hover:text-stone-800 hover:underline dark:hover:text-stone-200"
                        title="Copy SKU"
                      >
                        {topSellingRows[0].key}
                        <span className="rounded bg-stone-100 px-1 py-0.5 text-[9px] font-sans font-semibold uppercase tracking-wide text-stone-600 dark:bg-stone-800 dark:text-stone-300">
                          Copy
                        </span>
                      </button>
                    </>
                  ) : (
                    <p className="mt-1 text-xl font-semibold text-stone-900 dark:text-stone-100">—</p>
                  )}
                </div>
              </div>

              <div className="grid gap-4 xl:grid-cols-2">
                <ChartBars title="Orders placed" rows={ordersByDay} />
                <ChartBars title="Returns" rows={returnsByDay} accent="bg-amber-500" />
                <ChartBars title="Refunds" rows={refundsByDay} valueFormatter={(v) => money(v * 100, activeCurrency)} accent="bg-red-500" />
                <ChartBars
                  title="Top 10 sellers"
                  rows={topSellingRows.map((row) => ({
                    label: truncateLabel(row.productName, 12),
                    value: row.units,
                    sub: `${row.key} · ${truncateLabel(row.variantName, 36)}`
                  }))}
                  accent="bg-emerald-600"
                />
              </div>
            </div>
          ) : null}

          {channelSubTab === "listings" ? (
            <div className="space-y-4">
              <div className="grid gap-3 rounded-xl border border-stone-200 bg-white p-4 shadow-sm dark:border-stone-700 dark:bg-stone-900 md:grid-cols-[1.2fr_0.8fr]">
                <div>
                  <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8a7060]">Search</label>
                  <input
                    value={listingSearch}
                    onChange={(e) => setListingSearch(e.target.value)}
                    placeholder="Search product, variant, SKU, listing ID"
                    className="w-full rounded-lg border border-[#e0d8ce] px-3 py-2 text-sm"
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = "#b98a3e";
                      e.currentTarget.style.boxShadow = "0 0 0 3px rgba(185,138,62,0.10)";
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = "#e0d8ce";
                      e.currentTarget.style.boxShadow = "none";
                    }}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8a7060]">Sort</label>
                  <select
                    value={listingSort}
                    onChange={(e) => setListingSort(e.target.value as ListingSort)}
                    className="w-full rounded-lg border border-[#e0d8ce] px-3 py-2 text-sm"
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = "#b98a3e";
                      e.currentTarget.style.boxShadow = "0 0 0 3px rgba(185,138,62,0.10)";
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = "#e0d8ce";
                      e.currentTarget.style.boxShadow = "none";
                    }}
                  >
                    <option value="sold_desc">Sold count: high to low</option>
                    <option value="sold_asc">Sold count: low to high</option>
                    <option value="returns_desc">Return count: high to low</option>
                    <option value="returns_asc">Return count: low to high</option>
                    <option value="stock_desc">Stock: high to low</option>
                    <option value="stock_asc">Stock: low to high</option>
                  </select>
                </div>
              </div>

              <SectionCard title="Listings" right={<p className="text-xs text-stone-500">{filteredListings.length} tracked</p>}>
                {filteredListings.length === 0 ? (
                  <EmptyState message="No listings match the current filters." />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead className="border-b border-[#e8e2d9]" style={{ background: "linear-gradient(180deg, #f2ede5, #f9f7f4)" }}>
                        <tr>
                          {["Product name", "Variant name", "SKU", "Listing ID", "Stock Count", "Status", "Price", "Sold count", "Return count"].map((h) => (
                            <th key={h} className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8a7060]">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {filteredListings.map((row) => (
                          <tr key={row.id} className="border-b border-[#f0ece6]">
                            <td className="px-3 py-3">{row.variant.productName}</td>
                            <td className="px-3 py-3 text-xs text-stone-600 dark:text-stone-300">{row.variant.variantName}</td>
                            <td className="px-3 py-3 font-mono text-xs">{row.variant.sku}</td>
                            <td className="px-3 py-3 font-mono text-xs">{row.listingId || "—"}</td>
                            <td className="px-3 py-3">{row.zohoOnHand}</td>
                            <td className="px-3 py-3"><StatusPill label={row.status} /></td>
                            <td className="px-3 py-3">{row.priceInPaise ? money(row.priceInPaise, row.currency || activeCurrency) : "—"}</td>
                            <td className="px-3 py-3">{row.recentSoldQty}</td>
                            <td className="px-3 py-3">{row.recentReturnQty}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </SectionCard>
            </div>
          ) : null}

          {channelSubTab === "orders" ? (
            <div className="space-y-4">
              <DateRangeFilter
                draft={ordersDraft}
                applied={ordersRange}
                allTimeBounds={channelAllTimeBounds}
                onDraftChange={setOrdersDraft}
                onApply={() => setOrdersRange(ordersDraft)}
                onQuick={(next) => {
                  setOrdersDraft(next);
                  setOrdersRange(next);
                }}
              />
              <SectionCard title="Orders" right={<p className="text-xs text-stone-500">{filteredOrders.length} orders</p>}>
                {filteredOrders.length === 0 ? (
                  <EmptyState message="No orders in this range." />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead className="border-b border-[#e8e2d9]" style={{ background: "linear-gradient(180deg, #f2ede5, #f9f7f4)" }}>
                        <tr>
                          {["Order ID", "Customer details", "Order details", "Item Count", "Order Total", "Status", "Date"].map((h) => (
                            <th key={h} className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8a7060]">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {filteredOrders.map((row) => (
                          <tr key={row.id} className="border-b border-[#f0ece6]">
                            <td className="px-3 py-3">
                              <button type="button" onClick={() => copyText(row.externalOrderId)} className="font-mono text-xs text-stone-900 underline-offset-2 hover:underline dark:text-stone-100">
                                {row.externalOrderId}
                              </button>
                            </td>
                            <td className="px-3 py-3 text-xs text-stone-600 dark:text-stone-300">
                              <div>{row.customerName || "Unknown customer"}</div>
                              <div>{row.customerEmail || "Email unavailable"}</div>
                              <div>{row.customerPhone || "Phone unavailable"}</div>
                            </td>
                            <td className="px-3 py-3">
                              <button type="button" onClick={() => setSelectedOrder(row)} className="text-xs font-semibold text-stone-900 underline underline-offset-2 dark:text-stone-100">
                                View details
                              </button>
                            </td>
                            <td className="px-3 py-3">{row.totalItems}</td>
                            <td className="px-3 py-3">{money(row.totalValueInPaise, row.currency || activeCurrency)}</td>
                            <td className="px-3 py-3"><StatusPill label={row.status} /></td>
                            <td className="px-3 py-3 text-xs text-stone-500">{formatDisplayDate(row.orderDate)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </SectionCard>
            </div>
          ) : null}

          {channelSubTab === "returns" ? (
            <div className="space-y-4">
              <DateRangeFilter
                draft={returnsDraft}
                applied={returnsRange}
                allTimeBounds={channelAllTimeBounds}
                onDraftChange={setReturnsDraft}
                onApply={() => setReturnsRange(returnsDraft)}
                onQuick={(next) => {
                  setReturnsDraft(next);
                  setReturnsRange(next);
                }}
              />
              <SectionCard title="Returns" right={<p className="text-xs text-stone-500">{filteredReturns.length} returns</p>}>
                {filteredReturns.length === 0 ? (
                  <EmptyState message="No returns in this range." />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead className="border-b border-[#e8e2d9]" style={{ background: "linear-gradient(180deg, #f2ede5, #f9f7f4)" }}>
                        <tr>
                          {["Order", "Product", "Variant", "Qty", "Refund", "Status", "Date"].map((h) => (
                            <th key={h} className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8a7060]">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {filteredReturns.map((row) => (
                          <tr key={row.id} className="border-b border-[#f0ece6]">
                            <td className="px-3 py-3 font-mono text-xs">{row.externalOrderId}</td>
                            <td className="px-3 py-3 font-medium">{row.productName || "Unknown"}</td>
                            <td className="px-3 py-3 text-xs text-stone-600 dark:text-stone-300">{row.variantName || row.sku || "—"}</td>
                            <td className="px-3 py-3">{row.quantity}</td>
                            <td className="px-3 py-3">{money(row.refundedAmountInPaise ?? 0, row.currency || activeCurrency)}</td>
                            <td className="px-3 py-3"><StatusPill label={row.status} /></td>
                            <td className="px-3 py-3 text-xs text-stone-500">{formatDisplayDate(returnEventDate(row))}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </SectionCard>
            </div>
          ) : null}
        </>
      ) : null}

      {selectedOrder ? <OrderDetailModal order={selectedOrder} onClose={() => setSelectedOrder(null)} /> : null}
    </div>
  );
}
