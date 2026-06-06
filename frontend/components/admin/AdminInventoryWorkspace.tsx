"use client";

import Link from "next/link";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";

import type {
  InventoryRow,
  ZohoOnlyItem,
  ZohoStockSyncHistoryEntry,
  ZohoSyncSummary
} from "@/lib/admin-api";
import {
  bulkPatchAdminInventory,
  fetchAdminInventory,
  fetchZohoStockSyncHistory,
  ignoreZohoItemsAdmin,
  importAdminInventoryCsv,
  patchAdminInventoryVariant,
  pullStockFromZohoAdmin,
  pushItemsToZohoAdmin,
  pushStockToZohoAdmin,
  refreshZohoAuditAdmin
} from "@/lib/admin-api";
import {
  buildCategoryFilterOptions,
  computeInventoryStats,
  downloadCsv,
  filterZohoOnlyItems,
  formatRelativeTime,
  groupRowsByProductInOrder,
  inventoryToCsv,
  matchesStockFilter,
  parseInventoryImportCsv,
  sortInventoryRows,
  type ProductInventoryGroup,
  type SortDir,
  type SortKey,
  type StockFilter,
  type ZohoSyncSubFilter
} from "@/lib/inventory-utils";

function IconSearch({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M11 18a7 7 0 100-14 7 7 0 000 14z" />
    </svg>
  );
}

function IconChevron({ open }: { open: boolean }) {
  return (
    <svg
      className={`h-4 w-4 text-stone-400 transition-transform ${open ? "rotate-90" : ""}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  );
}

function IconRefresh({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
      />
    </svg>
  );
}

function IconUpload({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
      />
    </svg>
  );
}

function IconDownload({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
      />
    </svg>
  );
}

function MetricCard({
  label,
  value,
  tone = "default",
  onClick
}: {
  label: string;
  value: string | number;
  tone?: "default" | "amber" | "red" | "emerald";
  onClick?: () => void;
}) {
  const valueClass =
    tone === "amber"
      ? "text-amber-700 dark:text-amber-400"
      : tone === "red"
        ? "text-red-700 dark:text-red-400"
        : tone === "emerald"
          ? "text-emerald-700 dark:text-emerald-400"
          : "text-stone-900 dark:text-stone-100";

  const inner = (
    <>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-stone-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${valueClass}`}>{value}</p>
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="w-full rounded-lg px-3 py-2 text-left hover:bg-amber-50/60 dark:hover:bg-amber-950/20"
      >
        {inner}
      </button>
    );
  }
  return <div className="px-3 py-2">{inner}</div>;
}

function ZohoBadge({
  scenario,
  zohoStock,
  auditAvailable
}: {
  scenario: InventoryRow["zohoSyncScenario"];
  zohoStock: number | null;
  auditAvailable: boolean;
}) {
  if (!auditAvailable) return <span className="text-xs text-stone-400">—</span>;
  if (scenario === 1) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800 ring-1 ring-emerald-200/80 dark:bg-emerald-950/50 dark:text-emerald-300 dark:ring-emerald-800">
        Synced
      </span>
    );
  }
  if (scenario === 2) {
    return (
      <span className="inline-flex flex-col gap-0.5 text-xs">
        <span className="inline-flex rounded-full bg-amber-50 px-2 py-0.5 font-medium text-amber-900 ring-1 ring-amber-200/80 dark:bg-amber-950/40 dark:text-amber-200 dark:ring-amber-800">
          Count mismatch
        </span>
        {zohoStock !== null ? (
          <span className="text-[10px] text-stone-500">Zoho: {zohoStock}</span>
        ) : null}
      </span>
    );
  }
  if (scenario === 4) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-orange-50 px-2 py-0.5 text-xs font-medium text-orange-900 ring-1 ring-orange-200/80 dark:bg-orange-950/40 dark:text-orange-200 dark:ring-orange-800">
        Not in Zoho
      </span>
    );
  }
  return <span className="text-xs text-stone-400">Unknown</span>;
}

function scopeLabel(entry: ZohoStockSyncHistoryEntry): string {
  if (entry.scope === "audit") return "Refresh audit";
  if (entry.scope === "pull") return "Pull stock (Zoho → Sarveda)";
  if (entry.scope === "push") return "Push stock (Sarveda → Zoho)";
  if (entry.scope === "push_items") return "Push items to Zoho";
  if (entry.scope === "inactive") return "Mark Zoho inactive";
  if (entry.scope === "full") return "Sync all";
  if (entry.scope === "unmatched") return "Sync unmatched";
  return entry.productName ? `Product: ${entry.productName}` : "Product sync";
}

