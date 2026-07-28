"use client";

import { useEffect, useMemo, useState } from "react";

import type {
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
  fetchMarketplaceAnalytics,
  fetchMarketplaceInbox,
  fetchMarketplaceListings,
  fetchMarketplaceOrders,
  fetchMarketplaceOverview,
  fetchMarketplaceReturns,
  importMarketplaceOrdersCsv,
  patchMarketplaceListing
} from "@/lib/admin-api";
import { formatINRFromPaise } from "@/lib/money";

type TabId = "overview" | "listings" | "orders" | "returns" | "performance" | "inbox";

const TABS: Array<{ id: TabId; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "listings", label: "Listings" },
  { id: "orders", label: "Orders" },
  { id: "returns", label: "Returns" },
  { id: "performance", label: "Performance" },
  { id: "inbox", label: "Inbox" }
];

const FALLBACK_CHANNELS: MarketplaceChannelCode[] = [
  "AMAZON",
  "FLIPKART",
  "ETSY",
  "AMALA",
  "FIRSTCRY",
  "TATA_1MG",
  "SARVEDA"
];

function statusTone(value: string) {
  if (value.includes("DELIVER") || value === "ACTIVE" || value === "RECEIVED") return "emerald";
  if (value.includes("RETURN") || value.includes("REFUND")) return "amber";
  if (value.includes("CANCEL") || value === "DELISTED" || value === "out") return "red";
  return "stone";
}

function pillClass(tone: string) {
  if (tone === "emerald") return "bg-emerald-50 text-emerald-800 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900";
  if (tone === "amber") return "bg-amber-50 text-amber-900 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-200 dark:ring-amber-900";
  if (tone === "red") return "bg-red-50 text-red-800 ring-red-200 dark:bg-red-950/40 dark:text-red-200 dark:ring-red-900";
  return "bg-stone-100 text-stone-700 ring-stone-200 dark:bg-stone-800 dark:text-stone-200 dark:ring-stone-700";
}

