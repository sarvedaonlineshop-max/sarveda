"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { InventoryRow } from "@/lib/admin-api";
import {
  bulkPatchAdminInventory,
  fetchAdminInventory,
  importAdminInventoryCsv,
  patchAdminInventoryVariant,
  syncStockFromZohoAdmin
} from "@/lib/admin-api";
import {
  buildCategoryFilterOptions,
  computeInventoryStats,
  downloadCsv,
  formatRelativeTime,
  groupRowsByCategory,
  groupRowsByProduct,
  inventoryToCsv,
  matchesStockFilter,
  parseInventoryImportCsv,
  sortInventoryRows,
  type SortDir,
  type SortKey,
  type StockFilter
} from "@/lib/inventory-utils";

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

function ZohoSkuStatus({
  sku,
  inZoho,
  auditAvailable,
  compact = false
}: {
  sku: string;
  inZoho: boolean | null;
  auditAvailable: boolean;
  compact?: boolean;
}) {
  if (!auditAvailable) {
    return (
      <span className={`text-stone-500 dark:text-stone-400 ${compact ? "text-xs" : "text-sm"}`}>
        Unknown — run Sync from Zoho
      </span>
    );
  }
  if (inZoho === true) {
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-md bg-emerald-950/50 px-2 py-0.5 font-medium text-emerald-300 ${
          compact ? "text-xs" : "text-sm"
        }`}
        title="SKU exists in Zoho Books. Stock updates on nightly sync and manual sync."
      >
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden />
        In Zoho
      </span>
    );
  }
  return (
    <div className={compact ? "text-xs" : "text-sm"}>
      <span className="font-medium text-amber-500 dark:text-amber-400">Not in Zoho</span>
      {!compact ? (
        <ul className="mt-1 list-disc space-y-0.5 pl-4 text-stone-500 dark:text-stone-400">
          <li>
            In Zoho Books, create an item with SKU <span className="font-mono text-stone-600 dark:text-stone-300">{sku}</span>
          </li>
          <li>
            Or open <strong>Admin → Products</strong> and fix the variant SKU to match Zoho
          </li>
          <li>Until matched, paid orders may fail to create Zoho invoices</li>
        </ul>
      ) : (
        <p className="text-stone-500 dark:text-stone-400">Fix SKU in Products or add item in Zoho</p>
      )}
    </div>
  );
}

export function AdminInventoryWorkspace() {
  const [allRows, setAllRows] = useState<InventoryRow[]>([]);
  const [saved, setSaved] = useState<Record<string, { onHand: number; lowStockThreshold: number }>>({});
  const [onHandDrafts, setOnHandDrafts] = useState<Record<string, string>>({});
  const [thresholdDrafts, setThresholdDrafts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [lastZohoSync, setLastZohoSync] = useState<string | null>(null);
  const [zohoAuditAvailable, setZohoAuditAvailable] = useState(false);

  const [search, setSearch] = useState("");
  const [stockFilter, setStockFilter] = useState<StockFilter>("all");
  const [categorySlug, setCategorySlug] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("product");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [groupByProduct, setGroupByProduct] = useState(true);
  const [groupByCategory, setGroupByCategory] = useState(false);
  const [flatList, setFlatList] = useState(false);
  const [expandedProducts, setExpandedProducts] = useState<Set<string>>(new Set());
  const [collapsedCats, setCollapsedCats] = useState<Set<string>>(new Set());

  const [busy, setBusy] = useState<string | null>(null);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [zohoSyncing, setZohoSyncing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; error?: boolean } | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  const pushToast = useCallback((message: string, error = false) => {
    setToast({ message, error });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5200);
    return () => clearTimeout(t);
  }, [toast]);

  const categoryOptions = useMemo(() => buildCategoryFilterOptions(allRows), [allRows]);

  const applyRows = useCallback((items: InventoryRow[]) => {
    setAllRows(items);
    const s: Record<string, { onHand: number; lowStockThreshold: number }> = {};
    const oh: Record<string, string> = {};
    const th: Record<string, string> = {};
    for (const r of items) {
      s[r.variantId] = { onHand: r.onHand, lowStockThreshold: r.lowStockThreshold };
      oh[r.variantId] = String(r.onHand);
      th[r.variantId] = String(r.lowStockThreshold);
    }
    setSaved(s);
    setOnHandDrafts(oh);
    setThresholdDrafts(th);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const data = await fetchAdminInventory({ all: true });
      applyRows(data.items);
      setLastZohoSync(data.meta.lastZohoStockSyncAt);
      setZohoAuditAvailable(data.meta.zohoSkuAuditAvailable);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load inventory");
      setAllRows([]);
    } finally {
      setLoading(false);
    }
  }, [applyRows]);

  useEffect(() => {
    void load();
  }, [load]);

  const unsavedChanges = useMemo(() => {
    const changes: Array<{
      variantId: string;
      onHand?: number;
      lowStockThreshold?: number;
    }> = [];
    for (const id of Object.keys(saved)) {
      const orig = saved[id];
      if (!orig) continue;
      const ohRaw = onHandDrafts[id];
      const thRaw = thresholdDrafts[id];
      const oh = ohRaw !== undefined ? parseInt(ohRaw, 10) : orig.onHand;
      const th = thRaw !== undefined ? parseInt(thRaw, 10) : orig.lowStockThreshold;
      const patch: { variantId: string; onHand?: number; lowStockThreshold?: number } = {
        variantId: id
      };
      let dirty = false;
      if (Number.isFinite(oh) && oh >= 0 && oh !== orig.onHand) {
        patch.onHand = oh;
        dirty = true;
      }
      if (Number.isFinite(th) && th >= 0 && th !== orig.lowStockThreshold) {
        patch.lowStockThreshold = th;
        dirty = true;
      }
      if (dirty) changes.push(patch);
    }
    return changes;
  }, [saved, onHandDrafts, thresholdDrafts]);

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
    const counts = { all: 0, in_stock: 0, low_stock: 0, out_of_stock: 0 };
    for (const r of searchFiltered) {
      counts.all++;
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

  const productGroups = useMemo(() => groupRowsByProduct(displayedRows), [displayedRows]);
  const categoryGroups = useMemo(() => groupRowsByCategory(displayedRows), [displayedRows]);
  const stats = useMemo(() => computeInventoryStats(allRows), [allRows]);

  const zohoUnmatchedTotal = useMemo(
    () => (zohoAuditAvailable ? allRows.filter((r) => r.inZohoBooks === false).length : 0),
    [allRows, zohoAuditAvailable]
  );

  useEffect(() => {
    const q = search.trim();
    if (!q) return;
    setExpandedProducts(new Set(displayedRows.map((r) => r.productId)));
  }, [search, displayedRows]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  function rowHasUnsaved(variantId: string): boolean {
    return unsavedChanges.some((c) => c.variantId === variantId);
  }

  function toggleProductExpanded(productId: string) {
    setExpandedProducts((prev) => {
      const next = new Set(prev);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
  }

  async function saveRow(variantId: string) {
    const change = unsavedChanges.find((c) => c.variantId === variantId);
    if (!change) return;
    const ohRaw = onHandDrafts[variantId];
    const thRaw = thresholdDrafts[variantId];
    const oh = ohRaw !== undefined ? parseInt(ohRaw, 10) : NaN;
    const th = thRaw !== undefined ? parseInt(thRaw, 10) : NaN;
    if (change.onHand !== undefined && (!Number.isFinite(oh) || oh < 0)) {
      setErr("Enter a valid non-negative on-hand quantity");
      return;
    }
    if (change.lowStockThreshold !== undefined && (!Number.isFinite(th) || th < 0)) {
      setErr("Enter a valid non-negative threshold");
      return;
    }
    setBusy(variantId);
    setErr(null);
    try {
      await patchAdminInventoryVariant(variantId, {
        ...(change.onHand !== undefined ? { onHand: change.onHand } : {}),
        ...(change.lowStockThreshold !== undefined
          ? { lowStockThreshold: change.lowStockThreshold }
          : {})
      });
      pushToast("Variant saved");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusy(null);
    }
  }

  async function saveAllChanges() {
    if (unsavedChanges.length === 0) return;
    for (const c of unsavedChanges) {
      const ohRaw = onHandDrafts[c.variantId];
      const thRaw = thresholdDrafts[c.variantId];
      if (c.onHand !== undefined) {
        const oh = parseInt(ohRaw ?? "", 10);
        if (!Number.isFinite(oh) || oh < 0) {
          setErr("Fix invalid on-hand values before saving");
          return;
        }
      }
      if (c.lowStockThreshold !== undefined) {
        const th = parseInt(thRaw ?? "", 10);
        if (!Number.isFinite(th) || th < 0) {
          setErr("Fix invalid threshold values before saving");
          return;
        }
      }
    }
    setBulkSaving(true);
    setErr(null);
    try {
      const { updated } = await bulkPatchAdminInventory(unsavedChanges);
      pushToast(`Saved ${updated} change${updated === 1 ? "" : "s"}`);
      await load();
    } catch (e) {
      pushToast(e instanceof Error ? e.message : "Bulk save failed", true);
    } finally {
      setBulkSaving(false);
    }
  }

  async function syncFromZoho() {
    setZohoSyncing(true);
    setErr(null);
    try {
      const result = await syncStockFromZohoAdmin();
      pushToast(`✅ Synced ${result.synced} products from Zoho Books`);
      await load();
    } catch (e) {
      pushToast(e instanceof Error ? e.message : "Zoho stock sync failed", true);
    } finally {
      setZohoSyncing(false);
    }
  }

  function exportCsv() {
    downloadCsv(
      `sarveda-inventory-${new Date().toISOString().slice(0, 10)}.csv`,
      inventoryToCsv(displayedRows)
    );
    pushToast(`Exported ${displayedRows.length} rows`);
  }

  async function onImportFile(file: File) {
    setImporting(true);
    setErr(null);
    try {
      const text = await file.text();
      const rows = parseInventoryImportCsv(text);
      if (rows.length === 0) {
        pushToast("No valid rows — CSV needs SKU and On Hand columns", true);
        return;
      }
      const result = await importAdminInventoryCsv(rows);
      pushToast(
        `Updated ${result.updated} items, ${result.notFound} SKU${result.notFound === 1 ? "" : "s"} not found.`
      );
      await load();
    } catch (e) {
      pushToast(e instanceof Error ? e.message : "Import failed", true);
    } finally {
      setImporting(false);
      if (importInputRef.current) importInputRef.current.value = "";
    }
  }

  const variantTableHeader = (
    <thead className="border-b border-stone-100 bg-stone-50 dark:border-stone-700 dark:bg-stone-800/80">
      <tr>
        <th className="px-4 py-2 font-semibold text-stone-600 dark:text-stone-300">Variant</th>
        <th className="px-4 py-2">
          <SortHeader label="SKU" active={sortKey === "sku"} dir={sortDir} onClick={() => toggleSort("sku")} />
        </th>
        <th className="px-4 py-2 font-semibold text-stone-600 dark:text-stone-300">Zoho</th>
        <th className="px-4 py-2 font-semibold text-stone-600 dark:text-stone-300" title="What customers can buy now (on hand minus reserved)">
          Available
        </th>
        <th className="px-4 py-2 font-semibold text-stone-600 dark:text-stone-300" title="Physical count in warehouse — edit after stocktake">
          On hand
        </th>
        <th className="px-4 py-2 font-semibold text-stone-600 dark:text-stone-300">Threshold</th>
        <th className="px-4 py-2 font-semibold text-stone-600 dark:text-stone-300">Save</th>
      </tr>
    </thead>
  );

  function renderVariantRows(rows: InventoryRow[]) {
    if (rows.length === 0) {
      return (
        <tr>
          <td colSpan={7} className="px-4 py-6 text-center text-stone-500">
            No variants match your filters.
          </td>
        </tr>
      );
    }
    return rows.map((r) => {
      const unsaved = rowHasUnsaved(r.variantId);
      return (
        <tr
          key={r.variantId}
          className={`${r.low ? "bg-red-50/40 dark:bg-red-950/20" : ""} ${
            unsaved ? "border-l-4 border-l-amber-500" : ""
          }`}
        >
          <td className="px-4 py-2 text-xs text-stone-600 dark:text-stone-400">
            {r.variantLabel ?? "Default"}
            {r.low ? (
              <span className="ml-1 rounded bg-red-200 px-1 py-0.5 text-[10px] font-bold uppercase text-red-900 dark:bg-red-900/70 dark:text-red-100">
                Low
              </span>
            ) : null}
          </td>
          <td className="px-4 py-2 font-mono text-xs">{r.sku}</td>
          <td className="max-w-[12rem] px-4 py-2">
            <ZohoSkuStatus
              sku={r.sku}
              inZoho={r.inZohoBooks}
              auditAvailable={zohoAuditAvailable}
              compact
            />
          </td>
          <td className="px-4 py-2">
            <span className="font-mono text-sm font-semibold text-stone-800 dark:text-stone-100">
              {r.available}
            </span>
            {r.reserved > 0 ? (
              <p className="text-[10px] text-stone-500 dark:text-stone-400">
                {r.onHand} on hand · {r.reserved} reserved
              </p>
            ) : null}
          </td>
          <td className="px-4 py-2">
            <input
              type="number"
              min={0}
              value={onHandDrafts[r.variantId] ?? ""}
              onChange={(e) =>
                setOnHandDrafts((d) => ({ ...d, [r.variantId]: e.target.value }))
              }
              className="w-20 rounded-md border border-stone-300 px-2 py-1 font-mono text-sm dark:border-stone-600 dark:bg-stone-950 dark:text-stone-100"
            />
          </td>
          <td className="px-4 py-2">
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
          <td className="px-4 py-2">
            <button
              type="button"
              disabled={busy === r.variantId || !unsaved}
              onClick={() => void saveRow(r.variantId)}
              className="rounded-lg bg-stone-900 px-3 py-1 text-xs font-medium text-amber-400 disabled:opacity-40 dark:bg-stone-700"
            >
              {busy === r.variantId ? "…" : "Save"}
            </button>
          </td>
        </tr>
      );
    });
  }

  function renderProductGroups(groups: ReturnType<typeof groupRowsByProduct>) {
    return (
      <div className="space-y-3">
        {groups.map((g) => {
          const expanded = expandedProducts.has(g.productId);
          const adminHref = `/admin/products/${g.productId}`;
          return (
            <section
              key={g.productId}
              className="overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm dark:border-stone-700 dark:bg-stone-900"
            >
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-stone-100 bg-stone-50 px-4 py-3 dark:border-stone-700 dark:bg-stone-800/80">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => toggleProductExpanded(g.productId)}
                      className="text-left font-semibold text-stone-800 dark:text-stone-100"
                    >
                      {expanded ? "▾" : "▸"} {g.productName}
                    </button>
                    <Link
                      href={adminHref}
                      className="rounded-md border border-amber-600/40 bg-amber-950/30 px-2 py-0.5 text-xs font-medium text-amber-400 hover:bg-amber-900/40"
                    >
                      Edit product
                    </Link>
                  </div>
                  <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">
                    {g.variantCount} variant{g.variantCount === 1 ? "" : "s"} · {g.totalAvailable} available
                    {g.totalReserved > 0 ? ` · ${g.totalReserved} reserved` : ""}
                    {g.outCount > 0 ? ` · ${g.outCount} out of stock` : ""}
                    {g.lowCount > 0 ? ` · ${g.lowCount} low` : ""}
                  </p>
                  {zohoAuditAvailable && g.zohoUnmatched > 0 ? (
                    <p className="mt-1 text-xs font-medium text-amber-600 dark:text-amber-400">
                      {g.zohoUnmatched} SKU{g.zohoUnmatched === 1 ? "" : "s"} not in Zoho — fix before invoicing
                    </p>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => toggleProductExpanded(g.productId)}
                  className="text-sm text-amber-700 hover:underline dark:text-amber-400"
                >
                  {expanded ? "Hide variants" : "Edit stock by variant"}
                </button>
              </div>
              {expanded ? (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    {variantTableHeader}
                    <tbody className="divide-y divide-stone-100 dark:divide-stone-700">
                      {renderVariantRows(g.rows)}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </section>
          );
        })}
      </div>
    );
  }

  const stockTabs: { id: StockFilter; label: string }[] = [
    { id: "all", label: "All" },
    { id: "in_stock", label: "In Stock" },
    { id: "low_stock", label: "Low Stock" },
    { id: "out_of_stock", label: "Out of Stock" }
  ];

  const useProductGroups = groupByProduct && !groupByCategory && !flatList;

  return (
    <div className="space-y-6">
      {toast ? (
        <div
          className={`fixed bottom-6 left-1/2 z-[110] max-w-md -translate-x-1/2 rounded-xl border px-4 py-3 text-sm shadow-lg ${
            toast.error
              ? "border-red-300 bg-red-950 text-red-50 dark:border-red-800"
              : "border-stone-300 bg-stone-900 text-amber-50 dark:border-stone-600"
          }`}
          role="status"
        >
          {toast.message}
        </div>
      ) : null}

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-3xl italic text-stone-800 dark:text-stone-100">Inventory</h1>
          <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
            Products are grouped — expand to edit stock per variant. Catalogue edits open in Admin → Products.
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={() => exportCsv()}
              disabled={loading || displayedRows.length === 0}
              className="rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 hover:border-amber-400 disabled:opacity-50 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-200"
            >
              Export CSV
            </button>
            <button
              type="button"
              disabled={importing}
              onClick={() => importInputRef.current?.click()}
              className="rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 hover:border-amber-400 disabled:opacity-50 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-200"
            >
              {importing ? "Importing…" : "Import CSV"}
            </button>
            <input
              ref={importInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onImportFile(f);
              }}
            />
            <button
              type="button"
              disabled={bulkSaving || unsavedChanges.length === 0}
              onClick={() => void saveAllChanges()}
              className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-semibold text-amber-400 hover:bg-stone-800 disabled:opacity-50 dark:bg-stone-700"
            >
              {bulkSaving
                ? "Saving…"
                : unsavedChanges.length > 0
                  ? `Save ${unsavedChanges.length} change${unsavedChanges.length === 1 ? "" : "s"}`
                  : "Save all changes"}
            </button>
            <button
              type="button"
              disabled={zohoSyncing}
              onClick={() => void syncFromZoho()}
              className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-stone-900 hover:bg-amber-400 disabled:opacity-60"
            >
              {zohoSyncing ? (
                <>
                  <span
                    className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-stone-900 border-t-transparent"
                    aria-hidden
                  />
                  Syncing…
                </>
              ) : (
                "Sync from Zoho"
              )}
            </button>
          </div>
          <p className="text-xs text-stone-500 dark:text-stone-400">
            Last synced: {formatRelativeTime(lastZohoSync)}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-4 rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm shadow-sm dark:border-stone-700 dark:bg-stone-900">
        <div>
          <span className="text-stone-500">Total variants: </span>
          <span className="font-semibold text-stone-800 dark:text-stone-100">{stats.total}</span>
        </div>
        <div>
          <span className="text-stone-500">In stock: </span>
          <span className="font-semibold">{stats.inStock}</span>
        </div>
        <div>
          <span className="text-stone-500">Low stock: </span>
          <span className="font-semibold text-amber-700 dark:text-amber-400">{stats.lowStock}</span>
        </div>
        <div>
          <span className="text-stone-500">Out of stock: </span>
          <span className="font-semibold text-red-700 dark:text-red-400">{stats.outOfStock}</span>
        </div>
        {zohoAuditAvailable && zohoUnmatchedTotal > 0 ? (
          <div className="border-l border-stone-200 pl-4 dark:border-stone-600">
            <span className="font-medium text-amber-700 dark:text-amber-400">
              {zohoUnmatchedTotal} SKUs not in Zoho
            </span>
          </div>
        ) : null}
      </div>

      <aside className="grid gap-4 rounded-xl border border-stone-200 bg-stone-50 p-4 text-sm dark:border-stone-700 dark:bg-stone-900 md:grid-cols-2">
        <div>
          <p className="font-medium text-stone-800 dark:text-stone-100">Stock columns</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-stone-600 dark:text-stone-400">
            <li>
              <strong>Available</strong> — what the shop can sell now (on hand minus reserved at checkout).
            </li>
            <li>
              <strong>On hand</strong> — warehouse physical count; edit after stocktake or import CSV.
            </li>
            <li>
              <strong>Reserved</strong> — held for unpaid orders (~15 min); shown under Available when &gt; 0.
            </li>
          </ul>
        </div>
        <div>
          <p className="font-medium text-stone-800 dark:text-stone-100">Zoho Books sync</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-stone-600 dark:text-stone-400">
            <li>
              <strong>In Zoho</strong> — SKU matches; use Sync from Zoho or wait for nightly 2 AM job.
            </li>
            <li>
              <strong>Not in Zoho</strong> — add item in Zoho with same SKU, or fix SKU under Edit product.
            </li>
            <li>
              <strong>Unknown</strong> — run Sync from Zoho once to refresh SKU audit.
            </li>
          </ul>
        </div>
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
        <div className="flex flex-col gap-2 pb-1 text-sm text-stone-700 dark:text-stone-300">
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={groupByProduct && !flatList && !groupByCategory}
              onChange={(e) => {
                setGroupByProduct(e.target.checked);
                if (e.target.checked) {
                  setFlatList(false);
                  setGroupByCategory(false);
                }
              }}
              className="rounded border-stone-400 text-amber-600"
            />
            Group by product (recommended)
          </label>
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={groupByCategory}
              onChange={(e) => {
                setGroupByCategory(e.target.checked);
                if (e.target.checked) setFlatList(false);
              }}
              className="rounded border-stone-400 text-amber-600"
            />
            Group by category
          </label>
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={flatList}
              onChange={(e) => {
                setFlatList(e.target.checked);
                if (e.target.checked) {
                  setGroupByCategory(false);
                }
              }}
              className="rounded border-stone-400 text-amber-600"
            />
            Flat variant list
          </label>
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
      ) : useProductGroups ? (
        renderProductGroups(productGroups)
      ) : groupByCategory ? (
        <div className="space-y-4">
          {categoryGroups.map((g) => {
            const collapsed = collapsedCats.has(g.slug);
            return (
              <section
                key={g.slug}
                className="overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm dark:border-stone-700 dark:bg-stone-900"
              >
                <button
                  type="button"
                  onClick={() =>
                    setCollapsedCats((prev) => {
                      const next = new Set(prev);
                      if (next.has(g.slug)) next.delete(g.slug);
                      else next.add(g.slug);
                      return next;
                    })
                  }
                  className="flex w-full items-center justify-between gap-3 border-b border-stone-100 bg-stone-50 px-4 py-3 text-left dark:border-stone-700 dark:bg-stone-800/80"
                >
                  <span className="font-semibold text-stone-800 dark:text-stone-100">
                    {collapsed ? "▸" : "▾"} {g.name}
                  </span>
                  <span className="text-sm text-stone-500">
                    {g.variantCount} variants
                    {g.lowCount > 0 ? `, ${g.lowCount} low` : ""}
                  </span>
                </button>
                {!collapsed ? (
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-left text-sm">
                      {variantTableHeader}
                      <tbody className="divide-y divide-stone-100 dark:divide-stone-700">
                        {renderVariantRows(g.rows)}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </section>
            );
          })}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white shadow-sm dark:border-stone-700 dark:bg-stone-900">
          <p className="border-b border-stone-100 px-4 py-2 text-xs text-stone-500 dark:border-stone-700">
            Flat list — use Group by product for easier editing.
          </p>
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-stone-100 bg-stone-50 dark:border-stone-700 dark:bg-stone-800/80">
              <tr>
                <th className="px-4 py-2">
                  <SortHeader
                    label="Product"
                    active={sortKey === "product"}
                    dir={sortDir}
                    onClick={() => toggleSort("product")}
                  />
                </th>
                <th className="px-4 py-2 font-semibold text-stone-600 dark:text-stone-300">Variant</th>
                <th className="px-4 py-2">
                  <SortHeader label="SKU" active={sortKey === "sku"} dir={sortDir} onClick={() => toggleSort("sku")} />
                </th>
                <th className="px-4 py-2 font-semibold text-stone-600 dark:text-stone-300">Zoho</th>
                <th className="px-4 py-2 font-semibold text-stone-600 dark:text-stone-300">Available</th>
                <th className="px-4 py-2 font-semibold text-stone-600 dark:text-stone-300">On hand</th>
                <th className="px-4 py-2 font-semibold text-stone-600 dark:text-stone-300">Threshold</th>
                <th className="px-4 py-2 font-semibold text-stone-600 dark:text-stone-300">Save</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 dark:divide-stone-700">
              {displayedRows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-6 text-center text-stone-500">
                    No variants match your filters.
                  </td>
                </tr>
              ) : (
                displayedRows.map((r) => {
                  const unsaved = rowHasUnsaved(r.variantId);
                  return (
                    <tr
                      key={r.variantId}
                      className={`${unsaved ? "border-l-4 border-l-amber-500" : ""} ${
                        r.low ? "bg-red-50/40 dark:bg-red-950/20" : ""
                      }`}
                    >
                      <td className="px-4 py-2">
                        <Link
                          href={`/admin/products/${r.productId}`}
                          className="font-medium text-amber-800 hover:underline dark:text-amber-400"
                        >
                          {r.productName}
                        </Link>
                      </td>
                      <td className="px-4 py-2 text-xs text-stone-600 dark:text-stone-400">
                        {r.variantLabel ?? "Default"}
                      </td>
                      <td className="px-4 py-2 font-mono text-xs">{r.sku}</td>
                      <td className="max-w-[12rem] px-4 py-2">
                        <ZohoSkuStatus
                          sku={r.sku}
                          inZoho={r.inZohoBooks}
                          auditAvailable={zohoAuditAvailable}
                          compact
                        />
                      </td>
                      <td className="px-4 py-2 font-mono text-sm font-semibold">{r.available}</td>
                      <td className="px-4 py-2">
                        <input
                          type="number"
                          min={0}
                          value={onHandDrafts[r.variantId] ?? ""}
                          onChange={(e) =>
                            setOnHandDrafts((d) => ({ ...d, [r.variantId]: e.target.value }))
                          }
                          className="w-20 rounded-md border border-stone-300 px-2 py-1 font-mono text-sm dark:border-stone-600 dark:bg-stone-950 dark:text-stone-100"
                        />
                      </td>
                      <td className="px-4 py-2">
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
                      <td className="px-4 py-2">
                        <button
                          type="button"
                          disabled={busy === r.variantId || !unsaved}
                          onClick={() => void saveRow(r.variantId)}
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

      <p className="text-xs text-stone-500 dark:text-stone-400">
        Showing {displayedRows.length} variant{displayedRows.length === 1 ? "" : "s"} across{" "}
        {useProductGroups ? productGroups.length : "—"} product
        {useProductGroups && productGroups.length !== 1 ? "s" : ""}
        {search || categorySlug || stockFilter !== "all" ? " (filtered)" : ""}.
      </p>
    </div>
  );
}
