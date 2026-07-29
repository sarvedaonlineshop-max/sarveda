"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

import type {
  AmazonSpConnectionStatus,
  AmazonSyncAllResult,
  FlipkartConnectionStatus,
  MarketplaceChannelCode,
  MarketplaceListingRow,
  MarketplaceOrderRow,
  MarketplaceOverviewData,
  MarketplaceReturnRow
} from "@/lib/admin-api";
import {
  fetchAmazonSpConnection,
  fetchFlipkartConnection,
  fetchMarketplaceListings,
  fetchMarketplaceOrders,
  fetchMarketplaceOverview,
  fetchMarketplaceReturns,
  syncAmazonMarketplaceAll,
  syncFlipkartMarketplaceAll
} from "@/lib/admin-api";
import { formatINRFromPaise } from "@/lib/money";

type ViewTab = "overview" | MarketplaceChannelCode;
type ChannelSubTab = "overview" | "listings" | "orders" | "returns";
type RangePreset = "today" | "week" | "month" | "all";
type ListingSort =
  | "sold_desc"
  | "sold_asc"
  | "returns_desc"
  | "returns_asc"
  | "stock_desc"
  | "stock_asc";

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
  if (t === "emerald") return "bg-emerald-50 text-emerald-800 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900";
  if (t === "amber") return "bg-amber-50 text-amber-900 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-200 dark:ring-amber-900";
  if (t === "red") return "bg-red-50 text-red-800 ring-red-200 dark:bg-red-950/40 dark:text-red-200 dark:ring-red-900";
  return "bg-stone-100 text-stone-700 ring-stone-200 dark:bg-stone-800 dark:text-stone-200 dark:ring-stone-700";
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
    <section className="overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm dark:border-stone-700 dark:bg-stone-900">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-100 px-4 py-3 dark:border-stone-800">
        <h3 className="text-sm font-semibold text-stone-900 dark:text-stone-100">{title}</h3>
        {right}
      </div>
      <div className={compact ? "p-3" : "p-4"}>{children}</div>
    </section>
  );
}

function MetricCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-lg border border-stone-200 bg-white px-4 py-3 dark:border-stone-700 dark:bg-stone-900">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-500">{label}</p>
      <p className="mt-1 text-xl font-semibold text-stone-900 dark:text-stone-100">{value}</p>
      {sub ? <p className="mt-1 text-xs text-stone-500">{sub}</p> : null}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return <p className="py-8 text-center text-sm text-stone-500 dark:text-stone-400">{message}</p>;
}