function StatusPill({ label }: { label: string }) {
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${pillClass(statusTone(label))}`}>
      {label.replace(/_/g, " ")}
    </span>
  );
}

function SectionCard({
  title,
  children,
  right
}: {
  title: string;
  children: React.ReactNode;
  right?: React.ReactNode;
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
  const [tab, setTab] = useState<TabId>("overview");
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [channelCode, setChannelCode] = useState<MarketplaceChannelCode | "">("");
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const [overview, setOverview] = useState<MarketplaceOverviewData | null>(null);
  const [listings, setListings] = useState<MarketplaceListingRow[]>([]);
  const [orders, setOrders] = useState<MarketplaceOrderRow[]>([]);
  const [returns, setReturns] = useState<MarketplaceReturnRow[]>([]);
  const [analytics, setAnalytics] = useState<MarketplaceAnalyticsData | null>(null);
  const [inbox, setInbox] = useState<MarketplaceInboxEvent[]>([]);

  const [orderForm, setOrderForm] = useState({
    channelCode: "AMAZON" as MarketplaceChannelCode,
    externalOrderId: "",
    orderDate: new Date().toISOString().slice(0, 10),
    sku: "",
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
  const [importForm, setImportForm] = useState({
    channelCode: "AMAZON" as MarketplaceChannelCode,
    csvText: ""
  });
  const [emailForm, setEmailForm] = useState({
    channelCode: "AMAZON" as MarketplaceChannelCode,
    subject: "",
    bodyText: "",
    dedupeKey: ""
  });

  const [listingDrafts, setListingDrafts] = useState<
    Record<
      string,
      {
        status: MarketplaceListingRow["status"];
        isTracked: boolean;
        listingId: string;
        externalSku: string;
        sellerSku: string;
        notes: string;
      }
    >
  >({});

  const availableChannels = useMemo(() => {
    if (overview?.channels.length) return overview.channels.map((c) => c.code);
    return FALLBACK_CHANNELS;
  }, [overview]);

  useEffect(() => {
    void loadOverview();
  }, []);

  useEffect(() => {
    if (tab === "listings") void loadListings();
    if (tab === "orders") void loadOrders();
    if (tab === "returns") void loadReturns();
    if (tab === "performance") void loadAnalytics();
    if (tab === "inbox") void loadInbox();
  }, [tab, channelCode, search, from, to]);

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

  async function loadListings() {
    try {
      setError(null);
      const data = await fetchMarketplaceListings({
        channelCode: channelCode || undefined,
        search: search || undefined
      });
      setListings(data.items);
      const drafts: typeof listingDrafts = {};
      for (const row of data.items) {
        drafts[row.id] = {
          status: row.status,
          isTracked: row.isTracked,
          listingId: row.listingId ?? "",
          externalSku: row.externalSku ?? "",
          sellerSku: row.sellerSku ?? "",
          notes: row.notes ?? ""
        };
      }
      setListingDrafts(drafts);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load listings");
    }
  }

  async function loadOrders() {
    try {
      setError(null);
      const data = await fetchMarketplaceOrders({
        channelCode: channelCode || undefined,
        search: search || undefined,
        from: from || undefined,
        to: to || undefined
      });
      setOrders(data.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load orders");
    }
  }

  async function loadReturns() {
    try {
      setError(null);
      const data = await fetchMarketplaceReturns({
        channelCode: channelCode || undefined,
        search: search || undefined,
        from: from || undefined,
        to: to || undefined
      });
      setReturns(data.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load returns");
    }
  }

  async function loadAnalytics() {
    try {
      setError(null);
      setAnalytics(
        await fetchMarketplaceAnalytics({
          channelCode: channelCode || undefined,
          from: from || undefined,
          to: to || undefined
        })
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load analytics");
    }
  }

  async function loadInbox() {
    try {
      setError(null);
      const data = await fetchMarketplaceInbox({ channelCode: channelCode || undefined, limit: 50 });
      setInbox(data.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load inbox");
    }
  }

  async function saveListing(row: MarketplaceListingRow) {
    const draft = listingDrafts[row.id];
    if (!draft) return;
    setBusy(`listing:${row.id}`);
    try {
      const updated = await patchMarketplaceListing(row.id, {
        status: draft.status,
        isTracked: draft.isTracked,
        listingId: draft.listingId || null,
        externalSku: draft.externalSku || null,
        sellerSku: draft.sellerSku || null,
        notes: draft.notes || null
      });
      setListings((prev) => prev.map((item) => (item.id === row.id ? updated : item)));
      setToast(`Saved ${row.variant.sku} on ${row.channel.displayName}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save listing");
    } finally {
      setBusy(null);
    }
  }

  async function submitOrder() {
    setBusy("create-order");
    try {
      await createMarketplaceOrder({
        channelCode: orderForm.channelCode,
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
      setOrderForm((f) => ({
        ...f,
        externalOrderId: "",
        sku: "",
        quantity: "1",
        customerName: "",
        customerEmail: "",
        shipToCity: "",
        unitPriceInPaise: "",
        productName: ""
      }));
      await Promise.all([loadOrders(), loadOverview(), loadAnalytics()]);
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
        refundedAmountInPaise: returnForm.refundedAmountInPaise
          ? Number(returnForm.refundedAmountInPaise)
          : null,
        restockedToZoho: returnForm.restockedToZoho
      });
      setToast("Marketplace return logged");
      setReturnForm({
        marketplaceOrderId: "",
        marketplaceOrderItemId: "",
        quantity: "1",
        reason: "",
        refundedAmountInPaise: "",
        restockedToZoho: false
      });
      await Promise.all([loadReturns(), loadOverview(), loadAnalytics()]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create return");
    } finally {
      setBusy(null);
    }
  }

  async function submitImport() {
    setBusy("import-orders");
    try {
      const result = await importMarketplaceOrdersCsv(importForm);
      setToast(
        `Imported ${result.importedOrders} orders (${result.duplicateOrders} duplicates, ${result.unresolvedItems} unresolved items)`
      );
      await Promise.all([loadOrders(), loadOverview(), loadAnalytics()]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to import CSV");
    } finally {
      setBusy(null);
    }
  }

  async function submitInbox() {
    setBusy("email-ingest");
    try {
      await createMarketplaceEmailIngest({
        channelCode: emailForm.channelCode,
        subject: emailForm.subject,
        bodyText: emailForm.bodyText,
        dedupeKey: emailForm.dedupeKey || null
      });
      setToast("Email notification queued in marketplace inbox");
      setEmailForm((f) => ({ ...f, subject: "", bodyText: "", dedupeKey: "" }));
      await loadInbox();
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
        <h1 className="text-2xl font-semibold tracking-tight text-stone-900 dark:text-stone-100">
          Marketplace Operations
        </h1>
        <p className="mt-1 text-sm text-stone-500">
          Zoho remains stock master. Sarveda tracks listings, orders, returns, dispatch load, and marketplace email intake.
        </p>
      </div>

      <div className="flex flex-wrap gap-6 border-b border-stone-200 dark:border-stone-700">
        {TABS.map((item) => {
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`border-b-2 px-1 pb-3 text-sm font-medium ${
                active
                  ? "border-stone-900 text-stone-900 dark:border-stone-100 dark:text-stone-100"
                  : "border-transparent text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-200"
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      <div className="grid gap-3 rounded-xl border border-stone-200 bg-white p-4 shadow-sm dark:border-stone-700 dark:bg-stone-900 md:grid-cols-4">
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-stone-500">Marketplace</label>
          <select
            value={channelCode}
            onChange={(e) => setChannelCode(e.target.value as MarketplaceChannelCode | "")}
            className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm dark:border-stone-700 dark:bg-stone-950"
          >
            <option value="">All marketplaces</option>
            {availableChannels.map((code) => (
              <option key={code} value={code}>
                {code.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-stone-500">Search</label>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="SKU, order ID, customer..."
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

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">
          {error}
        </div>
      ) : null}

      {tab === "overview" && overview ? (
        <div className="space-y-5">
          <div className="grid gap-3 md:grid-cols-4">
            <MetricCard label="Channels" value={overview.totals.channels} />
            <MetricCard label="Listings" value={overview.totals.listings} />
            <MetricCard label="Orders tracked" value={overview.totals.orders} />
            <MetricCard label="Returns tracked" value={overview.totals.returns} />
          </div>
          <SectionCard title="Channel snapshot">
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
                      <p className="font-semibold">{row.activeListingCount}/{row.listingCount}</p>
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
          <div className="grid gap-5 xl:grid-cols-2">
            <SectionCard title="Recent marketplace orders">
              <div className="space-y-3">
                {overview.recentOrders.map((order) => (
                  <div key={order.id} className="rounded-lg border border-stone-200 p-3 dark:border-stone-700">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-medium text-stone-900 dark:text-stone-100">{order.externalOrderId}</p>
                        <p className="text-xs text-stone-500">
                          {order.channel.displayName} · {order.customerName || order.customerEmail || "Unknown customer"}
                        </p>
                      </div>
                      <StatusPill label={order.status} />
                    </div>
                    <p className="mt-2 text-xs text-stone-500">
                      {new Date(order.orderDate).toLocaleString("en-IN")} · {order.totalItems} item(s) · {formatINRFromPaise(order.totalValueInPaise)}
                    </p>
                  </div>
                ))}
              </div>
            </SectionCard>
            <SectionCard title="Recent marketplace returns">
              <div className="space-y-3">
                {overview.recentReturns.map((ret) => (
                  <div key={ret.id} className="rounded-lg border border-stone-200 p-3 dark:border-stone-700">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-medium text-stone-900 dark:text-stone-100">{ret.externalOrderId}</p>
                        <p className="text-xs text-stone-500">
                          {ret.channel.displayName} · {ret.productName || ret.sku || "Unknown item"}
                        </p>
                      </div>
                      <StatusPill label={ret.status} />
                    </div>
                    <p className="mt-2 text-xs text-stone-500">
                      Qty {ret.quantity} · Refund {formatINRFromPaise(ret.refundedAmountInPaise ?? 0)} · Restocked to Zoho:{" "}
                      {ret.restockedToZoho ? "Yes" : "No"}
                    </p>
                  </div>
                ))}
              </div>
            </SectionCard>
          </div>
        </div>
      ) : null}

      {tab === "listings" ? (
        <SectionCard title="Tracked listings">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="border-b border-stone-200 bg-stone-50 dark:border-stone-700 dark:bg-stone-800/60">
                <tr>
                  {["Marketplace", "SKU", "Product", "Listing IDs", "Status", "Zoho stock", "30d", "Save"].map((h) => (
                    <th key={h} className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-stone-500">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {listings.map((row) => {
                  const draft = listingDrafts[row.id];
                  return (
                    <tr key={row.id} className="border-b border-stone-100 align-top dark:border-stone-800">
                      <td className="px-3 py-3">
                        <div className="font-medium text-stone-900 dark:text-stone-100">{row.channel.displayName}</div>
                        <div className="text-xs text-stone-500">{row.channel.code.replace(/_/g, " ")}</div>
                      </td>
                      <td className="px-3 py-3 font-mono text-xs">{row.variant.sku}</td>
                      <td className="px-3 py-3">
                        <div className="font-medium text-stone-900 dark:text-stone-100">{row.variant.productName}</div>
                        <div className="text-xs text-stone-500">{row.variant.productSlug}</div>
                      </td>
                      <td className="px-3 py-3">
                        <div className="grid gap-2">
                          <input value={draft?.listingId ?? ""} onChange={(e) => setListingDrafts((s) => ({ ...s, [row.id]: { ...(s[row.id] ?? draft), listingId: e.target.value } }))} placeholder="Listing ID" className="rounded border border-stone-200 px-2 py-1 dark:border-stone-700 dark:bg-stone-950" />
                          <input value={draft?.externalSku ?? ""} onChange={(e) => setListingDrafts((s) => ({ ...s, [row.id]: { ...(s[row.id] ?? draft), externalSku: e.target.value } }))} placeholder="External SKU" className="rounded border border-stone-200 px-2 py-1 dark:border-stone-700 dark:bg-stone-950" />
                          <input value={draft?.sellerSku ?? ""} onChange={(e) => setListingDrafts((s) => ({ ...s, [row.id]: { ...(s[row.id] ?? draft), sellerSku: e.target.value } }))} placeholder="Seller SKU" className="rounded border border-stone-200 px-2 py-1 dark:border-stone-700 dark:bg-stone-950" />
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <div className="grid gap-2">
                          <select value={draft?.status ?? row.status} onChange={(e) => setListingDrafts((s) => ({ ...s, [row.id]: { ...(s[row.id] ?? draft), status: e.target.value as MarketplaceListingRow["status"] } }))} className="rounded border border-stone-200 px-2 py-1 dark:border-stone-700 dark:bg-stone-950">
                            <option value="ACTIVE">ACTIVE</option>
                            <option value="PAUSED">PAUSED</option>
                            <option value="DELISTED">DELISTED</option>
                          </select>
                          <label className="inline-flex items-center gap-2 text-xs text-stone-600 dark:text-stone-300">
                            <input type="checkbox" checked={draft?.isTracked ?? row.isTracked} onChange={(e) => setListingDrafts((s) => ({ ...s, [row.id]: { ...(s[row.id] ?? draft), isTracked: e.target.checked } }))} />
                            Tracked
                          </label>
                          <textarea value={draft?.notes ?? ""} onChange={(e) => setListingDrafts((s) => ({ ...s, [row.id]: { ...(s[row.id] ?? draft), notes: e.target.value } }))} rows={2} placeholder="Notes" className="rounded border border-stone-200 px-2 py-1 dark:border-stone-700 dark:bg-stone-950" />
                        </div>
                      </td>
                      <td className="px-3 py-3 text-sm">
                        <div className="font-semibold">{row.available}</div>
                        <div className="text-xs text-stone-500">On hand {row.zohoOnHand} · Reserved {row.zohoReserved}</div>
                      </td>
                      <td className="px-3 py-3 text-xs">
                        <div className="mb-1"><StatusPill label={row.stockRisk} /></div>
                        <div className="text-stone-500">Sold {row.recentSoldQty}</div>
                        <div className="text-stone-500">Returns {row.recentReturnQty}</div>
                      </td>
                      <td className="px-3 py-3">
                        <button type="button" disabled={busy === `listing:${row.id}`} onClick={() => void saveListing(row)} className="rounded-md bg-stone-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50 dark:bg-stone-100 dark:text-stone-900">
                          {busy === `listing:${row.id}` ? "Saving..." : "Save"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </SectionCard>
      ) : null}

      {tab === "orders" ? (
        <div className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
          <SectionCard title="Marketplace orders">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="border-b border-stone-200 bg-stone-50 dark:border-stone-700 dark:bg-stone-800/60">
                  <tr>
                    {["Marketplace", "Order", "Customer", "Items", "Value", "Status", "Date"].map((h) => (
                      <th key={h} className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-stone-500">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {orders.map((row) => (
                    <tr key={row.id} className="border-b border-stone-100 dark:border-stone-800">
                      <td className="px-3 py-3 text-xs">{row.channel.displayName}</td>
                      <td className="px-3 py-3">
                        <div className="font-medium text-stone-900 dark:text-stone-100">{row.externalOrderId}</div>
                        <div className="text-xs text-stone-500">{row.items.map((i) => i.skuSnapshot).join(", ")}</div>
                      </td>
                      <td className="px-3 py-3 text-xs text-stone-600 dark:text-stone-300">
                        {row.customerName || row.customerEmail || "Unknown"}
                      </td>
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
          <div className="space-y-5">
            <SectionCard title="Log order from email/dashboard">
              <div className="grid gap-3">
                <select value={orderForm.channelCode} onChange={(e) => setOrderForm((f) => ({ ...f, channelCode: e.target.value as MarketplaceChannelCode }))} className="rounded-lg border border-stone-200 px-3 py-2 text-sm dark:border-stone-700 dark:bg-stone-950">
                  {availableChannels.map((code) => <option key={code} value={code}>{code.replace(/_/g, " ")}</option>)}
                </select>
                <input value={orderForm.externalOrderId} onChange={(e) => setOrderForm((f) => ({ ...f, externalOrderId: e.target.value }))} placeholder="External order ID" className="rounded-lg border border-stone-200 px-3 py-2 text-sm dark:border-stone-700 dark:bg-stone-950" />
                <input type="date" value={orderForm.orderDate} onChange={(e) => setOrderForm((f) => ({ ...f, orderDate: e.target.value }))} className="rounded-lg border border-stone-200 px-3 py-2 text-sm dark:border-stone-700 dark:bg-stone-950" />
                <input value={orderForm.sku} onChange={(e) => setOrderForm((f) => ({ ...f, sku: e.target.value }))} placeholder="SKU" className="rounded-lg border border-stone-200 px-3 py-2 text-sm dark:border-stone-700 dark:bg-stone-950" />
                <input value={orderForm.quantity} onChange={(e) => setOrderForm((f) => ({ ...f, quantity: e.target.value }))} placeholder="Quantity" className="rounded-lg border border-stone-200 px-3 py-2 text-sm dark:border-stone-700 dark:bg-stone-950" />
                <input value={orderForm.unitPriceInPaise} onChange={(e) => setOrderForm((f) => ({ ...f, unitPriceInPaise: e.target.value }))} placeholder="Unit price in paise" className="rounded-lg border border-stone-200 px-3 py-2 text-sm dark:border-stone-700 dark:bg-stone-950" />
                <input value={orderForm.customerName} onChange={(e) => setOrderForm((f) => ({ ...f, customerName: e.target.value }))} placeholder="Customer name" className="rounded-lg border border-stone-200 px-3 py-2 text-sm dark:border-stone-700 dark:bg-stone-950" />
                <input value={orderForm.customerEmail} onChange={(e) => setOrderForm((f) => ({ ...f, customerEmail: e.target.value }))} placeholder="Customer email" className="rounded-lg border border-stone-200 px-3 py-2 text-sm dark:border-stone-700 dark:bg-stone-950" />
                <input value={orderForm.shipToCity} onChange={(e) => setOrderForm((f) => ({ ...f, shipToCity: e.target.value }))} placeholder="Ship-to city" className="rounded-lg border border-stone-200 px-3 py-2 text-sm dark:border-stone-700 dark:bg-stone-950" />
                <button type="button" disabled={busy === "create-order"} onClick={() => void submitOrder()} className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 dark:bg-stone-100 dark:text-stone-900">
                  {busy === "create-order" ? "Saving..." : "Create order"}
                </button>
              </div>
            </SectionCard>
            <SectionCard title="CSV import">
              <div className="grid gap-3">
                <select value={importForm.channelCode} onChange={(e) => setImportForm((f) => ({ ...f, channelCode: e.target.value as MarketplaceChannelCode }))} className="rounded-lg border border-stone-200 px-3 py-2 text-sm dark:border-stone-700 dark:bg-stone-950">
                  {availableChannels.map((code) => <option key={code} value={code}>{code.replace(/_/g, " ")}</option>)}
                </select>
                <textarea value={importForm.csvText} onChange={(e) => setImportForm((f) => ({ ...f, csvText: e.target.value }))} rows={10} placeholder="Paste CSV export here" className="rounded-lg border border-stone-200 px-3 py-2 font-mono text-xs dark:border-stone-700 dark:bg-stone-950" />
                <button type="button" disabled={busy === "import-orders"} onClick={() => void submitImport()} className="rounded-lg border border-stone-300 px-4 py-2 text-sm font-semibold text-stone-800 disabled:opacity-50 dark:border-stone-600 dark:text-stone-100">
                  {busy === "import-orders" ? "Importing..." : "Import orders CSV"}
                </button>
              </div>
            </SectionCard>
          </div>
        </div>
      ) : null}

      {tab === "returns" ? (
        <div className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
          <SectionCard title="Marketplace returns">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="border-b border-stone-200 bg-stone-50 dark:border-stone-700 dark:bg-stone-800/60">
                  <tr>
                    {["Marketplace", "Order", "Item", "Qty", "Refund", "Restocked", "Status"].map((h) => (
                      <th key={h} className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-stone-500">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {returns.map((row) => (
                    <tr key={row.id} className="border-b border-stone-100 dark:border-stone-800">
                      <td className="px-3 py-3 text-xs">{row.channel.displayName}</td>
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
          <SectionCard title="Log return / refund">
            <div className="grid gap-3">
              <select value={returnForm.marketplaceOrderId} onChange={(e) => setReturnForm((f) => ({ ...f, marketplaceOrderId: e.target.value }))} className="rounded-lg border border-stone-200 px-3 py-2 text-sm dark:border-stone-700 dark:bg-stone-950">
                <option value="">Select tracked marketplace order</option>
                {orders.slice(0, 100).map((order) => (
                  <option key={order.id} value={order.id}>
                    {order.channel.displayName} · {order.externalOrderId}
                  </option>
                ))}
              </select>
              <input value={returnForm.marketplaceOrderItemId} onChange={(e) => setReturnForm((f) => ({ ...f, marketplaceOrderItemId: e.target.value }))} placeholder="Marketplace order item ID (optional)" className="rounded-lg border border-stone-200 px-3 py-2 text-sm dark:border-stone-700 dark:bg-stone-950" />
              <input value={returnForm.quantity} onChange={(e) => setReturnForm((f) => ({ ...f, quantity: e.target.value }))} placeholder="Quantity" className="rounded-lg border border-stone-200 px-3 py-2 text-sm dark:border-stone-700 dark:bg-stone-950" />
              <input value={returnForm.refundedAmountInPaise} onChange={(e) => setReturnForm((f) => ({ ...f, refundedAmountInPaise: e.target.value }))} placeholder="Refund amount in paise" className="rounded-lg border border-stone-200 px-3 py-2 text-sm dark:border-stone-700 dark:bg-stone-950" />
              <textarea value={returnForm.reason} onChange={(e) => setReturnForm((f) => ({ ...f, reason: e.target.value }))} rows={3} placeholder="Reason / notes" className="rounded-lg border border-stone-200 px-3 py-2 text-sm dark:border-stone-700 dark:bg-stone-950" />
              <label className="inline-flex items-center gap-2 text-sm text-stone-700 dark:text-stone-200">
                <input type="checkbox" checked={returnForm.restockedToZoho} onChange={(e) => setReturnForm((f) => ({ ...f, restockedToZoho: e.target.checked }))} />
                Restocked to Zoho
              </label>
              <button type="button" disabled={busy === "create-return"} onClick={() => void submitReturn()} className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 dark:bg-stone-100 dark:text-stone-900">
                {busy === "create-return" ? "Saving..." : "Create return"}
              </button>
            </div>
          </SectionCard>
        </div>
      ) : null}

      {tab === "performance" && analytics ? (
        <div className="space-y-5">
          <div className="grid gap-3 md:grid-cols-4">
            <MetricCard label="Orders" value={analytics.totals.orders} />
            <MetricCard label="Units sold" value={analytics.totals.unitsSold} />
            <MetricCard label="Returns" value={analytics.totals.returns} />
            <MetricCard label="Refund value" value={formatINRFromPaise(analytics.totals.refundValueInPaise)} />
          </div>
          <SectionCard title="Performance by marketplace">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="border-b border-stone-200 bg-stone-50 dark:border-stone-700 dark:bg-stone-800/60">
                  <tr>
                    {["Marketplace", "Orders", "Units", "Value", "Returns", "Refunds", "Pending dispatch"].map((h) => (
                      <th key={h} className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-stone-500">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {analytics.byChannel.map((row) => (
                    <tr key={row.channelId} className="border-b border-stone-100 dark:border-stone-800">
                      <td className="px-3 py-3 font-medium">{row.displayName}</td>
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
          </SectionCard>
          <SectionCard title="Top SKUs">
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
          </SectionCard>
        </div>
      ) : null}

      {tab === "inbox" ? (
        <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
          <SectionCard title="Email review queue">
            <div className="space-y-3">
              {inbox.map((item) => {
                const payload = (item.rawPayload ?? {}) as { subject?: string; bodyText?: string };
                return (
                  <div key={item.id} className="rounded-lg border border-stone-200 p-3 dark:border-stone-700">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-medium text-stone-900 dark:text-stone-100">
                          {payload.subject || item.eventType}
                        </p>
                        <p className="text-xs text-stone-500">
                          {item.channel.displayName} · {new Date(item.createdAt).toLocaleString("en-IN")}
                        </p>
                      </div>
                      <StatusPill label={item.processedAt ? "PROCESSED" : "EMAIL"} />
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-xs text-stone-600 dark:text-stone-300">
                      {(payload.bodyText || "").slice(0, 600)}
                    </p>
                  </div>
                );
              })}
            </div>
          </SectionCard>
          <SectionCard title="Push marketplace email into queue">
            <div className="grid gap-3">
              <select value={emailForm.channelCode} onChange={(e) => setEmailForm((f) => ({ ...f, channelCode: e.target.value as MarketplaceChannelCode }))} className="rounded-lg border border-stone-200 px-3 py-2 text-sm dark:border-stone-700 dark:bg-stone-950">
                {availableChannels.map((code) => <option key={code} value={code}>{code.replace(/_/g, " ")}</option>)}
              </select>
              <input value={emailForm.subject} onChange={(e) => setEmailForm((f) => ({ ...f, subject: e.target.value }))} placeholder="Email subject" className="rounded-lg border border-stone-200 px-3 py-2 text-sm dark:border-stone-700 dark:bg-stone-950" />
              <input value={emailForm.dedupeKey} onChange={(e) => setEmailForm((f) => ({ ...f, dedupeKey: e.target.value }))} placeholder="Dedupe key (optional)" className="rounded-lg border border-stone-200 px-3 py-2 text-sm dark:border-stone-700 dark:bg-stone-950" />
              <textarea value={emailForm.bodyText} onChange={(e) => setEmailForm((f) => ({ ...f, bodyText: e.target.value }))} rows={10} placeholder="Paste marketplace order/return email body" className="rounded-lg border border-stone-200 px-3 py-2 text-sm dark:border-stone-700 dark:bg-stone-950" />
              <button type="button" disabled={busy === "email-ingest"} onClick={() => void submitInbox()} className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 dark:bg-stone-100 dark:text-stone-900">
                {busy === "email-ingest" ? "Queueing..." : "Queue email"}
              </button>
            </div>
          </SectionCard>
        </div>
      ) : null}
    </div>
  );
}
