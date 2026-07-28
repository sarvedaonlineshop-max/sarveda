"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

import type {
  AmazonSyncAllResult,
  AmazonSpConnectionStatus,
  MarketplaceAnalyticsData,
  MarketplaceChannelCode,
  MarketplaceInboxEvent,
  MarketplaceListingRow,
  MarketplaceOrderRow,
  MarketplaceOverviewData,
  MarketplaceReturnRow
} from "@/lib/admin-api";
import {
  createMarketplaceEmailIngest,
  createMarketplaceOrder,
  createMarketplaceReturn,
  fetchAmazonSpConnection,
  fetchMarketplaceAnalytics,
  fetchMarketplaceInbox,
  fetchMarketplaceListings,
  fetchMarketplaceOrders,
  fetchMarketplaceOverview,
  fetchMarketplaceReturns,
  importMarketplaceOrdersCsv,
  patchMarketplaceListing,
  syncAmazonMarketplaceAll,
  upsertMarketplaceListing
} from "@/lib/admin-api";
import { formatINRFromPaise } from "@/lib/money";

type ViewTab = "overview" | MarketplaceChannelCode;

const CHANNELS: Array<{ code: MarketplaceChannelCode; label: string }> = [
  { code: "AMAZON", label: "Amazon" },
  { code: "FLIPKART", label: "Flipkart" },
  { code: "ETSY", label: "Etsy" },
  { code: "AMALA", label: "Amala" },
  { code: "FIRSTCRY", label: "FirstCry" },
  { code: "TATA_1MG", label: "Tata 1mg" },
  { code: "SARVEDA", label: "Sarveda" }
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

export function MarketplaceOpsWorkspace() {
  const searchParams = useSearchParams();
  const initialChannel = searchParams.get("channel") as MarketplaceChannelCode | null;
  const initialSku = searchParams.get("sku") ?? "";

  const [activeTab, setActiveTab] = useState<ViewTab>(
    initialChannel && CHANNELS.some((c) => c.code === initialChannel) ? initialChannel : "overview"
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState(initialSku);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const [overview, setOverview] = useState<MarketplaceOverviewData | null>(null);
  const [listings, setListings] = useState<MarketplaceListingRow[]>([]);
  const [orders, setOrders] = useState<MarketplaceOrderRow[]>([]);
  const [returns, setReturns] = useState<MarketplaceReturnRow[]>([]);
  const [analytics, setAnalytics] = useState<MarketplaceAnalyticsData | null>(null);
  const [inbox, setInbox] = useState<MarketplaceInboxEvent[]>([]);

  const [listingDrafts, setListingDrafts] = useState<
    Record<string, { listingId: string; externalSku: string; sellerSku: string; notes: string; status: MarketplaceListingRow["status"]; isTracked: boolean }>
  >({});

  const activeChannel = activeTab === "overview" ? null : activeTab;
  const activeChannelLabel = useMemo(
    () => CHANNELS.find((c) => c.code === activeChannel)?.label ?? "Marketplace",
    [activeChannel]
  );

  const [newListingForm, setNewListingForm] = useState({
    sku: initialSku,
    listingId: "",
    externalSku: "",
    sellerSku: "",
    notes: ""
  });
  const [orderForm, setOrderForm] = useState({
    externalOrderId: "",
    orderDate: new Date().toISOString().slice(0, 10),
    sku: initialSku,
    quantity: "1",
    customerName: "",
    customerEmail: "",
    shipToCity: "",
    unitPriceInPaise: "",
    productName: ""
  });
  const [returnForm, setReturnForm] = useState({
    marketplaceOrderId: "",
    marketplaceOrderItemId: "",
    quantity: "1",
    reason: "",
    refundedAmountInPaise: "",
    restockedToZoho: false
  });
  const [importText, setImportText] = useState("");
  const [emailForm, setEmailForm] = useState({
    subject: "",
    bodyText: "",
    dedupeKey: ""
  });
  const [amazonConnection, setAmazonConnection] = useState<AmazonSpConnectionStatus | null>(null);
  const [amazonDaysBack, setAmazonDaysBack] = useState("30");
  const [amazonIncludeShipped, setAmazonIncludeShipped] = useState(false);
  const [amazonLastSync, setAmazonLastSync] = useState<AmazonSyncAllResult | null>(null);

  useEffect(() => {
    void loadOverview();
  }, []);

  useEffect(() => {
    if (!activeChannel) return;
    void Promise.all([loadListings(activeChannel), loadOrders(activeChannel), loadReturns(activeChannel), loadAnalytics(activeChannel), loadInbox(activeChannel)]);
  }, [activeChannel, search, from, to]);

  useEffect(() => {
    if (activeChannel !== "AMAZON") {
      setAmazonConnection(null);
      return;
    }
    void loadAmazonConnection();
  }, [activeChannel]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(timer);
  }, [toast]);

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
    const drafts: typeof listingDrafts = {};
    for (const row of data.items) {
      drafts[row.id] = {
        listingId: row.listingId ?? "",
        externalSku: row.externalSku ?? "",
        sellerSku: row.sellerSku ?? "",
        notes: row.notes ?? "",
        status: row.status,
        isTracked: row.isTracked
      };
    }
    setListingDrafts(drafts);
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

  async function loadInbox(channel: MarketplaceChannelCode) {
    const data = await fetchMarketplaceInbox({ channelCode: channel, limit: 50 });
    setInbox(data.items);
  }

  async function loadAmazonConnection() {
    try {
      setAmazonConnection(await fetchAmazonSpConnection());
    } catch (e) {
      setAmazonConnection(null);
      setError(e instanceof Error ? e.message : "Failed to load Amazon connection status");
    }
  }

  async function refreshActiveChannel() {
    if (!activeChannel) return;
    await Promise.all([loadListings(activeChannel), loadOrders(activeChannel), loadReturns(activeChannel), loadAnalytics(activeChannel), loadInbox(activeChannel), loadOverview()]);
  }

  async function syncAmazon() {
    setBusy("amazon-sync");
    setError(null);
    try {
      const result = await syncAmazonMarketplaceAll({
        daysBack: Number(amazonDaysBack) || 30,
        includeShipped: amazonIncludeShipped
      });
      setAmazonLastSync(result);
      setToast(
        `Amazon sync: ${result.orders.fetched} orders, ${result.listings.rows} listings, ${result.returns.rows} returns scanned`
      );
      await refreshActiveChannel();
      await loadAmazonConnection();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Amazon sync failed");
    } finally {
      setBusy(null);
    }
  }

  async function createListing() {
    if (!activeChannel) return;
    setBusy("create-listing");
    try {
      await upsertMarketplaceListing({
        channelCode: activeChannel,
        sku: newListingForm.sku.trim(),
        listingId: newListingForm.listingId || null,
        externalSku: newListingForm.externalSku || null,
        sellerSku: newListingForm.sellerSku || null,
        notes: newListingForm.notes || null,
        status: "ACTIVE",
        isTracked: true
      });
      setToast(`${newListingForm.sku} listed on ${activeChannelLabel}`);
      setNewListingForm({ sku: "", listingId: "", externalSku: "", sellerSku: "", notes: "" });
      await refreshActiveChannel();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create listing");
    } finally {
      setBusy(null);
    }
  }

  async function saveListing(row: MarketplaceListingRow) {
    const draft = listingDrafts[row.id];
    if (!draft) return;
    setBusy(`listing:${row.id}`);
    try {
      const updated = await patchMarketplaceListing(row.id, {
        listingId: draft.listingId || null,
        externalSku: draft.externalSku || null,
        sellerSku: draft.sellerSku || null,
        notes: draft.notes || null,
        status: draft.status,
        isTracked: draft.isTracked
      });
      setListings((prev) => prev.map((item) => (item.id === row.id ? updated : item)));
      setToast(`Saved ${row.variant.sku}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save listing");
    } finally {
      setBusy(null);
    }
  }

  async function submitOrder() {
    if (!activeChannel) return;
    setBusy("create-order");
    try {
      await createMarketplaceOrder({
        channelCode: activeChannel,
        externalOrderId: orderForm.externalOrderId.trim(),
        orderDate: `${orderForm.orderDate}T00:00:00.000Z`,
        customerName: orderForm.customerName || null,
        customerEmail: orderForm.customerEmail || null,
        shipToCity: orderForm.shipToCity || null,
        items: [
          {
            sku: orderForm.sku.trim(),
            quantity: Number(orderForm.quantity) || 1,
            unitPriceInPaise: orderForm.unitPriceInPaise ? Number(orderForm.unitPriceInPaise) : null,
            productName: orderForm.productName || null
          }
        ]
      });
      setToast("Marketplace order logged");
      setOrderForm((f) => ({ ...f, externalOrderId: "", sku: "", quantity: "1", customerName: "", customerEmail: "", shipToCity: "", unitPriceInPaise: "", productName: "" }));
      await refreshActiveChannel();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create order");
    } finally {
      setBusy(null);
    }
  }

  async function submitReturn() {
    setBusy("create-return");
    try {
      await createMarketplaceReturn({
        marketplaceOrderId: returnForm.marketplaceOrderId,
        marketplaceOrderItemId: returnForm.marketplaceOrderItemId || null,
        quantity: Number(returnForm.quantity) || 1,
        reason: returnForm.reason || null,
        refundedAmountInPaise: returnForm.refundedAmountInPaise ? Number(returnForm.refundedAmountInPaise) : null,
        restockedToZoho: returnForm.restockedToZoho
      });
      setToast("Marketplace return logged");
      setReturnForm({ marketplaceOrderId: "", marketplaceOrderItemId: "", quantity: "1", reason: "", refundedAmountInPaise: "", restockedToZoho: false });
      await refreshActiveChannel();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create return");
    } finally {
      setBusy(null);
    }
  }

  async function submitImport() {
    if (!activeChannel) return;
    setBusy("import-orders");
    try {
      const result = await importMarketplaceOrdersCsv({ channelCode: activeChannel, csvText: importText });
      setToast(`Imported ${result.importedOrders} orders (${result.duplicateOrders} duplicates, ${result.unresolvedItems} unresolved items)`);
      setImportText("");
      await refreshActiveChannel();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to import CSV");
    } finally {
      setBusy(null);
    }
  }

  async function submitInbox() {
    if (!activeChannel) return;
    setBusy("email-ingest");
    try {
      await createMarketplaceEmailIngest({
        channelCode: activeChannel,
        subject: emailForm.subject,
        bodyText: emailForm.bodyText,
        dedupeKey: emailForm.dedupeKey || null
      });
      setToast("Email notification queued");
      setEmailForm({ subject: "", bodyText: "", dedupeKey: "" });
      await loadInbox(activeChannel);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to queue email");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto max-w-[1440px] space-y-5">
      {toast ? (
        <div className="fixed bottom-6 left-1/2 z-[120] -translate-x-1/2 rounded-lg border border-stone-200 bg-white px-4 py-3 text-sm text-stone-900 shadow-xl dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100">
          {toast}
        </div>
      ) : null}

      <div className="border-b border-stone-200 pb-4 dark:border-stone-700">
        <h1 className="text-2xl font-semibold tracking-tight text-stone-900 dark:text-stone-100">Marketplace Operations</h1>
        <p className="mt-1 text-sm text-stone-500">Overview stays global. Each marketplace tab now owns its own listings, orders, returns, performance, and inbox.</p>
      </div>

      <div className="flex flex-wrap gap-6 border-b border-stone-200 dark:border-stone-700">
        <button type="button" onClick={() => setActiveTab("overview")} className={`border-b-2 px-1 pb-3 text-sm font-medium ${activeTab === "overview" ? "border-stone-900 text-stone-900 dark:border-stone-100 dark:text-stone-100" : "border-transparent text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-200"}`}>Overview</button>
        {CHANNELS.map((item) => (
          <button key={item.code} type="button" onClick={() => setActiveTab(item.code)} className={`border-b-2 px-1 pb-3 text-sm font-medium ${activeTab === item.code ? "border-stone-900 text-stone-900 dark:border-stone-100 dark:text-stone-100" : "border-transparent text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-200"}`}>
            {item.label}
          </button>
        ))}
      </div>

      {error ? <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">{error}</div> : null}

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
          <div className="grid gap-3 rounded-xl border border-stone-200 bg-white p-4 shadow-sm dark:border-stone-700 dark:bg-stone-900 md:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-stone-500">Search</label>
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={`Search inside ${activeChannelLabel}`} className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm dark:border-stone-700 dark:bg-stone-950" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-stone-500">From</label>
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm dark:border-stone-700 dark:bg-stone-950" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-stone-500">To</label>
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm dark:border-stone-700 dark:bg-stone-950" />
            </div>
          </div>

          {activeChannel === "AMAZON" ? (
            <SectionCard
              title="Amazon SP-API sync"
              right={
                amazonConnection ? (
                  <StatusPill label={amazonConnection.configured ? "CONNECTED" : "NOT CONFIGURED"} />
                ) : null
              }
            >
              <div className="space-y-3 text-sm text-stone-600 dark:text-stone-300">
                <p>
                  Pulls Amazon orders, listed products, and returns into this tab. Orders use the live Orders API; listings
                  and returns use Amazon reports. Buyer address may still be blank until Restricted Data Token is enabled.
                </p>
                {amazonConnection && !amazonConnection.configured ? (
                  <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
                    Missing on backend: {amazonConnection.missing.join(", ") || "credentials"}. Add them to backend{" "}
                    <code className="text-xs">.env</code> (see <code className="text-xs">backend/.env.example</code>), restart API, then sync.
                  </p>
                ) : null}
                <div className="flex flex-wrap items-end gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-stone-500">Days back</label>
                    <input
                      value={amazonDaysBack}
                      onChange={(e) => setAmazonDaysBack(e.target.value)}
                      className="w-24 rounded-lg border border-stone-200 px-3 py-2 text-sm dark:border-stone-700 dark:bg-stone-950"
                    />
                  </div>
                  <label className="inline-flex items-center gap-2 pb-2 text-sm text-stone-700 dark:text-stone-200">
                    <input
                      type="checkbox"
                      checked={amazonIncludeShipped}
                      onChange={(e) => setAmazonIncludeShipped(e.target.checked)}
                    />
                    Include shipped / full sales history window
                  </label>
                  <button
                    type="button"
                    disabled={busy === "amazon-sync" || amazonConnection?.configured === false}
                    onClick={() => void syncAmazon()}
                    className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 dark:bg-stone-100 dark:text-stone-900"
                  >
                    {busy === "amazon-sync" ? "Syncing…" : "Sync orders, listings, returns"}
                  </button>
                </div>
                <div className="grid gap-3 md:grid-cols-3">
                  <MetricCard
                    label="Auto sync"
                    value={amazonConnection?.autoSyncEnabled ? "On" : "Off"}
                    sub="Backend refreshes Amazon periodically"
                  />
                  <MetricCard
                    label="Sales window"
                    value={`${Number(amazonDaysBack) || 30}d`}
                    sub="Orders can go wider; reports cap at 60 days"
                  />
                  <MetricCard
                    label="Last sync"
                    value={
                      amazonLastSync
                        ? `${amazonLastSync.orders.fetched}/${amazonLastSync.listings.rows}/${amazonLastSync.returns.rows}`
                        : "Not run"
                    }
                    sub="orders / listings / returns scanned"
                  />
                </div>
                {amazonLastSync ? (
                  <div className="rounded-lg border border-stone-200 bg-stone-50 p-3 text-xs dark:border-stone-700 dark:bg-stone-950">
                    <p className="font-semibold text-stone-900 dark:text-stone-100">Latest Amazon sync</p>
                    <p className="mt-1">
                      Orders: created {amazonLastSync.orders.created}, updated {amazonLastSync.orders.updated}, unmatched SKUs{" "}
                      {amazonLastSync.orders.unresolvedItems}, errors {amazonLastSync.orders.errors}
                    </p>
                    <p className="mt-1">
                      Listings: created {amazonLastSync.listings.created}, updated {amazonLastSync.listings.updated}, unresolved{" "}
                      {amazonLastSync.listings.unresolved}
                    </p>
                    <p className="mt-1">
                      Returns: created {amazonLastSync.returns.created}, updated {amazonLastSync.returns.updated}, unresolved{" "}
                      {amazonLastSync.returns.unresolved}
                    </p>
                  </div>
                ) : null}
              </div>
            </SectionCard>
          ) : null}

          <div className="grid gap-5 xl:grid-cols-[1.3fr_0.7fr]">
            <SectionCard title={`${activeChannelLabel} listings`} right={<p className="text-xs text-stone-500">{listings.length} tracked</p>}>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="border-b border-stone-200 bg-stone-50 dark:border-stone-700 dark:bg-stone-800/60">
                    <tr>{["SKU", "Product", "Listing IDs", "Status", "Zoho stock", "30d", "Save"].map((h) => <th key={h} className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-stone-500">{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {listings.map((row) => {
                      const draft = listingDrafts[row.id];
                      return (
                        <tr key={row.id} className="border-b border-stone-100 align-top dark:border-stone-800">
                          <td className="px-3 py-3 font-mono text-xs">{row.variant.sku}</td>
                          <td className="px-3 py-3"><div className="font-medium text-stone-900 dark:text-stone-100">{row.variant.productName}</div><div className="text-xs text-stone-500">{row.variant.productSlug}</div></td>
                          <td className="px-3 py-3"><div className="grid gap-2"><input value={draft?.listingId ?? ""} onChange={(e) => setListingDrafts((s) => ({ ...s, [row.id]: { ...(s[row.id] ?? draft), listingId: e.target.value } }))} placeholder="Listing ID" className="rounded border border-stone-200 px-2 py-1 dark:border-stone-700 dark:bg-stone-950" /><input value={draft?.externalSku ?? ""} onChange={(e) => setListingDrafts((s) => ({ ...s, [row.id]: { ...(s[row.id] ?? draft), externalSku: e.target.value } }))} placeholder="External SKU" className="rounded border border-stone-200 px-2 py-1 dark:border-stone-700 dark:bg-stone-950" /><input value={draft?.sellerSku ?? ""} onChange={(e) => setListingDrafts((s) => ({ ...s, [row.id]: { ...(s[row.id] ?? draft), sellerSku: e.target.value } }))} placeholder="Seller SKU" className="rounded border border-stone-200 px-2 py-1 dark:border-stone-700 dark:bg-stone-950" /></div></td>
                          <td className="px-3 py-3"><div className="grid gap-2"><select value={draft?.status ?? row.status} onChange={(e) => setListingDrafts((s) => ({ ...s, [row.id]: { ...(s[row.id] ?? draft), status: e.target.value as MarketplaceListingRow["status"] } }))} className="rounded border border-stone-200 px-2 py-1 dark:border-stone-700 dark:bg-stone-950"><option value="ACTIVE">ACTIVE</option><option value="PAUSED">PAUSED</option><option value="DELISTED">DELISTED</option></select><label className="inline-flex items-center gap-2 text-xs text-stone-600 dark:text-stone-300"><input type="checkbox" checked={draft?.isTracked ?? row.isTracked} onChange={(e) => setListingDrafts((s) => ({ ...s, [row.id]: { ...(s[row.id] ?? draft), isTracked: e.target.checked } }))} />Tracked</label><textarea value={draft?.notes ?? ""} onChange={(e) => setListingDrafts((s) => ({ ...s, [row.id]: { ...(s[row.id] ?? draft), notes: e.target.value } }))} rows={2} placeholder="Notes" className="rounded border border-stone-200 px-2 py-1 dark:border-stone-700 dark:bg-stone-950" /></div></td>
                          <td className="px-3 py-3"><div className="font-semibold">{row.available}</div><div className="text-xs text-stone-500">On hand {row.zohoOnHand} · Reserved {row.zohoReserved}</div></td>
                          <td className="px-3 py-3 text-xs"><div className="mb-1"><StatusPill label={row.stockRisk} /></div><div className="text-stone-500">Sold {row.recentSoldQty}</div><div className="text-stone-500">Returns {row.recentReturnQty}</div></td>
                          <td className="px-3 py-3"><button type="button" disabled={busy === `listing:${row.id}`} onClick={() => void saveListing(row)} className="rounded-md bg-stone-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50 dark:bg-stone-100 dark:text-stone-900">{busy === `listing:${row.id}` ? "Saving..." : "Save"}</button></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </SectionCard>

            <SectionCard title={`Add item to ${activeChannelLabel}`}>
              <div className="grid gap-3">
                <input value={newListingForm.sku} onChange={(e) => setNewListingForm((f) => ({ ...f, sku: e.target.value }))} placeholder="SKU" className="rounded-lg border border-stone-200 px-3 py-2 text-sm dark:border-stone-700 dark:bg-stone-950" />
                <input value={newListingForm.listingId} onChange={(e) => setNewListingForm((f) => ({ ...f, listingId: e.target.value }))} placeholder="Listing ID" className="rounded-lg border border-stone-200 px-3 py-2 text-sm dark:border-stone-700 dark:bg-stone-950" />
                <input value={newListingForm.externalSku} onChange={(e) => setNewListingForm((f) => ({ ...f, externalSku: e.target.value }))} placeholder="External SKU" className="rounded-lg border border-stone-200 px-3 py-2 text-sm dark:border-stone-700 dark:bg-stone-950" />
                <input value={newListingForm.sellerSku} onChange={(e) => setNewListingForm((f) => ({ ...f, sellerSku: e.target.value }))} placeholder="Seller SKU" className="rounded-lg border border-stone-200 px-3 py-2 text-sm dark:border-stone-700 dark:bg-stone-950" />
                <textarea value={newListingForm.notes} onChange={(e) => setNewListingForm((f) => ({ ...f, notes: e.target.value }))} rows={3} placeholder="Notes" className="rounded-lg border border-stone-200 px-3 py-2 text-sm dark:border-stone-700 dark:bg-stone-950" />
                <button type="button" disabled={busy === "create-listing"} onClick={() => void createListing()} className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 dark:bg-stone-100 dark:text-stone-900">{busy === "create-listing" ? "Saving..." : `Add to ${activeChannelLabel}`}</button>
              </div>
            </SectionCard>
          </div>

          <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
            <SectionCard title={`${activeChannelLabel} orders`}>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="border-b border-stone-200 bg-stone-50 dark:border-stone-700 dark:bg-stone-800/60">
                    <tr>{["Order", "Customer", "Items", "Value", "Status", "Date"].map((h) => <th key={h} className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-stone-500">{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {orders.map((row) => (
                      <tr key={row.id} className="border-b border-stone-100 dark:border-stone-800">
                        <td className="px-3 py-3"><div className="font-medium text-stone-900 dark:text-stone-100">{row.externalOrderId}</div><div className="text-xs text-stone-500">{row.items.map((i) => i.skuSnapshot).join(", ")}</div></td>
                        <td className="px-3 py-3 text-xs text-stone-600 dark:text-stone-300">{row.customerName || row.customerEmail || "Unknown"}</td>
                        <td className="px-3 py-3">{row.totalItems}</td>
                        <td className="px-3 py-3">{formatINRFromPaise(row.totalValueInPaise)}</td>
                        <td className="px-3 py-3"><StatusPill label={row.status} /></td>
                        <td className="px-3 py-3 text-xs text-stone-500">{new Date(row.orderDate).toLocaleDateString("en-IN")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </SectionCard>
            <SectionCard title={`Log ${activeChannelLabel} order`}>
              <div className="grid gap-3">
                <input value={orderForm.externalOrderId} onChange={(e) => setOrderForm((f) => ({ ...f, externalOrderId: e.target.value }))} placeholder="External order ID" className="rounded-lg border border-stone-200 px-3 py-2 text-sm dark:border-stone-700 dark:bg-stone-950" />
                <input type="date" value={orderForm.orderDate} onChange={(e) => setOrderForm((f) => ({ ...f, orderDate: e.target.value }))} className="rounded-lg border border-stone-200 px-3 py-2 text-sm dark:border-stone-700 dark:bg-stone-950" />
                <input value={orderForm.sku} onChange={(e) => setOrderForm((f) => ({ ...f, sku: e.target.value }))} placeholder="SKU" className="rounded-lg border border-stone-200 px-3 py-2 text-sm dark:border-stone-700 dark:bg-stone-950" />
                <input value={orderForm.quantity} onChange={(e) => setOrderForm((f) => ({ ...f, quantity: e.target.value }))} placeholder="Quantity" className="rounded-lg border border-stone-200 px-3 py-2 text-sm dark:border-stone-700 dark:bg-stone-950" />
                <input value={orderForm.unitPriceInPaise} onChange={(e) => setOrderForm((f) => ({ ...f, unitPriceInPaise: e.target.value }))} placeholder="Unit price in paise" className="rounded-lg border border-stone-200 px-3 py-2 text-sm dark:border-stone-700 dark:bg-stone-950" />
                <input value={orderForm.customerName} onChange={(e) => setOrderForm((f) => ({ ...f, customerName: e.target.value }))} placeholder="Customer name" className="rounded-lg border border-stone-200 px-3 py-2 text-sm dark:border-stone-700 dark:bg-stone-950" />
                <input value={orderForm.customerEmail} onChange={(e) => setOrderForm((f) => ({ ...f, customerEmail: e.target.value }))} placeholder="Customer email" className="rounded-lg border border-stone-200 px-3 py-2 text-sm dark:border-stone-700 dark:bg-stone-950" />
                <input value={orderForm.shipToCity} onChange={(e) => setOrderForm((f) => ({ ...f, shipToCity: e.target.value }))} placeholder="Ship-to city" className="rounded-lg border border-stone-200 px-3 py-2 text-sm dark:border-stone-700 dark:bg-stone-950" />
                <button type="button" disabled={busy === "create-order"} onClick={() => void submitOrder()} className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 dark:bg-stone-100 dark:text-stone-900">{busy === "create-order" ? "Saving..." : "Create order"}</button>
              </div>
            </SectionCard>
          </div>

          <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
            <SectionCard title={`${activeChannelLabel} returns`}>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="border-b border-stone-200 bg-stone-50 dark:border-stone-700 dark:bg-stone-800/60">
                    <tr>{["Order", "Item", "Qty", "Refund", "Restocked", "Status"].map((h) => <th key={h} className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-stone-500">{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {returns.map((row) => (
                      <tr key={row.id} className="border-b border-stone-100 dark:border-stone-800">
                        <td className="px-3 py-3">{row.externalOrderId}</td>
                        <td className="px-3 py-3 text-xs text-stone-600 dark:text-stone-300">{row.productName || row.sku || "Unknown"}</td>
                        <td className="px-3 py-3">{row.quantity}</td>
                        <td className="px-3 py-3">{formatINRFromPaise(row.refundedAmountInPaise ?? 0)}</td>
                        <td className="px-3 py-3">{row.restockedToZoho ? "Yes" : "No"}</td>
                        <td className="px-3 py-3"><StatusPill label={row.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </SectionCard>
            <SectionCard title={`Log ${activeChannelLabel} return`}>
              <div className="grid gap-3">
                <select value={returnForm.marketplaceOrderId} onChange={(e) => setReturnForm((f) => ({ ...f, marketplaceOrderId: e.target.value }))} className="rounded-lg border border-stone-200 px-3 py-2 text-sm dark:border-stone-700 dark:bg-stone-950">
                  <option value="">Select tracked marketplace order</option>
                  {orders.slice(0, 100).map((order) => <option key={order.id} value={order.id}>{order.externalOrderId}</option>)}
                </select>
                <input value={returnForm.marketplaceOrderItemId} onChange={(e) => setReturnForm((f) => ({ ...f, marketplaceOrderItemId: e.target.value }))} placeholder="Marketplace order item ID (optional)" className="rounded-lg border border-stone-200 px-3 py-2 text-sm dark:border-stone-700 dark:bg-stone-950" />
                <input value={returnForm.quantity} onChange={(e) => setReturnForm((f) => ({ ...f, quantity: e.target.value }))} placeholder="Quantity" className="rounded-lg border border-stone-200 px-3 py-2 text-sm dark:border-stone-700 dark:bg-stone-950" />
                <input value={returnForm.refundedAmountInPaise} onChange={(e) => setReturnForm((f) => ({ ...f, refundedAmountInPaise: e.target.value }))} placeholder="Refund amount in paise" className="rounded-lg border border-stone-200 px-3 py-2 text-sm dark:border-stone-700 dark:bg-stone-950" />
                <textarea value={returnForm.reason} onChange={(e) => setReturnForm((f) => ({ ...f, reason: e.target.value }))} rows={3} placeholder="Reason / notes" className="rounded-lg border border-stone-200 px-3 py-2 text-sm dark:border-stone-700 dark:bg-stone-950" />
                <label className="inline-flex items-center gap-2 text-sm text-stone-700 dark:text-stone-200"><input type="checkbox" checked={returnForm.restockedToZoho} onChange={(e) => setReturnForm((f) => ({ ...f, restockedToZoho: e.target.checked }))} />Restocked to Zoho</label>
                <button type="button" disabled={busy === "create-return"} onClick={() => void submitReturn()} className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 dark:bg-stone-100 dark:text-stone-900">{busy === "create-return" ? "Saving..." : "Create return"}</button>
              </div>
            </SectionCard>
          </div>

          {analytics ? (
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
                        <tr>{["Orders", "Units", "Value", "Returns", "Refunds", "Pending dispatch"].map((h) => <th key={h} className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-stone-500">{h}</th>)}</tr>
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
                        <tr>{["SKU", "Product", "Units", "Value"].map((h) => <th key={h} className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-stone-500">{h}</th>)}</tr>
                      </thead>
                      <tbody>
                        {analytics.topSkus.map((row) => (
                          <tr key={row.sku} className="border-b border-stone-100 dark:border-stone-800">
                            <td className="px-3 py-3 font-mono text-xs">{row.sku}</td>
                            <td className="px-3 py-3">{row.productName || "Unknown"}</td>
                            <td className="px-3 py-3">{row.unitsSold}</td>
                            <td className="px-3 py-3">{formatINRFromPaise(row.orderValueInPaise)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </SectionCard>
            </div>
          ) : null}

          <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
            <SectionCard title={`${activeChannelLabel} inbox`}>
              <div className="space-y-3">
                {inbox.map((item) => {
                  const payload = (item.rawPayload ?? {}) as { subject?: string; bodyText?: string };
                  return (
                    <div key={item.id} className="rounded-lg border border-stone-200 p-3 dark:border-stone-700">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="font-medium text-stone-900 dark:text-stone-100">{payload.subject || item.eventType}</p>
                          <p className="text-xs text-stone-500">{new Date(item.createdAt).toLocaleString("en-IN")}</p>
                        </div>
                        <StatusPill label={item.processedAt ? "PROCESSED" : "EMAIL"} />
                      </div>
                      <p className="mt-2 whitespace-pre-wrap text-xs text-stone-600 dark:text-stone-300">{(payload.bodyText || "").slice(0, 600)}</p>
                    </div>
                  );
                })}
              </div>
            </SectionCard>
            <div className="space-y-5">
              <SectionCard title={`${activeChannelLabel} CSV import`}>
                <div className="grid gap-3">
                  <textarea value={importText} onChange={(e) => setImportText(e.target.value)} rows={8} placeholder="Paste marketplace CSV export here" className="rounded-lg border border-stone-200 px-3 py-2 font-mono text-xs dark:border-stone-700 dark:bg-stone-950" />
                  <button type="button" disabled={busy === "import-orders"} onClick={() => void submitImport()} className="rounded-lg border border-stone-300 px-4 py-2 text-sm font-semibold text-stone-800 disabled:opacity-50 dark:border-stone-600 dark:text-stone-100">{busy === "import-orders" ? "Importing..." : "Import orders CSV"}</button>
                </div>
              </SectionCard>
              <SectionCard title={`Queue ${activeChannelLabel} email`}>
                <div className="grid gap-3">
                  <input value={emailForm.subject} onChange={(e) => setEmailForm((f) => ({ ...f, subject: e.target.value }))} placeholder="Email subject" className="rounded-lg border border-stone-200 px-3 py-2 text-sm dark:border-stone-700 dark:bg-stone-950" />
                  <input value={emailForm.dedupeKey} onChange={(e) => setEmailForm((f) => ({ ...f, dedupeKey: e.target.value }))} placeholder="Dedupe key (optional)" className="rounded-lg border border-stone-200 px-3 py-2 text-sm dark:border-stone-700 dark:bg-stone-950" />
                  <textarea value={emailForm.bodyText} onChange={(e) => setEmailForm((f) => ({ ...f, bodyText: e.target.value }))} rows={8} placeholder="Paste marketplace order/return email body" className="rounded-lg border border-stone-200 px-3 py-2 text-sm dark:border-stone-700 dark:bg-stone-950" />
                  <button type="button" disabled={busy === "email-ingest"} onClick={() => void submitInbox()} className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 dark:bg-stone-100 dark:text-stone-900">{busy === "email-ingest" ? "Queueing..." : "Queue email"}</button>
                </div>
              </SectionCard>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