function startOfDay(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function daysAgo(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return startOfDay(d);
}

function inRange(dateIso: string, preset: RangePreset) {
  const when = new Date(dateIso);
  if (preset === "all") return true;
  const start =
    preset === "today"
      ? startOfDay(new Date())
      : preset === "week"
        ? daysAgo(6)
        : daysAgo(29);
  return when >= start;
}

function truncateLabel(value: string, max = 34) {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function relativeDate(dateIso: string) {
  const now = Date.now();
  const then = new Date(dateIso).getTime();
  const diffMs = now - then;
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  if (hours < 24) return `${Math.max(1, hours)} hours ago`;
  if (hours < 48) return "Yesterday";
  return new Date(dateIso).toLocaleDateString("en-IN");
}

function copyText(value: string) {
  void navigator.clipboard.writeText(value);
}

function ChartBars({
  title,
  rows,
  valueFormatter = (v: number) => String(v),
  accent = "bg-stone-900"
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
              <div className="text-[11px] text-stone-500">{row.label}</div>
              <div>
                <div className="h-2.5 overflow-hidden rounded-full bg-stone-100 dark:bg-stone-800">
                  <div className={`h-full rounded-full ${accent}`} style={{ width: `${Math.max(4, Math.round((row.value / max) * 100))}%` }} />
                </div>
                {row.sub ? <div className="mt-1 truncate text-[11px] text-stone-500">{row.sub}</div> : null}
              </div>
              <div className="text-right text-[11px] font-semibold text-stone-700 dark:text-stone-200">{valueFormatter(row.value)}</div>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

function OrderDetailModal({
  order,
  onClose
}: {
  order: MarketplaceOrderRow;
  onClose: () => void;
}) {
  const subtotal = order.items.reduce((sum, item) => sum + (item.lineTotalInPaise ?? (item.unitPriceInPaise ?? 0) * item.quantity), 0);
  const rawOrder = (order.rawPayload?.order ?? {}) as { OrderTotal?: { Amount?: string; CurrencyCode?: string } };
  const grandTotal = rawOrder.OrderTotal?.Amount ? Math.round(Number(rawOrder.OrderTotal.Amount) * 100) : order.totalValueInPaise;
  const delta = Math.max(0, grandTotal - subtotal);
  return (
    <div className="fixed inset-0 z-[140] flex items-center justify-center bg-black/40 px-4">
      <div className="max-h-[85vh] w-full max-w-3xl overflow-auto rounded-2xl bg-white shadow-2xl dark:bg-stone-900">
        <div className="sticky top-0 flex items-center justify-between border-b border-stone-200 bg-white px-5 py-4 dark:border-stone-700 dark:bg-stone-900">
          <div>
            <p className="text-sm font-semibold text-stone-900 dark:text-stone-100">Order details</p>
            <p className="mt-1 text-xs text-stone-500">{order.externalOrderId}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-md border border-stone-200 px-3 py-1.5 text-xs font-medium dark:border-stone-700">
            Close
          </button>
        </div>

        <div className="space-y-5 p-5 text-sm">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-lg border border-stone-200 p-4 dark:border-stone-700">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">Customer details</p>
              <div className="mt-2 space-y-1 text-sm text-stone-700 dark:text-stone-200">
                <p>{order.customerName || "Unknown"}</p>
                <p>{order.customerEmail || "Email not returned"}</p>
                <p>{order.customerPhone || "Phone not returned"}</p>
                <p>{[order.shipToCity, order.shipToState, order.shipToPostalCode].filter(Boolean).join(", ") || "Address not returned"}</p>
              </div>
            </div>
            <div className="rounded-lg border border-stone-200 p-4 dark:border-stone-700">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">Order summary</p>
              <div className="mt-2 space-y-1 text-sm text-stone-700 dark:text-stone-200">
                <p>Status: {order.status}</p>
                <p>Date: {new Date(order.orderDate).toLocaleString("en-IN")}</p>
                <p>Item count: {order.totalItems}</p>
                <p>Order total: {formatINRFromPaise(grandTotal)}</p>
              </div>
            </div>
          </div>

          <SectionCard title="Items in this order">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="border-b border-stone-200 bg-stone-50 dark:border-stone-700 dark:bg-stone-800/60">
                  <tr>
                    {["Product", "Variant", "SKU", "Qty", "Unit", "Line total"].map((h) => (
                      <th key={h} className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-stone-500">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {order.items.map((item) => (
                    <tr key={item.id} className="border-b border-stone-100 dark:border-stone-800">
                      <td className="px-3 py-3">{item.productName || item.productNameSnapshot || "Unknown"}</td>
                      <td className="px-3 py-3 text-xs text-stone-500">{item.variantName || "Default"}</td>
                      <td className="px-3 py-3 font-mono text-xs">{item.variantSku || item.skuSnapshot}</td>
                      <td className="px-3 py-3">{item.quantity}</td>
                      <td className="px-3 py-3">{item.unitPriceInPaise ? formatINRFromPaise(item.unitPriceInPaise) : "—"}</td>
                      <td className="px-3 py-3">{formatINRFromPaise(item.lineTotalInPaise ?? (item.unitPriceInPaise ?? 0) * item.quantity)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>

          <div className="grid gap-3 md:grid-cols-2">
            <MetricCard label="Items subtotal" value={formatINRFromPaise(subtotal)} />
            <MetricCard label="Grand total" value={formatINRFromPaise(grandTotal)} sub={delta > 0 ? `Includes approx. ${formatINRFromPaise(delta)} extra charges` : "No separate extra charges visible"} />
          </div>
          <div className="rounded-lg border border-stone-200 bg-stone-50 px-4 py-3 text-xs text-stone-600 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-300">
            GST and shipping are not separately broken out by Amazon in the current payload we receive. If Amazon includes them,
            they are bundled into the order total unless richer financial APIs are added later.
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
  const [overview, setOverview] = useState<MarketplaceOverviewData | null>(null);
  const [listings, setListings] = useState<MarketplaceListingRow[]>([]);
  const [orders, setOrders] = useState<MarketplaceOrderRow[]>([]);
  const [returns, setReturns] = useState<MarketplaceReturnRow[]>([]);
  const [amazonConnection, setAmazonConnection] = useState<AmazonSpConnectionStatus | null>(null);
  const [amazonLastSync, setAmazonLastSync] = useState<AmazonSyncAllResult | null>(null);
  const [flipkartConnection, setFlipkartConnection] = useState<FlipkartConnectionStatus | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<MarketplaceOrderRow | null>(null);

  const [listingSearch, setListingSearch] = useState("");
  const [listingSort, setListingSort] = useState<ListingSort>("sold_desc");
  const [ordersPreset, setOrdersPreset] = useState<RangePreset>("week");
  const [returnsPreset, setReturnsPreset] = useState<RangePreset>("month");
  const [overviewPreset, setOverviewPreset] = useState<RangePreset>("week");

  const activeChannel = activeTab === "overview" ? null : activeTab;
  const activeChannelLabel = useMemo(
    () => CHANNELS.find((c) => c.code === activeChannel)?.label ?? "Marketplace",
    [activeChannel]
  );

  useEffect(() => {
    void loadOverview();
  }, []);

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
  }, [activeChannel]);

  useEffect(() => {
    setChannelSubTab("overview");
    setListingSearch("");
    setListingSort("sold_desc");
    setOrdersPreset("week");
    setReturnsPreset("month");
    setOverviewPreset("week");
  }, [activeChannel]);

  async function loadOverview() {
    try {
      setError(null);
      setOverview(await fetchMarketplaceOverview());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load overview");
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

  async function runAmazonManualSync() {
    setBusy("amazon-sync");
    setError(null);
    try {
      const result = await syncAmazonMarketplaceAll({ daysBack: 30, includeShipped: true, maxPages: 25 });
      setAmazonLastSync(result);
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

  const filteredOrders = useMemo(() => orders.filter((row) => inRange(row.orderDate, ordersPreset)), [orders, ordersPreset]);
  const filteredReturns = useMemo(() => {
    const source = returns.filter((row) => inRange(row.createdAt, returnsPreset));
    return source;
  }, [returns, returnsPreset]);

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

  const overviewOrders = useMemo(() => orders.filter((row) => inRange(row.orderDate, overviewPreset)), [orders, overviewPreset]);
  const overviewReturns = useMemo(() => returns.filter((row) => inRange(row.createdAt, overviewPreset)), [returns, overviewPreset]);

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
        : `${currentSales} orders were placed in the selected period with ${currentReturns} returned units and ${formatINRFromPaise(refundValue)} in refunds.`
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
  }, [overviewOrders, overviewReturns, topSellingRows]);

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
      const key = new Date(ret.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
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
      const key = new Date(ret.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
      if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + Math.round((ret.refundedAmountInPaise ?? 0) / 100));
    }
    return Array.from(buckets.entries()).map(([label, value]) => ({ label, value }));
  }, [overviewReturns]);

  return (
    <div className="mx-auto max-w-[1440px] space-y-4 pt-2">
      <div className="border-b border-stone-200 pb-3 dark:border-stone-700">
        <h1 className="text-[28px] font-semibold tracking-tight text-stone-900 dark:text-stone-100">Marketplace Operations</h1>
      </div>

      <div className="flex flex-wrap gap-5 border-b border-stone-200 dark:border-stone-700">
        <button
          type="button"
          onClick={() => setActiveTab("overview")}
          className={`border-b-2 px-1 pb-2 text-sm font-medium ${activeTab === "overview" ? "border-stone-900 text-stone-900 dark:border-stone-100 dark:text-stone-100" : "border-transparent text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-200"}`}
        >
          Overview
        </button>
        {CHANNELS.map((item) => (
          <button
            key={item.code}
            type="button"
            onClick={() => setActiveTab(item.code)}
            className={`border-b-2 px-1 pb-2 text-sm font-medium ${activeTab === item.code ? "border-stone-900 text-stone-900 dark:border-stone-100 dark:text-stone-100" : "border-transparent text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-200"}`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {error ? <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">{error}</div> : null}

      {activeTab === "overview" && overview ? (
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-4">
            <MetricCard label="Channels" value={overview.totals.channels} />
            <MetricCard label="Listings" value={overview.totals.listings} />
            <MetricCard label="Orders tracked" value={overview.totals.orders} />
            <MetricCard label="Returns tracked" value={overview.totals.returns} />
          </div>
          <SectionCard title="Marketplace snapshot">
            <div className="grid gap-3 lg:grid-cols-3">
              {overview.channels.map((row) => (
                <div key={row.id} className="rounded-lg border border-stone-200 p-4 dark:border-stone-700">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold text-stone-900 dark:text-stone-100">{row.displayName}</p>
                    <StatusPill label={row.isActive ? "ACTIVE" : "PAUSED"} />
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                    <div><p className="text-stone-500">Listings</p><p className="font-semibold">{row.activeListingCount}/{row.listingCount}</p></div>
                    <div><p className="text-stone-500">Orders</p><p className="font-semibold">{row.orderCount}</p></div>
                    <div><p className="text-stone-500">Pending dispatch</p><p className="font-semibold">{row.dispatchPending}</p></div>
                    <div><p className="text-stone-500">High stock risk</p><p className="font-semibold">{row.highRiskCount}</p></div>
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>
        </div>
      ) : null}

      {activeChannel ? (
        <>
          <div className="flex items-center justify-between border-b border-stone-200 dark:border-stone-700">
            <div className="flex flex-wrap gap-4">
              {SUB_TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setChannelSubTab(tab.id)}
                  className={`border-b-2 px-1 pb-2 text-sm font-medium ${channelSubTab === tab.id ? "border-stone-900 text-stone-900 dark:border-stone-100 dark:text-stone-100" : "border-transparent text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-200"}`}
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
                className="mb-1 rounded-lg bg-stone-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50 dark:bg-stone-100 dark:text-stone-900"
              >
                {busy === "amazon-sync" ? "Syncing..." : "Sync now"}
              </button>
            ) : activeChannel === "FLIPKART" ? (
              <button
                type="button"
                onClick={() => void runFlipkartManualSync()}
                disabled={busy === "flipkart-sync" || flipkartConnection?.configured === false}
                className="mb-1 rounded-lg bg-stone-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50 dark:bg-stone-100 dark:text-stone-900"
              >
                {busy === "flipkart-sync" ? "Syncing..." : "Sync now"}
              </button>
            ) : null}
          </div>

          {channelSubTab === "overview" ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-stone-200 bg-white px-4 py-3 shadow-sm dark:border-stone-700 dark:bg-stone-900">
                <div className="flex flex-wrap items-center gap-2">
                  {(["today", "week", "month", "all"] as RangePreset[]).map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setOverviewPreset(preset)}
                      className={`rounded-full px-3 py-1.5 text-xs font-medium ${overviewPreset === preset ? "bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900" : "bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300"}`}
                    >
                      {preset === "week" ? "Last week" : preset === "month" ? "Last month" : preset === "all" ? "All time" : "Today"}
                    </button>
                  ))}
                </div>
                <div className="text-xs text-stone-500">
                  Auto sync refresh: orders ~15 min, listings/returns ~3 hours. Amazon does not provide a simple all-events webhook;
                  production integrations typically rely on SP-API polling or SNS/SQS notifications, so manual sync is kept as a
                  backstop.
                </div>
              </div>

              <SectionCard title={`${activeChannelLabel} weekly conclusion`}>
                <div className="space-y-3">
                  {overviewConclusion.map((line) => (
                    <div key={line} className="rounded-lg border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-700 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-200">
                      {line}
                    </div>
                  ))}
                  {amazonLastSync ? (
                    <div className="rounded-lg border border-stone-200 px-4 py-3 text-xs text-stone-500 dark:border-stone-700">
                      Last manual sync scanned {amazonLastSync.orders.fetched} orders, {amazonLastSync.listings.rows} listings, and {amazonLastSync.returns.rows} returns.
                    </div>
                  ) : null}
                </div>
              </SectionCard>

              <div className="grid gap-3 md:grid-cols-4">
                <MetricCard label="Orders" value={overviewOrders.length} />
                <MetricCard label="Returned units" value={overviewReturns.reduce((sum, row) => sum + row.quantity, 0)} />
                <MetricCard label="Refund value" value={formatINRFromPaise(overviewReturns.reduce((sum, row) => sum + (row.refundedAmountInPaise ?? 0), 0))} />
                <MetricCard label="Top seller" value={topSellingRows[0]?.label || "—"} sub={topSellingRows[0] ? truncateLabel(`${topSellingRows[0].productName} / ${topSellingRows[0].variantName}`, 44) : undefined} />
              </div>

              <div className="grid gap-4 xl:grid-cols-2">
                <ChartBars title="Orders placed" rows={ordersByDay} />
                <ChartBars title="Returns" rows={returnsByDay} accent="bg-amber-500" />
                <ChartBars title="Refunds" rows={refundsByDay} valueFormatter={(v) => `₹${v}`} accent="bg-red-500" />
                <ChartBars
                  title="Top 10 sellers"
                  rows={topSellingRows.map((row) => ({
                    label: truncateLabel(row.label, 12),
                    value: row.units,
                    sub: truncateLabel(`${row.productName} / ${row.variantName}`, 48)
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
                  <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-stone-500">Search</label>
                  <input value={listingSearch} onChange={(e) => setListingSearch(e.target.value)} placeholder="Search product, variant, SKU, listing ID" className="w-full rounded-lg border border-stone-200 px-3 py-2 text-sm dark:border-stone-700 dark:bg-stone-950" />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-stone-500">Sort</label>
                  <select value={listingSort} onChange={(e) => setListingSort(e.target.value as ListingSort)} className="w-full rounded-lg border border-stone-200 px-3 py-2 text-sm dark:border-stone-700 dark:bg-stone-950">
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
                      <thead className="border-b border-stone-200 bg-stone-50 dark:border-stone-700 dark:bg-stone-800/60">
                        <tr>
                          {["Product name", "Variant name", "SKU", "Listing ID", "Stock Count", "Status", "Price", "Sold count", "Return count"].map((h) => (
                            <th key={h} className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-stone-500">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {filteredListings.map((row) => (
                          <tr key={row.id} className="border-b border-stone-100 dark:border-stone-800">
                            <td className="px-3 py-3">{row.variant.productName}</td>
                            <td className="px-3 py-3 text-xs text-stone-600 dark:text-stone-300">{row.variant.variantName}</td>
                            <td className="px-3 py-3 font-mono text-xs">{row.variant.sku}</td>
                            <td className="px-3 py-3 font-mono text-xs">{row.listingId || "—"}</td>
                            <td className="px-3 py-3">{row.zohoOnHand}</td>
                            <td className="px-3 py-3"><StatusPill label={row.status} /></td>
                            <td className="px-3 py-3">{row.priceInPaise ? formatINRFromPaise(row.priceInPaise) : "—"}</td>
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
              <div className="flex flex-wrap gap-2 rounded-xl border border-stone-200 bg-white p-4 shadow-sm dark:border-stone-700 dark:bg-stone-900">
                {(["today", "week", "month", "all"] as RangePreset[]).map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setOrdersPreset(preset)}
                    className={`rounded-full px-3 py-1.5 text-xs font-medium ${ordersPreset === preset ? "bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900" : "bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300"}`}
                  >
                    {preset === "week" ? "Last week" : preset === "month" ? "Last month" : preset === "all" ? "All time" : "Today"}
                  </button>
                ))}
              </div>
              <SectionCard title="Orders" right={<p className="text-xs text-stone-500">{filteredOrders.length} orders</p>}>
                {filteredOrders.length === 0 ? (
                  <EmptyState message="No orders in this range." />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead className="border-b border-stone-200 bg-stone-50 dark:border-stone-700 dark:bg-stone-800/60">
                        <tr>
                          {["Order ID", "Customer details", "Order details", "Item Count", "Order Total", "Status", "Date"].map((h) => (
                            <th key={h} className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-stone-500">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {filteredOrders.map((row) => (
                          <tr key={row.id} className="border-b border-stone-100 dark:border-stone-800">
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
                            <td className="px-3 py-3">{formatINRFromPaise(row.totalValueInPaise)}</td>
                            <td className="px-3 py-3"><StatusPill label={row.status} /></td>
                            <td className="px-3 py-3 text-xs text-stone-500">{relativeDate(row.orderDate)}</td>
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
              <div className="flex flex-wrap gap-2 rounded-xl border border-stone-200 bg-white p-4 shadow-sm dark:border-stone-700 dark:bg-stone-900">
                {(["today", "week", "month", "all"] as RangePreset[]).map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setReturnsPreset(preset)}
                    className={`rounded-full px-3 py-1.5 text-xs font-medium ${returnsPreset === preset ? "bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900" : "bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300"}`}
                  >
                    {preset === "week" ? "Last week" : preset === "month" ? "Last month" : preset === "all" ? "All time" : "Today"}
                  </button>
                ))}
              </div>
              <SectionCard title="Returns" right={<p className="text-xs text-stone-500">{filteredReturns.length} returns</p>}>
                {filteredReturns.length === 0 ? (
                  <EmptyState message="No returns in this range." />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead className="border-b border-stone-200 bg-stone-50 dark:border-stone-700 dark:bg-stone-800/60">
                        <tr>
                          {["Order", "Product", "Variant", "Qty", "Refund", "Status", "Date"].map((h) => (
                            <th key={h} className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-stone-500">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {filteredReturns.map((row) => (
                          <tr key={row.id} className="border-b border-stone-100 dark:border-stone-800">
                            <td className="px-3 py-3 font-mono text-xs">{row.externalOrderId}</td>
                            <td className="px-3 py-3">{row.productName || "Unknown"}</td>
                            <td className="px-3 py-3 text-xs text-stone-600 dark:text-stone-300">{row.variantName || "Default"}</td>
                            <td className="px-3 py-3">{row.quantity}</td>
                            <td className="px-3 py-3">{formatINRFromPaise(row.refundedAmountInPaise ?? 0)}</td>
                            <td className="px-3 py-3"><StatusPill label={row.status} /></td>
                            <td className="px-3 py-3 text-xs text-stone-500">{relativeDate(row.createdAt)}</td>
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
