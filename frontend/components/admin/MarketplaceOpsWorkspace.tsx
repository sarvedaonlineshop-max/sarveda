"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

import type {
  AmazonSpConnectionStatus,
  MarketplaceAnalyticsData,
  MarketplaceChannelCode,
  MarketplaceListingRow,
  MarketplaceOrderRow,
  MarketplaceOverviewData,
  MarketplaceReturnRow
} from "@/lib/admin-api";
import {
  fetchAmazonSpConnection,
  fetchMarketplaceAnalytics,
  fetchMarketplaceListings,
  fetchMarketplaceOrders,
  fetchMarketplaceOverview,
  fetchMarketplaceReturns
} from "@/lib/admin-api";
import { formatINRFromPaise } from "@/lib/money";

type ViewTab = "overview" | MarketplaceChannelCode;
type ChannelSubTab = "listings" | "orders" | "returns" | "performance";

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
  { id: "listings", label: "Listings" },
  { id: "orders", label: "Orders" },
  { id: "returns", label: "Returns" },
  { id: "performance", label: "Performance" }
];

function tone(label: string) {
  if (label.includes("DELIVER") || label === "ACTIVE" || label === "ok" || label === "CONNECTED") return "emerald";
  if (label.includes("RETURN") || label.includes("REFUND") || label === "watch" || label === "NOT CONFIGURED") return "amber";
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
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${badgeClass(label)}`}>
      {label.replace(/_/g, " ")}
    </span>
  );
}

function SectionCard({
  title,
  right,
  children
}: {
  title: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm dark:border-stone-700 dark:bg-stone-900">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-100 px-4 py-3 dark:border-stone-800">
        <h3 className="text-sm font-semibold text-stone-900 dark:text-stone-100">{title}</h3>
        {right}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function MetricCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-lg border border-stone-200 bg-white px-4 py-3 dark:border-stone-700 dark:bg-stone-900">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-stone-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-stone-900 dark:text-stone-100">{value}</p>
      {sub ? <p className="mt-1 text-xs text-stone-500">{sub}</p> : null}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <p className="py-8 text-center text-sm text-stone-500 dark:text-stone-400">{message}</p>
  );
}

export function MarketplaceOpsWorkspace() {
  const searchParams = useSearchParams();
  const initialChannel = searchParams.get("channel") as MarketplaceChannelCode | null;
  const initialSku = searchParams.get("sku") ?? "";

  const [activeTab, setActiveTab] = useState<ViewTab>(
    initialChannel && CHANNELS.some((c) => c.code === initialChannel) ? initialChannel : "overview"
  );
  const [channelSubTab, setChannelSubTab] = useState<ChannelSubTab>("listings");
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState(initialSku);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const [overview, setOverview] = useState<MarketplaceOverviewData | null>(null);
  const [listings, setListings] = useState<MarketplaceListingRow[]>([]);
  const [orders, setOrders] = useState<MarketplaceOrderRow[]>([]);
  const [returns, setReturns] = useState<MarketplaceReturnRow[]>([]);
  const [analytics, setAnalytics] = useState<MarketplaceAnalyticsData | null>(null);
  const [amazonConnection, setAmazonConnection] = useState<AmazonSpConnectionStatus | null>(null);

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
    void Promise.all([
      loadListings(activeChannel),
      loadOrders(activeChannel),
      loadReturns(activeChannel),
      loadAnalytics(activeChannel)
    ]);
  }, [activeChannel, search, from, to]);

  useEffect(() => {
    if (activeChannel !== "AMAZON") {
      setAmazonConnection(null);
      return;
    }
    void loadAmazonConnection();
  }, [activeChannel]);

  useEffect(() => {
    setChannelSubTab("listings");
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
    const data = await fetchMarketplaceListings({ channelCode: channel, search: search || undefined });
    setListings(data.items);
  }

  async function loadOrders(channel: MarketplaceChannelCode) {
    const data = await fetchMarketplaceOrders({
      channelCode: channel,
      search: search || undefined,
      from: from || undefined,
      to: to || undefined
    });
    setOrders(data.items);
  }

  async function loadReturns(channel: MarketplaceChannelCode) {
    const data = await fetchMarketplaceReturns({
      channelCode: channel,
      search: search || undefined,
      from: from || undefined,
      to: to || undefined
    });
    setReturns(data.items);
  }

  async function loadAnalytics(channel: MarketplaceChannelCode) {
    const data = await fetchMarketplaceAnalytics({
      channelCode: channel,
      from: from || undefined,
      to: to || undefined
    });
    setAnalytics(data);
  }

  async function loadAmazonConnection() {
    try {
      setAmazonConnection(await fetchAmazonSpConnection());
    } catch {
      setAmazonConnection(null);
    }
  }

  return (
    <div className="mx-auto max-w-[1440px] space-y-5">
      <div className="border-b border-stone-200 pb-4 dark:border-stone-700">
        <h1 className="text-2xl font-semibold tracking-tight text-stone-900 dark:text-stone-100">Marketplace Operations</h1>
        <p className="mt-1 text-sm text-stone-500">
          Data auto-pulls from connected marketplaces. Pick a channel, then use the tabs below.
        </p>
      </div>

      <div className="flex flex-wrap gap-6 border-b border-stone-200 dark:border-stone-700">
        <button
          type="button"
          onClick={() => setActiveTab("overview")}
          className={`border-b-2 px-1 pb-3 text-sm font-medium ${activeTab === "overview" ? "border-stone-900 text-stone-900 dark:border-stone-100 dark:text-stone-100" : "border-transparent text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-200"}`}
        >
          Overview
        </button>
        {CHANNELS.map((item) => (
          <button
            key={item.code}
            type="button"
            onClick={() => setActiveTab(item.code)}
            className={`border-b-2 px-1 pb-3 text-sm font-medium ${activeTab === item.code ? "border-stone-900 text-stone-900 dark:border-stone-100 dark:text-stone-100" : "border-transparent text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-200"}`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">
          {error}
        </div>
      ) : null}

      {activeTab === "overview" && overview ? (
        <div className="space-y-5">
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
                    <div>
                      <p className="text-stone-500">Listings</p>
                      <p className="font-semibold">
                        {row.activeListingCount}/{row.listingCount}
                      </p>
                    </div>
                    <div>
                      <p className="text-stone-500">Orders</p>
                      <p className="font-semibold">{row.orderCount}</p>
                    </div>
                    <div>
                      <p className="text-stone-500">Pending dispatch</p>
                      <p className="font-semibold">{row.dispatchPending}</p>
                    </div>
                    <div>
                      <p className="text-stone-500">High stock risk</p>
                      <p className="font-semibold">{row.highRiskCount}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>
        </div>
      ) : null}

      {activeChannel ? (
        <>
          <div className="flex flex-wrap items-end justify-between gap-4 rounded-xl border border-stone-200 bg-white p-4 shadow-sm dark:border-stone-700 dark:bg-stone-900">
            <div className="grid flex-1 gap-3 md:grid-cols-3">
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-stone-500">Search</label>
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={`Search ${activeChannelLabel}`}
                  className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm dark:border-stone-700 dark:bg-stone-950"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-stone-500">From</label>
                <input
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm dark:border-stone-700 dark:bg-stone-950"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-stone-500">To</label>
                <input
                  type="date"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm dark:border-stone-700 dark:bg-stone-950"
                />
              </div>
            </div>
            {activeChannel === "AMAZON" && amazonConnection ? (
              <div className="flex flex-wrap items-center gap-2 pb-1">
                <StatusPill label={amazonConnection.configured ? "CONNECTED" : "NOT CONFIGURED"} />
                {amazonConnection.autoSyncEnabled ? <StatusPill label="AUTO SYNC" /> : null}
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-4 border-b border-stone-200 dark:border-stone-700">
            {SUB_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setChannelSubTab(tab.id)}
                className={`border-b-2 px-1 pb-2.5 text-sm font-medium ${channelSubTab === tab.id ? "border-stone-900 text-stone-900 dark:border-stone-100 dark:text-stone-100" : "border-transparent text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-200"}`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {channelSubTab === "listings" ? (
            <SectionCard title={`${activeChannelLabel} listings`} right={<p className="text-xs text-stone-500">{listings.length} tracked</p>}>
              {listings.length === 0 ? (
                <EmptyState message="No listings yet. They will appear after the next auto-sync." />
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="border-b border-stone-200 bg-stone-50 dark:border-stone-700 dark:bg-stone-800/60">
                      <tr>
                        {["SKU", "Product", "Listing ID", "Seller SKU", "Status", "Zoho stock", "30d sold", "30d returns"].map((h) => (
                          <th key={h} className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-stone-500">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {listings.map((row) => (
                        <tr key={row.id} className="border-b border-stone-100 dark:border-stone-800">
                          <td className="px-3 py-3 font-mono text-xs">{row.variant.sku}</td>
                          <td className="px-3 py-3">
                            <div className="font-medium text-stone-900 dark:text-stone-100">{row.variant.productName}</div>
                            <div className="text-xs text-stone-500">{row.variant.productSlug}</div>
                          </td>
                          <td className="px-3 py-3 text-xs">{row.listingId || "—"}</td>
                          <td className="px-3 py-3 font-mono text-xs">{row.sellerSku || row.externalSku || "—"}</td>
                          <td className="px-3 py-3">
                            <StatusPill label={row.status} />
                          </td>
                          <td className="px-3 py-3">
                            <div className="font-semibold">{row.available}</div>
                            <div className="text-xs text-stone-500">
                              On hand {row.zohoOnHand} · Reserved {row.zohoReserved}
                            </div>
                          </td>
                          <td className="px-3 py-3">{row.recentSoldQty}</td>
                          <td className="px-3 py-3">{row.recentReturnQty}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </SectionCard>
          ) : null}

          {channelSubTab === "orders" ? (
            <SectionCard title={`${activeChannelLabel} orders`} right={<p className="text-xs text-stone-500">{orders.length} orders</p>}>
              {orders.length === 0 ? (
                <EmptyState message="No orders in this date range. New Amazon orders auto-pull every ~15 minutes." />
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="border-b border-stone-200 bg-stone-50 dark:border-stone-700 dark:bg-stone-800/60">
                      <tr>
                        {["Order", "Customer", "Items", "Value", "Status", "Date"].map((h) => (
                          <th key={h} className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-stone-500">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {orders.map((row) => (
                        <tr key={row.id} className="border-b border-stone-100 dark:border-stone-800">
                          <td className="px-3 py-3">
                            <div className="font-medium text-stone-900 dark:text-stone-100">{row.externalOrderId}</div>
                            <div className="text-xs text-stone-500">{row.items.map((i) => i.skuSnapshot).join(", ")}</div>
                          </td>
                          <td className="px-3 py-3 text-xs text-stone-600 dark:text-stone-300">
                            {row.customerName || row.customerEmail || "Unknown"}
                          </td>
                          <td className="px-3 py-3">{row.totalItems}</td>
                          <td className="px-3 py-3">{formatINRFromPaise(row.totalValueInPaise)}</td>
                          <td className="px-3 py-3">
                            <StatusPill label={row.status} />
                          </td>
                          <td className="px-3 py-3 text-xs text-stone-500">
                            {new Date(row.orderDate).toLocaleDateString("en-IN")}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </SectionCard>
          ) : null}

          {channelSubTab === "returns" ? (
            <SectionCard title={`${activeChannelLabel} returns`} right={<p className="text-xs text-stone-500">{returns.length} returns</p>}>
              {returns.length === 0 ? (
                <EmptyState message="No returns in this date range." />
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="border-b border-stone-200 bg-stone-50 dark:border-stone-700 dark:bg-stone-800/60">
                      <tr>
                        {["Order", "Item", "Qty", "Refund", "Restocked", "Status"].map((h) => (
                          <th key={h} className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-stone-500">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {returns.map((row) => (
                        <tr key={row.id} className="border-b border-stone-100 dark:border-stone-800">
                          <td className="px-3 py-3">{row.externalOrderId}</td>
                          <td className="px-3 py-3 text-xs text-stone-600 dark:text-stone-300">
                            {row.productName || row.sku || "Unknown"}
                          </td>
                          <td className="px-3 py-3">{row.quantity}</td>
                          <td className="px-3 py-3">{formatINRFromPaise(row.refundedAmountInPaise ?? 0)}</td>
                          <td className="px-3 py-3">{row.restockedToZoho ? "Yes" : "No"}</td>
                          <td className="px-3 py-3">
                            <StatusPill label={row.status} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </SectionCard>
          ) : null}

          {channelSubTab === "performance" && analytics ? (
            <div className="space-y-5">
              <div className="grid gap-3 md:grid-cols-4">
                <MetricCard label="Orders" value={analytics.totals.orders} />
                <MetricCard label="Units sold" value={analytics.totals.unitsSold} />
                <MetricCard label="Returns" value={analytics.totals.returns} />
                <MetricCard label="Refund value" value={formatINRFromPaise(analytics.totals.refundValueInPaise)} />
              </div>
              <SectionCard title={`${activeChannelLabel} performance`}>
                <div className="grid gap-5 xl:grid-cols-2">
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead className="border-b border-stone-200 bg-stone-50 dark:border-stone-700 dark:bg-stone-800/60">
                        <tr>
                          {["Orders", "Units", "Value", "Returns", "Refunds", "Pending dispatch"].map((h) => (
                            <th key={h} className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-stone-500">
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {analytics.byChannel.map((row) => (
                          <tr key={row.channelId} className="border-b border-stone-100 dark:border-stone-800">
                            <td className="px-3 py-3">{row.orders}</td>
                            <td className="px-3 py-3">{row.unitsSold}</td>
                            <td className="px-3 py-3">{formatINRFromPaise(row.orderValueInPaise)}</td>
                            <td className="px-3 py-3">{row.returnQty}</td>
                            <td className="px-3 py-3">{formatINRFromPaise(row.refundValueInPaise)}</td>
                            <td className="px-3 py-3">{row.pendingDispatch}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead className="border-b border-stone-200 bg-stone-50 dark:border-stone-700 dark:bg-stone-800/60">
                        <tr>
                          {["SKU", "Product", "Units", "Value"].map((h) => (
                            <th key={h} className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-stone-500">
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {analytics.topSkus.length === 0 ? (
                          <tr>
                            <td colSpan={4} className="px-3 py-6 text-center text-sm text-stone-500">
                              No sales data for this range.
                            </td>
                          </tr>
                        ) : (
                          analytics.topSkus.map((row) => (
                            <tr key={row.sku} className="border-b border-stone-100 dark:border-stone-800">
                              <td className="px-3 py-3 font-mono text-xs">{row.sku}</td>
                              <td className="px-3 py-3">{row.productName || "Unknown"}</td>
                              <td className="px-3 py-3">{row.unitsSold}</td>
                              <td className="px-3 py-3">{formatINRFromPaise(row.orderValueInPaise)}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </SectionCard>
            </div>
          ) : null}

          {channelSubTab === "performance" && !analytics ? (
            <EmptyState message="Loading performance data…" />
          ) : null}
        </>
      ) : null}
    </div>
  );
}
