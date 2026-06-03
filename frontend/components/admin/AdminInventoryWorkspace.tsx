"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { InventoryRow } from "@/lib/admin-api";
import {
  bulkPatchAdminInventory,
  fetchAdminInventory,
  patchAdminInventoryVariant,
  syncStockFromZohoAdmin
} from "@/lib/admin-api";
import {
  buildCategoryFilterOptions,
  computeInventoryStats,
  downloadCsv,
  firstVariantRowByProduct,
  formatRelativeTime,
  inventoryToCsv,
  matchesStockFilter,
  sortInventoryRows,
  type SortDir,
  type SortKey,
  type StockFilter
} from "@/lib/inventory-utils";

const EDIT_PRODUCT_CLASS =
  "rounded-lg bg-amber-500 px-2.5 py-1 text-xs font-semibold text-stone-900 hover:bg-amber-400";

function SortHeader({
  label,
  active,
  dir,
  onClick
}: {
  label: string;
  active: boolean;
  dir: SortDir;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1 font-semibold hover:text-amber-700 dark:hover:text-amber-400 ${
        active ? "text-amber-800 dark:text-amber-400" : "text-stone-600 dark:text-stone-300"
      }`}
    >
      {label}
      {active ? <span className="text-xs">{dir === "asc" ? "↑" : "↓"}</span> : null}
    </button>
  );
}

function ZohoBadge({
  inZoho,
  auditAvailable
}: {
  inZoho: boolean | null;
  auditAvailable: boolean;
}) {
  if (!auditAvailable) {
    return <span className="text-xs text-stone-500">Run full sync first</span>;
  }
  if (inZoho) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-emerald-950/60 px-2 py-0.5 text-xs font-medium text-emerald-300">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden />
        In Zoho
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1 rounded-md bg-amber-950/50 px-2 py-0.5 text-xs font-medium text-amber-300"
      title="Add this SKU in Zoho Books or fix SKU under Edit product"
    >
      ⚠ Not in Zoho
    </span>
  );
}

export function AdminInventoryWorkspace() {
  const [allRows, setAllRows] = useState<InventoryRow[]>([]);
  const [savedThresholds, setSavedThresholds] = useState<Record<string, number>>({});
  const [thresholdDrafts, setThresholdDrafts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [lastZohoSync, setLastZohoSync] = useState<string | null>(null);
  const [zohoAuditAvailable, setZohoAuditAvailable] = useState(false);

  const [search, setSearch] = useState("");
  const [stockFilter, setStockFilter] = useState<StockFilter>("all");
  const [categorySlug, setCategorySlug] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("product");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const [busy, setBusy] = useState<string | null>(null);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [zohoSyncing, setZohoSyncing] = useState<"all" | "unmatched" | string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; error?: boolean } | null>(null);

  const pushToast = useCallback((message: string, error = false) => {
    setToast({ message, error });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5200);
    return () => clearTimeout(t);
  }, [toast]);

  const categoryOptions = useMemo(() => buildCategoryFilterOptions(allRows), [allRows]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const data = await fetchAdminInventory({ all: true });
      setAllRows(data.items);
      const th: Record<string, number> = {};
      const thDraft: Record<string, string> = {};
      for (const r of data.items) {
        th[r.variantId] = r.lowStockThreshold;
        thDraft[r.variantId] = String(r.lowStockThreshold);
      }
      setSavedThresholds(th);
      setThresholdDrafts(thDraft);
      setLastZohoSync(data.meta.lastZohoStockSyncAt);
      setZohoAuditAvailable(data.meta.zohoSkuAuditAvailable);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load inventory");
      setAllRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const thresholdChanges = useMemo(() => {
    const changes: Array<{ variantId: string; lowStockThreshold: number }> = [];
    for (const id of Object.keys(savedThresholds)) {
      const orig = savedThresholds[id];
      const raw = thresholdDrafts[id];
      const th = raw !== undefined ? parseInt(raw, 10) : orig;
      if (Number.isFinite(th) && th >= 0 && th !== orig) {
        changes.push({ variantId: id, lowStockThreshold: th });
      }
    }
    return changes;
  }, [savedThresholds, thresholdDrafts]);

  const searchFiltered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allRows.filter((r) => {
      if (categorySlug && !r.categories.some((c) => c.slug === categorySlug)) return false;
      if (!q) return true;
      return (
        r.productName.toLowerCase().includes(q) ||
        r.sku.toLowerCase().includes(q) ||
        (r.variantLabel?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [allRows, search, categorySlug]);

  const tabCounts = useMemo(() => {
    const counts = {
      all: 0,
      in_stock: 0,
      low_stock: 0,
      out_of_stock: 0,
      not_in_zoho: 0
    };
    for (const r of searchFiltered) {
      counts.all++;
      if (r.inZohoBooks === false) counts.not_in_zoho++;
      if (matchesStockFilter(r, "in_stock")) counts.in_stock++;
      else if (matchesStockFilter(r, "low_stock")) counts.low_stock++;
      else if (matchesStockFilter(r, "out_of_stock")) counts.out_of_stock++;
    }
    return counts;
  }, [searchFiltered]);

  const displayedRows = useMemo(() => {
    const filtered = searchFiltered.filter((r) => matchesStockFilter(r, stockFilter));
    return sortInventoryRows(filtered, sortKey, sortDir);
  }, [searchFiltered, stockFilter, sortKey, sortDir]);

  const firstRowPerProduct = useMemo(
    () => firstVariantRowByProduct(displayedRows),
    [displayedRows]
  );

  const stats = useMemo(() => computeInventoryStats(allRows), [allRows]);
  const zohoUnmatchedTotal = useMemo(
    () => allRows.filter((r) => r.inZohoBooks === false).length,
    [allRows]
  );

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  async function saveThreshold(variantId: string) {
    const change = thresholdChanges.find((c) => c.variantId === variantId);
    if (!change) return;
    setBusy(variantId);
    setErr(null);
    try {
      await patchAdminInventoryVariant(variantId, { lowStockThreshold: change.lowStockThreshold });
      pushToast("Threshold saved");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(null);
    }
  }

  async function saveAllThresholds() {
    if (thresholdChanges.length === 0) return;
    setBulkSaving(true);
    setErr(null);
    try {
      const { updated } = await bulkPatchAdminInventory(thresholdChanges);
      pushToast(`Saved ${updated} threshold${updated === 1 ? "" : "s"}`);
      await load();
    } catch (e) {
      pushToast(e instanceof Error ? e.message : "Save failed", true);
    } finally {
      setBulkSaving(false);
    }
  }

  async function runZohoSync(mode: "all" | "unmatched" | { productId: string; label: string }) {
    setZohoSyncing(mode === "all" || mode === "unmatched" ? mode : mode.productId);
    setErr(null);
    try {
      const result = await syncStockFromZohoAdmin(
        mode === "all"
          ? undefined
          : mode === "unmatched"
            ? { unmatchedOnly: true }
            : { productId: mode.productId }
      );
      const label =
        mode === "all" ? "All" : mode === "unmatched" ? "Unmatched" : mode.label;
      pushToast(`✅ ${label}: synced ${result.synced} SKU${result.synced === 1 ? "" : "s"} from Zoho`);
      await load();
    } catch (e) {
      pushToast(e instanceof Error ? e.message : "Zoho sync failed", true);
    } finally {
      setZohoSyncing(null);
    }
  }

  const stockTabs: { id: StockFilter; label: string }[] = [
    { id: "all", label: "All" },
    { id: "in_stock", label: "In Stock" },
    { id: "low_stock", label: "Low Stock" },
    { id: "out_of_stock", label: "Out of Stock" },
    { id: "not_in_zoho", label: "Not in Zoho" }
  ];

  return (
    <div className="space-y-6">
      {toast ? (
        <div
          className={`fixed bottom-6 left-1/2 z-[110] max-w-md -translate-x-1/2 rounded-xl border px-4 py-3 text-sm shadow-lg ${
            toast.error
              ? "border-red-300 bg-red-950 text-red-50"
              : "border-stone-300 bg-stone-900 text-amber-50"
          }`}
          role="status"
        >
          {toast.message}
        </div>
      ) : null}

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-3xl italic text-stone-800 dark:text-stone-100">Inventory</h1>
          <p className="mt-1 max-w-xl text-sm text-stone-500 dark:text-stone-400">
            Stock quantities come from <strong>Zoho Books</strong> only (sync or nightly job). You can
            adjust low-stock <strong>thresholds</strong> here for admin alerts.
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={() =>
                downloadCsv(
                  `sarveda-inventory-${new Date().toISOString().slice(0, 10)}.csv`,
                  inventoryToCsv(displayedRows)
                )
              }
              disabled={loading || displayedRows.length === 0}
              className="rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 hover:border-amber-400 disabled:opacity-50 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-200"
            >
              Export CSV
            </button>
            <button
              type="button"
              disabled={bulkSaving || thresholdChanges.length === 0}
              onClick={() => void saveAllThresholds()}
              className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-semibold text-amber-400 disabled:opacity-50 dark:bg-stone-700"
            >
              {bulkSaving
                ? "Saving…"
                : thresholdChanges.length > 0
                  ? `Save ${thresholdChanges.length} threshold${thresholdChanges.length === 1 ? "" : "s"}`
                  : "Save thresholds"}
            </button>
            <button
              type="button"
              disabled={zohoUnmatchedTotal === 0 || zohoSyncing !== null}
              onClick={() => void runZohoSync("unmatched")}
              className="rounded-lg border border-amber-600/50 bg-amber-950/40 px-4 py-2 text-sm font-medium text-amber-300 hover:bg-amber-900/50 disabled:opacity-50"
            >
              {zohoSyncing === "unmatched" ? "Syncing…" : `Sync unmatched (${zohoUnmatchedTotal})`}
            </button>
            <button
              type="button"
              disabled={zohoSyncing !== null}
              onClick={() => void runZohoSync("all")}
              className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-stone-900 hover:bg-amber-400 disabled:opacity-60"
            >
              {zohoSyncing === "all" ? (
                <>
                  <span
                    className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-stone-900 border-t-transparent"
                    aria-hidden
                  />
                  Syncing…
                </>
              ) : (
                "Sync all from Zoho"
              )}
            </button>
          </div>
          <p className="text-xs text-stone-500">Last full sync: {formatRelativeTime(lastZohoSync)}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-4 rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm shadow-sm dark:border-stone-700 dark:bg-stone-900">
        <div>
          <span className="text-stone-500">Variants: </span>
          <span className="font-semibold">{stats.total}</span>
        </div>
        <div>
          <span className="text-stone-500">In stock: </span>
          <span className="font-semibold">{stats.inStock}</span>
        </div>
        <div>
          <span className="text-stone-500">Low: </span>
          <span className="font-semibold text-amber-700 dark:text-amber-400">{stats.lowStock}</span>
        </div>
        <div>
          <span className="text-stone-500">Out of stock: </span>
          <span className="font-semibold text-red-700 dark:text-red-400">{stats.outOfStock}</span>
        </div>
        {zohoAuditAvailable ? (
          <div className="border-l border-stone-200 pl-4 dark:border-stone-600">
            <button
              type="button"
              onClick={() => setStockFilter("not_in_zoho")}
              className="font-medium text-amber-700 hover:underline dark:text-amber-400"
            >
              {zohoUnmatchedTotal} not in Zoho →
            </button>
          </div>
        ) : null}
      </div>

      <aside className="rounded-xl border border-amber-900/30 bg-amber-950/20 p-4 text-sm text-stone-300">
        <p className="font-medium text-amber-200">How to use this page</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-stone-400">
          <li>
            <strong>Available</strong> is what the shop can sell (Zoho on-hand minus checkout holds).
            Do not edit stock here — use Zoho Books or <strong>Sync from Zoho</strong>.
          </li>
          <li>
            <strong>Threshold</strong> controls when the red <strong>Low</strong> badge appears (default 5).
            Lower it for fast movers, raise it for slow movers.
          </li>
          <li>
            Tab <strong>Not in Zoho</strong> lists SKU mismatches. Fix in Zoho or via <strong>Edit product</strong>,
            then <strong>Sync unmatched</strong> or per-product <strong>Sync Zoho</strong>.
          </li>
        </ul>
      </aside>

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-stone-200 bg-white p-4 shadow-sm dark:border-stone-700 dark:bg-stone-900">
        <div className="min-w-[12rem] flex-1">
          <label htmlFor="inv-search" className="block text-xs font-semibold uppercase text-stone-500">
            Search
          </label>
          <input
            id="inv-search"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Product name or SKU…"
            className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm dark:border-stone-600 dark:bg-stone-950 dark:text-stone-100"
          />
        </div>
        <div className="min-w-[12rem]">
          <label htmlFor="inv-cat" className="block text-xs font-semibold uppercase text-stone-500">
            Category
          </label>
          <select
            id="inv-cat"
            value={categorySlug}
            onChange={(e) => setCategorySlug(e.target.value)}
            className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm dark:border-stone-600 dark:bg-stone-950 dark:text-stone-100"
          >
            <option value="">All categories</option>
            {categoryOptions.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {stockTabs.map((tab) => {
          const count = tabCounts[tab.id];
          const active = stockFilter === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setStockFilter(tab.id)}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
                active
                  ? "bg-amber-500 text-stone-900"
                  : "border border-stone-300 bg-white text-stone-700 hover:border-amber-400 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-200"
              }`}
            >
              {tab.label} ({count})
            </button>
          );
        })}
      </div>

      {err ? (
        <p className="text-red-600 dark:text-red-400" role="alert">
          {err}
        </p>
      ) : null}

      {loading ? (
        <p className="text-sm text-stone-500">Loading inventory…</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white shadow-sm dark:border-stone-700 dark:bg-stone-900">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-stone-100 bg-stone-50 dark:border-stone-700 dark:bg-stone-800/80">
              <tr>
                <th className="px-4 py-3">
                  <SortHeader
                    label="Product"
                    active={sortKey === "product"}
                    dir={sortDir}
                    onClick={() => toggleSort("product")}
                  />
                </th>
                <th className="px-4 py-3 font-semibold text-stone-600 dark:text-stone-300">Variant</th>
                <th className="px-4 py-3">
                  <SortHeader label="SKU" active={sortKey === "sku"} dir={sortDir} onClick={() => toggleSort("sku")} />
                </th>
                <th className="px-4 py-3 font-semibold text-stone-600 dark:text-stone-300">Zoho</th>
                <th className="px-4 py-3">
                  <SortHeader
                    label="Available"
                    active={sortKey === "onHand"}
                    dir={sortDir}
                    onClick={() => toggleSort("onHand")}
                  />
                </th>
                <th
                  className="px-4 py-3 font-semibold text-stone-600 dark:text-stone-300"
                  title="Alert when available ≤ this value (and &gt; 0)"
                >
                  Threshold
                </th>
                <th className="px-4 py-3 font-semibold text-stone-600 dark:text-stone-300">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 dark:divide-stone-700">
              {displayedRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-stone-500">
                    No variants match your filters.
                  </td>
                </tr>
              ) : (
                displayedRows.map((r) => {
                  const isFirstOfProduct = firstRowPerProduct.has(r.variantId);
                  const thresholdDirty = thresholdChanges.some((c) => c.variantId === r.variantId);
                  const productSyncing = zohoSyncing === r.productId;
                  return (
                    <tr
                      key={r.variantId}
                      className={`${r.low ? "bg-red-50/40 dark:bg-red-950/20" : ""} ${
                        thresholdDirty ? "border-l-4 border-l-amber-500" : ""
                      } ${r.inZohoBooks === false ? "bg-amber-950/10" : ""}`}
                    >
                      <td className="px-4 py-3 align-top">
                        {isFirstOfProduct ? (
                          <div className="flex flex-col gap-1.5">
                            <span className="font-medium text-stone-800 dark:text-stone-100">
                              {r.productName}
                            </span>
                            <div className="flex flex-wrap gap-1.5">
                              <Link href={`/admin/products/${r.productId}`} className={EDIT_PRODUCT_CLASS}>
                                Edit product
                              </Link>
                              <button
                                type="button"
                                disabled={zohoSyncing !== null}
                                onClick={() =>
                                  void runZohoSync({
                                    productId: r.productId,
                                    label: r.productName
                                  })
                                }
                                className="rounded-lg border border-stone-500 px-2.5 py-1 text-xs font-medium text-stone-300 hover:border-amber-500 hover:text-amber-300 disabled:opacity-50"
                              >
                                {productSyncing ? "Syncing…" : "Sync Zoho"}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <span className="text-stone-400 dark:text-stone-600">↳</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-stone-600 dark:text-stone-400">
                        {r.variantLabel ?? "Default"}
                        {r.low ? (
                          <span className="ml-1 rounded bg-red-200 px-1 py-0.5 text-[10px] font-bold uppercase text-red-900 dark:bg-red-900/70 dark:text-red-100">
                            Low
                          </span>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">{r.sku}</td>
                      <td className="px-4 py-3">
                        <ZohoBadge inZoho={r.inZohoBooks} auditAvailable={zohoAuditAvailable} />
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-mono text-base font-semibold text-stone-800 dark:text-stone-100">
                          {r.available}
                        </span>
                        {r.reserved > 0 ? (
                          <p className="text-[10px] text-stone-500">
                            {r.reserved} held at checkout
                          </p>
                        ) : null}
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="number"
                          min={0}
                          value={thresholdDrafts[r.variantId] ?? ""}
                          onChange={(e) =>
                            setThresholdDrafts((d) => ({ ...d, [r.variantId]: e.target.value }))
                          }
                          className="w-14 rounded-md border border-stone-300 px-2 py-1 font-mono text-sm dark:border-stone-600 dark:bg-stone-950 dark:text-stone-100"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          disabled={busy === r.variantId || !thresholdDirty}
                          onClick={() => void saveThreshold(r.variantId)}
                          className="rounded-lg bg-stone-900 px-3 py-1 text-xs font-medium text-amber-400 disabled:opacity-40 dark:bg-stone-700"
                        >
                          {busy === r.variantId ? "…" : "Save"}
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-stone-500">
        {displayedRows.length} variant{displayedRows.length === 1 ? "" : "s"} shown.
        Stock is read-only from Zoho; thresholds are saved in Sarveda.
      </p>
    </div>
  );
}
