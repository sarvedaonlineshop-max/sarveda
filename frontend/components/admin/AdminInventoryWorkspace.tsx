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
import { fetchCategoryTree } from "@/lib/api";
import {
  computeInventoryStats,
  downloadCsv,
  formatRelativeTime,
  groupRowsByCategory,
  inventoryToCsv,
  matchesStockFilter,
  parseInventoryImportCsv,
  sortInventoryRows,
  type SortDir,
  type SortKey,
  type StockFilter
} from "@/lib/inventory-utils";
import type { CategoryNode } from "@/lib/types";

function flattenCategories(nodes: CategoryNode[]): { slug: string; name: string }[] {
  const out: { slug: string; name: string }[] = [];
  for (const n of nodes) {
    out.push({ slug: n.slug, name: n.name });
    if (n.children?.length) out.push(...flattenCategories(n.children));
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

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

function ZohoStatusIcon({ inZoho }: { inZoho: boolean | null }) {
  if (inZoho === null) return null;
  if (inZoho) {
    return (
      <span
        className="inline-block h-2 w-2 shrink-0 rounded-full bg-emerald-500"
        title="In Zoho Books"
        aria-label="In Zoho Books"
      />
    );
  }
  return (
    <span
      className="cursor-help text-amber-600 dark:text-amber-400"
      title="Not in Zoho Books — invoice will fail"
      aria-label="Not in Zoho Books"
    >
      ⚠
    </span>
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
  const [groupByCategory, setGroupByCategory] = useState(false);
  const [collapsedCats, setCollapsedCats] = useState<Set<string>>(new Set());
  const [categoryOptions, setCategoryOptions] = useState<{ slug: string; name: string }[]>([]);

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
    fetchCategoryTree({ cache: "no-store" })
      .then((tree) => setCategoryOptions(flattenCategories(tree)))
      .catch(() => {});
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

  const stats = useMemo(() => computeInventoryStats(allRows), [allRows]);
  const categoryGroups = useMemo(() => groupRowsByCategory(displayedRows), [displayedRows]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir(key === "onHand" ? "asc" : "asc");
    }
  }

  function rowHasUnsaved(variantId: string): boolean {
    return unsavedChanges.some((c) => c.variantId === variantId);
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
      pushToast("Row saved");
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

  const stockTabs: { id: StockFilter; label: string }[] = [
    { id: "all", label: "All" },
    { id: "in_stock", label: "In Stock" },
    { id: "low_stock", label: "Low Stock" },
    { id: "out_of_stock", label: "Out of Stock" }
  ];

  function renderTableBody(rows: InventoryRow[]) {
    if (rows.length === 0) {
      return (
        <tr>
          <td colSpan={8} className="px-4 py-8 text-center text-stone-500">
            No SKUs match your filters.
          </td>
        </tr>
      );
    }
    return rows.map((r) => {
      const unsaved = rowHasUnsaved(r.variantId);
      return (
        <tr
          key={r.variantId}
          className={`${r.low ? "bg-red-50/80 dark:bg-red-950/30" : ""} ${
            unsaved ? "border-l-4 border-l-amber-500" : ""
          }`}
        >
          <td className="px-4 py-3">
            <div className="flex items-start gap-2">
              <ZohoStatusIcon inZoho={zohoAuditAvailable ? r.inZohoBooks : null} />
              <div>
                <Link
                  href={`/product/${r.productSlug}`}
                  className="font-medium text-amber-800 hover:underline dark:text-amber-400"
                >
                  {r.productName}
                </Link>
                {r.low ? (
                  <span className="ml-2 rounded bg-red-200 px-1.5 py-0.5 text-[10px] font-bold uppercase text-red-900 dark:bg-red-900/70 dark:text-red-100">
                    Low
                  </span>
                ) : null}
              </div>
            </div>
          </td>
          <td className="max-w-[10rem] px-4 py-3 text-xs text-stone-600 dark:text-stone-400">
            {r.variantLabel ?? "Default"}
          </td>
          <td className="px-4 py-3 font-mono text-xs">{r.sku}</td>
          <td className="px-4 py-3">
            <input
              type="number"
              min={0}
              value={onHandDrafts[r.variantId] ?? ""}
              onChange={(e) =>
                setOnHandDrafts((d) => ({ ...d, [r.variantId]: e.target.value }))
              }
              className={`w-20 rounded-md border px-2 py-1 font-mono text-sm dark:bg-stone-950 dark:text-stone-100 ${
                r.low ? "border-red-300 dark:border-red-700" : "border-stone-300 dark:border-stone-600"
              }`}
            />
          </td>
          <td className="px-4 py-3 font-mono text-sm">{r.reserved}</td>
          <td className="px-4 py-3 font-mono text-sm">{r.available}</td>
          <td className="px-4 py-3">
            <input
              type="number"
              min={0}
              value={thresholdDrafts[r.variantId] ?? ""}
              onChange={(e) =>
                setThresholdDrafts((d) => ({ ...d, [r.variantId]: e.target.value }))
              }
              className="w-16 rounded-md border border-stone-300 px-2 py-1 font-mono text-sm dark:border-stone-600 dark:bg-stone-950 dark:text-stone-100"
            />
          </td>
          <td className="px-4 py-3">
            <button
              type="button"
              disabled={busy === r.variantId || !unsaved}
              onClick={() => void saveRow(r.variantId)}
              className="rounded-lg bg-stone-900 px-3 py-1 text-xs font-medium text-amber-400 disabled:opacity-40 dark:bg-stone-700 dark:text-amber-300"
            >
              {busy === r.variantId ? "…" : "Save"}
            </button>
          </td>
        </tr>
      );
    });
  }

  const tableHeader = (
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
        <th className="px-4 py-3">
          <SortHeader
            label="On hand"
            active={sortKey === "onHand"}
            dir={sortDir}
            onClick={() => toggleSort("onHand")}
          />
        </th>
        <th className="px-4 py-3 font-semibold text-stone-600 dark:text-stone-300">Reserved</th>
        <th className="px-4 py-3 font-semibold text-stone-600 dark:text-stone-300">Available</th>
        <th className="px-4 py-3 font-semibold text-stone-600 dark:text-stone-300">Threshold</th>
        <th className="px-4 py-3 font-semibold text-stone-600 dark:text-stone-300">Save</th>
      </tr>
    </thead>
  );

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
            Search, filter, and bulk-edit stock across all SKUs. Zoho sync updates on-hand from Books.
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
            {!zohoAuditAvailable ? " · Run Zoho sync for SKU match indicators" : null}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-4 rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm shadow-sm dark:border-stone-700 dark:bg-stone-900">
        <div>
          <span className="text-stone-500 dark:text-stone-400">Total variants: </span>
          <span className="font-semibold text-stone-800 dark:text-stone-100">{stats.total}</span>
        </div>
        <div>
          <span className="text-stone-500 dark:text-stone-400">In stock: </span>
          <span className="font-semibold text-stone-800 dark:text-stone-100">{stats.inStock}</span>
        </div>
        <div>
          <span className="text-stone-500 dark:text-stone-400">Low stock: </span>
          <span className="font-semibold text-amber-700 dark:text-amber-400">{stats.lowStock}</span>
        </div>
        <div>
          <span className="text-stone-500 dark:text-stone-400">Out of stock: </span>
          <span className="font-semibold text-red-700 dark:text-red-400">{stats.outOfStock}</span>
        </div>
        <div className="border-l border-stone-200 pl-4 dark:border-stone-600">
          <span className="text-stone-500 dark:text-stone-400">Last Zoho sync: </span>
          <span className="font-medium text-stone-700 dark:text-stone-200">
            {lastZohoSync ? formatRelativeTime(lastZohoSync) : "Never"}
          </span>
        </div>
      </div>

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
        <div className="min-w-[10rem]">
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
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <label className="flex cursor-pointer items-center gap-2 pb-2 text-sm text-stone-700 dark:text-stone-300">
          <input
            type="checkbox"
            checked={groupByCategory}
            onChange={(e) => setGroupByCategory(e.target.checked)}
            className="rounded border-stone-400 text-amber-600"
          />
          Group by category
        </label>
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
                  <span className="text-sm text-stone-500 dark:text-stone-400">
                    {g.variantCount} variant{g.variantCount === 1 ? "" : "s"}
                    {g.lowCount > 0 ? `, ${g.lowCount} low stock` : ""}
                  </span>
                </button>
                {!collapsed ? (
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-left text-sm">
                      {tableHeader}
                      <tbody className="divide-y divide-stone-100 dark:divide-stone-700">
                        {renderTableBody(g.rows)}
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
          <table className="min-w-full text-left text-sm">
            {tableHeader}
            <tbody className="divide-y divide-stone-100 dark:divide-stone-700">
              {renderTableBody(displayedRows)}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-stone-500 dark:text-stone-400">
        Showing {displayedRows.length} of {allRows.length} SKUs
        {search || categorySlug || stockFilter !== "all" ? " (filtered)" : ""}.
        {zohoAuditAvailable ? " ⚠ = SKU not found in last Zoho Books sync." : null}
      </p>
    </div>
  );
}