export function AdminInventoryWorkspace() {
  const [allRows, setAllRows] = useState<InventoryRow[]>([]);
  const [productCount, setProductCount] = useState(0);
  const [savedThresholds, setSavedThresholds] = useState<Record<string, number>>({});
  const [thresholdDrafts, setThresholdDrafts] = useState<Record<string, string>>({});
  const [syncHistory, setSyncHistory] = useState<ZohoStockSyncHistoryEntry[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [lastZohoSync, setLastZohoSync] = useState<string | null>(null);
  const [zohoAuditAvailable, setZohoAuditAvailable] = useState(false);
  const [zohoSyncSummary, setZohoSyncSummary] = useState<ZohoSyncSummary>({
    synced: 0,
    countMismatch: 0,
    zohoOnly: 0,
    sarvedaOnly: 0,
    outOfSync: 0
  });
  const [zohoOnlyItems, setZohoOnlyItems] = useState<ZohoOnlyItem[]>([]);

  const [search, setSearch] = useState("");
  const [stockFilter, setStockFilter] = useState<StockFilter>("all");
  const [zohoSubFilter, setZohoSubFilter] = useState<ZohoSyncSubFilter>("count_mismatch");
  const [categorySlug, setCategorySlug] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("product");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [expandedProducts, setExpandedProducts] = useState<Set<string>>(new Set());

  const [busy, setBusy] = useState<string | null>(null);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [zohoSyncing, setZohoSyncing] = useState<"audit" | "bulk" | string | null>(null);
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

  const loadHistory = useCallback(async () => {
    try {
      const data = await fetchZohoStockSyncHistory(25);
      setSyncHistory(data.entries);
    } catch {
      setSyncHistory([]);
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const data = await fetchAdminInventory({ all: true });
      setAllRows(data.items);
      setProductCount(data.meta.productCount);
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
      setZohoSyncSummary(
        data.meta.zohoSyncSummary ?? {
          synced: 0,
          countMismatch: 0,
          zohoOnly: 0,
          sarvedaOnly: 0,
          outOfSync: 0
        }
      );
      setZohoOnlyItems(data.meta.zohoOnlyItems ?? []);
      await loadHistory();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load inventory");
      setAllRows([]);
    } finally {
      setLoading(false);
    }
  }, [loadHistory]);

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
      out_of_sync: 0
    };
    for (const r of searchFiltered) {
      counts.all++;
      if (matchesStockFilter(r, "out_of_sync")) counts.out_of_sync++;
      if (matchesStockFilter(r, "in_stock")) counts.in_stock++;
      else if (matchesStockFilter(r, "low_stock")) counts.low_stock++;
      else if (matchesStockFilter(r, "out_of_stock")) counts.out_of_stock++;
    }
    return counts;
  }, [searchFiltered]);

  const zohoSubCounts = useMemo(
    () => ({
      count_mismatch: searchFiltered.filter((r) => r.zohoSyncScenario === 2).length,
      sarveda_only: searchFiltered.filter((r) => r.zohoSyncScenario === 4).length,
      zoho_only: filterZohoOnlyItems(zohoOnlyItems, search).length
    }),
    [searchFiltered, zohoOnlyItems, search]
  );

  const displayedRows = useMemo(() => {
    if (stockFilter === "out_of_sync" && zohoSubFilter === "zoho_only") return [];
    const filtered = searchFiltered.filter((r) =>
      matchesStockFilter(r, stockFilter, stockFilter === "out_of_sync" ? zohoSubFilter : undefined)
    );
    return sortInventoryRows(filtered, sortKey, sortDir);
  }, [searchFiltered, stockFilter, zohoSubFilter, sortKey, sortDir]);

  const displayedZohoOnly = useMemo(
    () => filterZohoOnlyItems(zohoOnlyItems, search),
    [zohoOnlyItems, search]
  );

  const productGroups = useMemo(
    () => groupRowsByProductInOrder(displayedRows),
    [displayedRows]
  );

  const filteredProductCount = useMemo(() => productGroups.length, [productGroups]);

  const stats = useMemo(() => computeInventoryStats(allRows), [allRows]);
  const outOfSyncTotal = zohoSyncSummary.outOfSync;

  const hasActiveFilter = Boolean(search.trim() || categorySlug || stockFilter !== "all");

  useEffect(() => {
    if (hasActiveFilter && productGroups.length > 0) {
      setExpandedProducts(new Set(productGroups.map((g) => g.productId)));
    }
  }, [hasActiveFilter, productGroups]);

  function toggleProduct(productId: string) {
    setExpandedProducts((prev) => {
      const next = new Set(prev);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
  }

  function expandAll() {
    setExpandedProducts(new Set(productGroups.map((g) => g.productId)));
  }

  function collapseAll() {
    setExpandedProducts(new Set());
  }

  async function saveThreshold(variantId: string) {
    const change = thresholdChanges.find((c) => c.variantId === variantId);
    if (!change) return;
    setBusy(variantId);
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

  async function runZohoAudit() {
    setZohoSyncing("audit");
    try {
      const result = await refreshZohoAuditAdmin();
      pushToast(`Audited ${result.zohoSkuCount} Zoho SKUs — ${result.summary.outOfSync} out of sync`);
      await load();
      setHistoryOpen(true);
    } catch (e) {
      pushToast(e instanceof Error ? e.message : "Zoho audit failed", true);
    } finally {
      setZohoSyncing(null);
    }
  }

  async function runRowAction(
    action: "pull" | "push" | "push_item" | "ignore",
    row: InventoryRow | ZohoOnlyItem
  ) {
    const sku = row.sku;
    setBusy(sku);
    try {
      let msg = "";
      if (action === "pull") {
        const r = await pullStockFromZohoAdmin([sku]);
        msg = r.ok ? `Pulled stock for ${sku}` : r.messages[0] ?? "Pull failed";
        if (r.errors) pushToast(msg, true);
        else pushToast(msg);
      } else if (action === "push") {
        const r = await pushStockToZohoAdmin([sku]);
        msg = r.ok ? `Pushed stock for ${sku}` : r.messages[0] ?? "Push failed";
        if (r.errors) pushToast(msg, true);
        else pushToast(msg);
      } else if (action === "push_item" && "variantId" in row) {
        const r = await pushItemsToZohoAdmin([row.variantId]);
        msg = r.ok ? `Pushed ${sku} to Zoho` : r.messages[0] ?? "Push failed";
        if (r.errors) pushToast(msg, true);
        else pushToast(msg);
      } else if (action === "ignore") {
        const r = await ignoreZohoItemsAdmin([sku]);
        msg = r.ok ? `Marked ${sku} inactive in Zoho` : r.messages[0] ?? "Action failed";
        if (r.errors) pushToast(msg, true);
        else pushToast(msg);
      }
      await load();
    } catch (e) {
      pushToast(e instanceof Error ? e.message : "Action failed", true);
    } finally {
      setBusy(null);
    }
  }

  async function runBulkZohoAction(action: "pull" | "push" | "push_item" | "ignore") {
    setZohoSyncing("bulk");
    try {
      if (action === "ignore") {
        const skus = displayedZohoOnly.map((i) => i.sku);
        if (skus.length === 0) return;
        const r = await ignoreZohoItemsAdmin(skus);
        pushToast(`Marked ${r.ok} item${r.ok === 1 ? "" : "s"} inactive in Zoho`, r.errors > 0);
      } else if (action === "push_item") {
        const ids = displayedRows.filter((r) => r.zohoSyncScenario === 4).map((r) => r.variantId);
        if (ids.length === 0) return;
        const r = await pushItemsToZohoAdmin(ids);
        pushToast(`Pushed ${r.ok} item${r.ok === 1 ? "" : "s"} to Zoho`, r.errors > 0);
      } else {
        const skus =
          zohoSubFilter === "count_mismatch"
            ? displayedRows.filter((r) => r.zohoSyncScenario === 2).map((r) => r.sku)
            : displayedRows.filter((r) => r.zohoSyncScenario === 4).map((r) => r.sku);
        if (skus.length === 0) return;
        const r =
          action === "pull" ? await pullStockFromZohoAdmin(skus) : await pushStockToZohoAdmin(skus);
        pushToast(
          `${action === "pull" ? "Pulled" : "Pushed"} stock for ${r.ok} SKU${r.ok === 1 ? "" : "s"}`,
          r.errors > 0
        );
      }
      await load();
    } catch (e) {
      pushToast(e instanceof Error ? e.message : "Bulk action failed", true);
    } finally {
      setZohoSyncing(null);
    }
  }

  async function runProductAudit(productId: string, _productName: string) {
    setZohoSyncing(productId);
    try {
      await refreshZohoAuditAdmin();
      pushToast("Zoho audit refreshed for product view");
      await load();
    } catch (e) {
      pushToast(e instanceof Error ? e.message : "Product audit failed", true);
    } finally {
      setZohoSyncing(null);
    }
  }

  async function onImportFile(file: File) {
    setImporting(true);
    try {
      const text = await file.text();
      const rows = parseInventoryImportCsv(text);
      if (rows.length === 0) {
        pushToast("CSV needs SKU and On Hand columns", true);
        return;
      }
      const result = await importAdminInventoryCsv(rows);
      pushToast(
        `Imported ${result.updated} rows (${result.notFound} SKU${result.notFound === 1 ? "" : "s"} not found). Refresh Zoho audit to compare counts.`
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
    { id: "in_stock", label: "In stock" },
    { id: "low_stock", label: "Low stock" },
    { id: "out_of_stock", label: "Out of stock" },
    { id: "out_of_sync", label: "Out of Sync with Zoho" }
  ];

  const zohoSubTabs: { id: ZohoSyncSubFilter; label: string }[] = [
    { id: "count_mismatch", label: "Count mismatch" },
    { id: "zoho_only", label: "In Zoho only" },
    { id: "sarveda_only", label: "Not in Zoho" }
  ];

  const actionBtn =
    "rounded-md px-2 py-1 text-[11px] font-semibold disabled:opacity-50";
  const actionForest = `${actionBtn} bg-[#1e3a2f] text-[#fffbf5] hover:bg-[#2d5240]`;
  const actionOutline = `${actionBtn} border border-stone-200 bg-white text-stone-700 dark:border-stone-600 dark:bg-stone-900 dark:text-stone-200`;

  const thClass =
    "px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400";

  function renderZohoRowActions(r: InventoryRow) {
    if (!zohoAuditAvailable || !r.zohoSyncScenario || r.zohoSyncScenario === 1) return null;
    const syncing = busy === r.sku || zohoSyncing !== null;

    if (r.zohoSyncScenario === 2) {
      return (
        <div className="flex flex-wrap justify-end gap-1">
          <button
            type="button"
            disabled={syncing}
            onClick={() => void runRowAction("pull", r)}
            className={actionOutline}
            title="Update Sarveda from Zoho count"
          >
            Zoho → Sarveda
          </button>
          <button
            type="button"
            disabled={syncing}
            onClick={() => void runRowAction("push", r)}
            className={actionForest}
            title="Update Zoho from Sarveda count"
          >
            Sarveda → Zoho
          </button>
        </div>
      );
    }

    if (r.zohoSyncScenario === 4) {
      return (
        <button
          type="button"
          disabled={syncing}
          onClick={() => void runRowAction("push_item", r)}
          className={actionForest}
        >
          Push to Zoho
        </button>
      );
    }

    return null;
  }

  function renderProductSummaryRow(g: ProductInventoryGroup) {
    const expanded = expandedProducts.has(g.productId);
    const productSyncing = zohoSyncing === g.productId;

    return (
      <tr
        key={`product-${g.productId}`}
        className={`cursor-pointer border-t border-stone-200 bg-stone-50/90 hover:bg-stone-100/80 dark:border-stone-700 dark:bg-stone-800/50 dark:hover:bg-stone-800 ${
          g.zohoOutOfSync > 0 ? "bg-amber-50/30 dark:bg-amber-950/10" : ""
        }`}
        onClick={() => toggleProduct(g.productId)}
      >
        <td className="w-10 px-3 py-3">
          <IconChevron open={expanded} />
        </td>
        <td className="px-4 py-3" colSpan={2}>
          <span className="font-semibold text-stone-900 dark:text-stone-100">{g.productName}</span>
          <p className="mt-0.5 text-xs text-stone-500">
            {g.variantCount} variant{g.variantCount === 1 ? "" : "s"}
            {g.zohoOutOfSync > 0 ? ` · ${g.zohoOutOfSync} out of sync` : ""}
          </p>
        </td>
        <td className="px-4 py-3">
          {g.zohoOutOfSync > 0 ? (
            <span className="text-xs font-medium text-amber-700 dark:text-amber-400">Review SKUs</span>
          ) : g.zohoSynced > 0 ? (
            <span className="text-xs text-emerald-700 dark:text-emerald-400">Synced</span>
          ) : (
            <span className="text-xs text-stone-400">—</span>
          )}
        </td>
        <td className="px-4 py-3 text-right font-mono font-semibold tabular-nums">{g.totalAvailable}</td>
        <td className="px-4 py-3 text-right text-stone-400">—</td>
        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
          <div className="flex flex-wrap justify-end gap-1.5">
            <Link
              href={`/admin/products/${g.productId}`}
              className="rounded-md border border-stone-200 bg-white px-2.5 py-1 text-xs font-medium text-stone-700 shadow-sm hover:border-amber-400 dark:border-stone-600 dark:bg-stone-900 dark:text-stone-200"
            >
              Edit
            </Link>
            <button
              type="button"
              disabled={zohoSyncing !== null}
              onClick={() => void runProductAudit(g.productId, g.productName)}
              className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold ${actionForest}`}
            >
              <IconRefresh className={`h-3 w-3 ${productSyncing ? "animate-spin" : ""}`} />
              Audit
            </button>
          </div>
        </td>
      </tr>
    );
  }

  function renderVariantRow(r: InventoryRow) {
    const thresholdDirty = thresholdChanges.some((c) => c.variantId === r.variantId);
    return (
      <tr
        key={r.variantId}
        className={`border-t border-stone-100 bg-white dark:border-stone-800 dark:bg-stone-900/40 ${
          r.low ? "bg-red-50/40 dark:bg-red-950/10" : ""
        } ${thresholdDirty ? "bg-amber-50/30 dark:bg-amber-950/10" : ""}`}
      >
        <td className="px-3 py-2.5" />
        <td className="px-4 py-2.5 pl-8 text-sm text-stone-600 dark:text-stone-400">
          {r.variantLabel ?? "Default"}
          {r.low ? (
            <span className="ml-2 rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-red-800 dark:bg-red-900/60 dark:text-red-100">
              Low
            </span>
          ) : null}
        </td>
        <td className="px-4 py-2.5 font-mono text-xs text-stone-500">{r.sku}</td>
        <td className="px-4 py-2.5">
          <ZohoBadge
            scenario={r.zohoSyncScenario}
            zohoStock={r.zohoStockOnHand}
            auditAvailable={zohoAuditAvailable}
          />
        </td>
        <td className="px-4 py-2.5 text-right font-mono font-medium tabular-nums">
          {r.available}
          {r.zohoStockOnHand !== null && r.zohoSyncScenario === 2 ? (
            <span className="block text-[10px] font-normal text-stone-400">Zoho: {r.zohoStockOnHand}</span>
          ) : null}
          {r.reserved > 0 ? (
            <span className="block text-[10px] font-normal text-stone-400">{r.reserved} held</span>
          ) : null}
        </td>
        <td className="px-4 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
          <input
            type="number"
            min={0}
            aria-label={`Threshold ${r.sku}`}
            value={thresholdDrafts[r.variantId] ?? ""}
            onChange={(e) =>
              setThresholdDrafts((d) => ({ ...d, [r.variantId]: e.target.value }))
            }
            className="w-14 rounded border border-stone-200 px-2 py-1 text-right font-mono text-sm dark:border-stone-600 dark:bg-stone-950"
          />
        </td>
        <td className="px-4 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
          <div className="flex flex-col items-end gap-1">
            {renderZohoRowActions(r)}
            <button
              type="button"
              disabled={busy === r.variantId || !thresholdDirty}
              onClick={() => void saveThreshold(r.variantId)}
              className="text-xs font-medium text-amber-800 disabled:opacity-30 dark:text-amber-400"
            >
              {busy === r.variantId ? "…" : "Save threshold"}
            </button>
          </div>
        </td>
      </tr>
    );
  }

  function renderZohoOnlyTable() {
    return (
      <div className="overflow-hidden rounded-lg border border-stone-200 bg-white shadow-sm dark:border-stone-700 dark:bg-stone-900">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-100 px-4 py-3 dark:border-stone-800">
          <p className="text-sm text-stone-600 dark:text-stone-400">
            Zoho items with no matching Sarveda SKU — Sarveda admin is the website catalog source of truth.
          </p>
          <button
            type="button"
            disabled={displayedZohoOnly.length === 0 || zohoSyncing !== null}
            onClick={() => void runBulkZohoAction("ignore")}
            className={actionForest}
          >
            Mark all inactive in Zoho
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="border-b border-stone-200 bg-stone-100/95 dark:border-stone-600 dark:bg-stone-800/95">
              <tr>
                <th className={thClass}>SKU</th>
                <th className={thClass}>Zoho name</th>
                <th className={`${thClass} text-right`}>Zoho stock</th>
                <th className={`${thClass} text-right`}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {displayedZohoOnly.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-stone-500">
                    No Zoho-only SKUs in this view.
                  </td>
                </tr>
              ) : (
                displayedZohoOnly.map((item) => (
                  <tr key={item.sku} className="border-t border-stone-100 dark:border-stone-800">
                    <td className="px-4 py-2.5 font-mono text-xs">{item.sku}</td>
                    <td className="px-4 py-2.5">{item.name}</td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums">{item.stockOnHand}</td>
                    <td className="px-4 py-2.5 text-right">
                      <button
                        type="button"
                        disabled={busy === item.sku || zohoSyncing !== null}
                        onClick={() => void runRowAction("ignore", item)}
                        className={actionOutline}
                      >
                        Mark inactive
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1400px] space-y-5 font-sans">
      {toast ? (
        <div
          className={`fixed bottom-6 left-1/2 z-[110] max-w-md -translate-x-1/2 rounded-lg border px-4 py-3 text-sm shadow-xl ${
            toast.error
              ? "border-red-200 bg-red-50 text-red-900"
              : "border-stone-200 bg-white text-stone-900 dark:border-stone-600 dark:bg-stone-900 dark:text-stone-100"
          }`}
          role="status"
        >
          {toast.message}
        </div>
      ) : null}

      <div className="flex flex-col gap-3 border-b border-stone-200 pb-4 dark:border-stone-700 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-stone-900 dark:text-stone-50">
            Inventory
          </h1>
          <p className="mt-1 text-xs text-stone-500">
            Last Zoho audit: {formatRelativeTime(lastZohoSync)} · Sarveda admin is source of truth for website
            products
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() =>
              downloadCsv(
                `sarveda-inventory-${new Date().toISOString().slice(0, 10)}.csv`,
                inventoryToCsv(displayedRows)
              )
            }
            disabled={loading || displayedRows.length === 0}
            className="inline-flex items-center gap-2 rounded-md border border-stone-200 bg-white px-3 py-2 text-sm font-medium shadow-sm hover:bg-stone-50 disabled:opacity-50 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-200"
          >
            <IconDownload className="h-4 w-4" />
            Export
          </button>
          <button
            type="button"
            disabled={importing}
            onClick={() => importInputRef.current?.click()}
            className="inline-flex items-center gap-2 rounded-md border border-stone-200 bg-white px-3 py-2 text-sm font-medium shadow-sm hover:bg-stone-50 disabled:opacity-50 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-200"
            title="CSV columns: SKU, On Hand — overwritten on next Zoho sync"
          >
            <IconUpload className="h-4 w-4" />
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
            disabled={bulkSaving || thresholdChanges.length === 0}
            onClick={() => void saveAllThresholds()}
            className="rounded-md border border-stone-200 bg-white px-3 py-2 text-sm font-medium shadow-sm disabled:opacity-50 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-200"
          >
            {bulkSaving ? "Saving…" : thresholdChanges.length > 0 ? `Save ${thresholdChanges.length} thresholds` : "Save thresholds"}
          </button>
          <button
            type="button"
            disabled={zohoSyncing !== null}
            onClick={() => void runZohoAudit()}
            className="inline-flex items-center gap-2 rounded-md bg-[#1e3a2f] px-4 py-2 text-sm font-semibold text-[#fffbf5] shadow-sm hover:bg-[#2d5240] disabled:opacity-60"
          >
            <IconRefresh className={`h-4 w-4 ${zohoSyncing === "audit" ? "animate-spin" : ""}`} />
            Refresh Zoho audit
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-stone-200 bg-stone-200 sm:grid-cols-3 lg:grid-cols-6 dark:border-stone-700 dark:bg-stone-700">
        <div className="bg-white dark:bg-stone-900">
          <MetricCard label="Products" value={productCount} />
        </div>
        <div className="bg-white dark:bg-stone-900">
          <MetricCard label="Variants" value={stats.total} />
        </div>
        <div className="bg-white dark:bg-stone-900">
          <MetricCard label="In stock" value={stats.inStock} tone="emerald" />
        </div>
        <div className="bg-white dark:bg-stone-900">
          <MetricCard label="Low stock" value={stats.lowStock} tone="amber" />
        </div>
        <div className="bg-white dark:bg-stone-900">
          <MetricCard label="Out of stock" value={stats.outOfStock} tone="red" />
        </div>
        <div className="bg-white dark:bg-stone-900">
          <MetricCard
            label="Out of Sync with Zoho"
            value={zohoAuditAvailable ? outOfSyncTotal : "—"}
            tone="amber"
            onClick={
              zohoAuditAvailable && outOfSyncTotal > 0
                ? () => {
                    setStockFilter("out_of_sync");
                    setZohoSubFilter("count_mismatch");
                  }
                : undefined
            }
          />
        </div>
      </div>

      <div className="rounded-lg border border-stone-200 bg-white shadow-sm dark:border-stone-700 dark:bg-stone-900">
        <button
          type="button"
          onClick={() => setHistoryOpen((o) => !o)}
          className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium text-stone-700 dark:text-stone-300"
        >
          <span>Sync history ({syncHistory.length})</span>
          <IconChevron open={historyOpen} />
        </button>
        {historyOpen ? (
          <div className="border-t border-stone-100 dark:border-stone-800">
            {syncHistory.length === 0 ? (
              <p className="px-4 py-6 text-sm text-stone-500">
                No sync runs yet. Use Refresh Zoho audit to compare SKU counts.
              </p>
            ) : (
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-stone-100 bg-stone-50/80 dark:border-stone-800 dark:bg-stone-800/40">
                    <th className={thClass}>When</th>
                    <th className={thClass}>Scope</th>
                    <th className={`${thClass} text-right`}>Synced</th>
                    <th className={`${thClass} text-right`}>Skipped</th>
                    <th className={`${thClass} text-right`}>Errors</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
                  {syncHistory.map((h) => (
                    <tr key={h.id}>
                      <td className="px-4 py-2 text-stone-600 dark:text-stone-400">
                        {formatRelativeTime(h.at)}
                      </td>
                      <td className="px-4 py-2 text-stone-800 dark:text-stone-200">{scopeLabel(h)}</td>
                      <td className="px-4 py-2 text-right font-mono text-emerald-700 dark:text-emerald-400">
                        {h.synced}
                      </td>
                      <td className="px-4 py-2 text-right font-mono text-stone-500">{h.skipped}</td>
                      <td className="px-4 py-2 text-right font-mono text-red-600 dark:text-red-400">
                        {h.errors}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ) : null}
      </div>

      <div className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm dark:border-stone-700 dark:bg-stone-900">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative min-w-0 flex-1">
            <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search product or SKU…"
              className="w-full rounded-md border border-stone-200 py-2.5 pl-10 pr-3 text-sm focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400 dark:border-stone-600 dark:bg-stone-950 dark:text-stone-100"
            />
          </div>
          <select
            value={categorySlug}
            onChange={(e) => setCategorySlug(e.target.value)}
            aria-label="Category"
            className="rounded-md border border-stone-200 px-3 py-2.5 text-sm lg:w-48 dark:border-stone-600 dark:bg-stone-950 dark:text-stone-100"
          >
            <option value="">All categories</option>
            {categoryOptions.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.label}
              </option>
            ))}
          </select>
          <button type="button" onClick={expandAll} className="text-sm font-medium text-stone-600 hover:text-amber-700 dark:text-stone-400">
            Expand all
          </button>
          <button type="button" onClick={collapseAll} className="text-sm font-medium text-stone-600 hover:text-amber-700 dark:text-stone-400">
            Collapse all
          </button>
        </div>
        <div className="mt-3 flex flex-wrap gap-1 border-t border-stone-100 pt-3 dark:border-stone-800">
          {stockTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setStockFilter(tab.id);
                if (tab.id === "out_of_sync") setZohoSubFilter("count_mismatch");
              }}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                stockFilter === tab.id
                  ? "bg-amber-500 text-stone-900"
                  : "text-stone-600 hover:bg-stone-100 dark:text-stone-400 dark:hover:bg-stone-800"
              }`}
            >
              {tab.label}{" "}
              <span className="tabular-nums opacity-80">
                {tab.id === "out_of_sync" ? outOfSyncTotal : tabCounts[tab.id]}
              </span>
            </button>
          ))}
        </div>
        {stockFilter === "out_of_sync" ? (
          <div className="mt-3 space-y-3 border-t border-stone-100 pt-3 dark:border-stone-800">
            <div className="flex flex-wrap gap-1">
              {zohoSubTabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setZohoSubFilter(tab.id)}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium ${
                    zohoSubFilter === tab.id
                      ? "bg-[#1e3a2f] text-[#fffbf5]"
                      : "border border-stone-200 text-stone-600 dark:border-stone-600 dark:text-stone-400"
                  }`}
                >
                  {tab.label}{" "}
                  <span className="tabular-nums opacity-80">{zohoSubCounts[tab.id]}</span>
                </button>
              ))}
            </div>
            {zohoSubFilter === "count_mismatch" && zohoSubCounts.count_mismatch > 0 ? (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={zohoSyncing !== null}
                  onClick={() => void runBulkZohoAction("pull")}
                  className={actionOutline}
                >
                  Bulk: Zoho → Sarveda
                </button>
                <button
                  type="button"
                  disabled={zohoSyncing !== null}
                  onClick={() => void runBulkZohoAction("push")}
                  className={actionForest}
                >
                  Bulk: Sarveda → Zoho
                </button>
              </div>
            ) : null}
            {zohoSubFilter === "sarveda_only" && zohoSubCounts.sarveda_only > 0 ? (
              <button
                type="button"
                disabled={zohoSyncing !== null}
                onClick={() => void runBulkZohoAction("push_item")}
                className={actionForest}
              >
                Bulk: Push to Zoho
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      {err ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800" role="alert">
          {err}
        </p>
      ) : null}

      <p className="text-xs text-stone-500">
        {stockFilter === "out_of_sync" && zohoSubFilter === "zoho_only" ? (
          <>
            Showing {displayedZohoOnly.length} Zoho-only SKU
            {displayedZohoOnly.length === 1 ? "" : "s"}
            {hasActiveFilter ? " (filtered)" : ""}.
          </>
        ) : (
          <>
            Showing {filteredProductCount} product{filteredProductCount === 1 ? "" : "s"} ·{" "}
            {displayedRows.length} variant{displayedRows.length === 1 ? "" : "s"}
            {hasActiveFilter ? " (filtered)" : ""}. Click a product row to expand variants.
          </>
        )}
      </p>

      {loading ? (
        <div className="h-48 animate-pulse rounded-lg border border-stone-200 bg-stone-100 dark:border-stone-700 dark:bg-stone-800" />
      ) : stockFilter === "out_of_sync" && zohoSubFilter === "zoho_only" ? (
        renderZohoOnlyTable()
      ) : productGroups.length === 0 ? (
        <div className="rounded-lg border border-dashed border-stone-300 px-8 py-16 text-center text-sm text-stone-500">
          No products match your filters.
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-stone-200 bg-white shadow-sm dark:border-stone-700 dark:bg-stone-900">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 z-10 border-b border-stone-200 bg-stone-100/95 backdrop-blur dark:border-stone-600 dark:bg-stone-800/95">
                <tr>
                  <th className={`${thClass} w-10`} aria-label="Expand" />
                  <th className={thClass}>Product / variant</th>
                  <th className={thClass}>SKU</th>
                  <th className={thClass}>Zoho</th>
                  <th className={`${thClass} text-right`}>Available</th>
                  <th className={`${thClass} text-right`}>Low-stock at</th>
                  <th className={`${thClass} text-right`}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {productGroups.map((g) => (
                  <Fragment key={g.productId}>
                    {renderProductSummaryRow(g)}
                    {expandedProducts.has(g.productId)
                      ? g.rows.map((r) => renderVariantRow(r))
                      : null}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
