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
  formatRelativeTime,
  groupRowsByProductInOrder,
  inventoryToCsv,
  matchesStockFilter,
  sortInventoryRows,
  type ProductInventoryGroup,
  type SortDir,
  type SortKey,
  type StockFilter
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
      className={`h-5 w-5 shrink-0 text-stone-400 transition-transform ${open ? "rotate-90" : ""}`}
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

function IconExternal({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
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
      <p className="text-[11px] font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">
        {label}
      </p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${valueClass}`}>{value}</p>
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="rounded-lg border border-transparent px-3 py-2 text-left transition hover:border-amber-300 hover:bg-amber-50/50 dark:hover:border-amber-700 dark:hover:bg-amber-950/20"
      >
        {inner}
      </button>
    );
  }

  return <div className="px-3 py-2">{inner}</div>;
}

function ZohoBadge({
  inZoho,
  auditAvailable
}: {
  inZoho: boolean | null;
  auditAvailable: boolean;
}) {
  if (!auditAvailable) {
    return <span className="text-xs text-stone-500">—</span>;
  }
  if (inZoho) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-800 ring-1 ring-emerald-200/80 dark:bg-emerald-950/50 dark:text-emerald-300 dark:ring-emerald-800">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />
        In Zoho
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-900 ring-1 ring-amber-200/80 dark:bg-amber-950/40 dark:text-amber-200 dark:ring-amber-800"
      title="Add SKU in Zoho Books or fix under Edit product"
    >
      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
      Not in Zoho
    </span>
  );
}

function VariantTable({
  rows,
  zohoAuditAvailable,
  thresholdDrafts,
  setThresholdDrafts,
  thresholdChanges,
  busy,
  saveThreshold
}: {
  rows: InventoryRow[];
  zohoAuditAvailable: boolean;
  thresholdDrafts: Record<string, string>;
  setThresholdDrafts: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  thresholdChanges: Array<{ variantId: string; lowStockThreshold: number }>;
  busy: string | null;
  saveThreshold: (variantId: string) => void;
}) {
  return (
    <table className="min-w-full text-left text-sm">
      <thead>
        <tr className="border-b border-stone-200 bg-stone-50/90 text-[11px] font-semibold uppercase tracking-wider text-stone-500 dark:border-stone-700 dark:bg-stone-800/60 dark:text-stone-400">
          <th className="px-5 py-2.5">Variant</th>
          <th className="px-5 py-2.5">SKU</th>
          <th className="px-5 py-2.5">Zoho status</th>
          <th className="px-5 py-2.5 text-right">Available</th>
          <th className="px-5 py-2.5 text-right">Low-stock at</th>
          <th className="px-5 py-2.5 w-20" />
        </tr>
      </thead>
      <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
        {rows.map((r) => {
          const thresholdDirty = thresholdChanges.some((c) => c.variantId === r.variantId);
          return (
            <tr
              key={r.variantId}
              className={`transition-colors hover:bg-stone-50/80 dark:hover:bg-stone-800/40 ${
                r.low ? "bg-red-50/50 dark:bg-red-950/15" : ""
              } ${thresholdDirty ? "bg-amber-50/40 dark:bg-amber-950/10" : ""}`}
            >
              <td className="px-5 py-3 text-stone-700 dark:text-stone-300">
                <span>{r.variantLabel ?? "Default"}</span>
                {r.low ? (
                  <span className="ml-2 inline-flex rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-red-800 dark:bg-red-900/60 dark:text-red-100">
                    Low
                  </span>
                ) : null}
              </td>
              <td className="px-5 py-3 font-mono text-xs text-stone-600 dark:text-stone-400">{r.sku}</td>
              <td className="px-5 py-3">
                <ZohoBadge inZoho={r.inZohoBooks} auditAvailable={zohoAuditAvailable} />
              </td>
              <td className="px-5 py-3 text-right">
                <span className="font-mono text-base font-semibold tabular-nums text-stone-900 dark:text-stone-100">
                  {r.available}
                </span>
                {r.reserved > 0 ? (
                  <p className="text-[10px] text-stone-500">{r.reserved} at checkout</p>
                ) : null}
              </td>
              <td className="px-5 py-3 text-right">
                <input
                  type="number"
                  min={0}
                  aria-label={`Threshold for ${r.sku}`}
                  value={thresholdDrafts[r.variantId] ?? ""}
                  onChange={(e) =>
                    setThresholdDrafts((d) => ({ ...d, [r.variantId]: e.target.value }))
                  }
                  className="w-16 rounded-md border border-stone-200 bg-white px-2 py-1.5 text-right font-mono text-sm shadow-sm focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400 dark:border-stone-600 dark:bg-stone-950 dark:text-stone-100"
                />
              </td>
              <td className="px-5 py-3 text-right">
                <button
                  type="button"
                  disabled={busy === r.variantId || !thresholdDirty}
                  onClick={() => saveThreshold(r.variantId)}
                  className="rounded-md px-2.5 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-30 dark:text-amber-400 dark:hover:bg-amber-950/50"
                >
                  {busy === r.variantId ? "…" : "Save"}
                </button>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
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
  const [expandedProducts, setExpandedProducts] = useState<Set<string>>(new Set());
  const [helpOpen, setHelpOpen] = useState(false);

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

  const productGroups = useMemo(
    () => groupRowsByProductInOrder(displayedRows),
    [displayedRows]
  );

  const stats = useMemo(() => computeInventoryStats(allRows), [allRows]);
  const zohoUnmatchedTotal = useMemo(
    () => allRows.filter((r) => r.inZohoBooks === false).length,
    [allRows]
  );

  const hasActiveFilter = Boolean(
    search.trim() || categorySlug || stockFilter !== "all"
  );

  useEffect(() => {
    if (hasActiveFilter && productGroups.length > 0) {
      setExpandedProducts(new Set(productGroups.map((g) => g.productId)));
    }
  }, [hasActiveFilter, productGroups]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

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
      pushToast(`Synced ${result.synced} SKU${result.synced === 1 ? "" : "s"} from Zoho (${label})`);
      await load();
    } catch (e) {
      pushToast(e instanceof Error ? e.message : "Zoho sync failed", true);
    } finally {
      setZohoSyncing(null);
    }
  }

  const stockTabs: { id: StockFilter; label: string }[] = [
    { id: "all", label: "All" },
    { id: "in_stock", label: "In stock" },
    { id: "low_stock", label: "Low stock" },
    { id: "out_of_stock", label: "Out of stock" },
    { id: "not_in_zoho", label: "Not in Zoho" }
  ];

  function renderProductGroup(g: ProductInventoryGroup) {
    const expanded = expandedProducts.has(g.productId);
    const productSyncing = zohoSyncing === g.productId;

    return (
      <section
        key={g.productId}
        className={`overflow-hidden rounded-lg border bg-white shadow-sm transition-shadow dark:bg-stone-900 ${
          g.zohoUnmatched > 0
            ? "border-amber-200/80 dark:border-amber-900/50"
            : "border-stone-200 dark:border-stone-700"
        } ${expanded ? "ring-1 ring-stone-200/80 dark:ring-stone-600" : ""}`}
      >
        <div className="flex flex-wrap items-center gap-3 border-b border-stone-100 px-4 py-3 dark:border-stone-800">
          <button
            type="button"
            onClick={() => toggleProduct(g.productId)}
            className="flex min-w-0 flex-1 items-center gap-3 text-left"
          >
            <IconChevron open={expanded} />
            <div className="min-w-0 flex-1">
              <h3 className="truncate text-sm font-semibold text-stone-900 dark:text-stone-100">
                {g.productName}
              </h3>
              <p className="mt-0.5 text-xs text-stone-500 dark:text-stone-400">
                {g.variantCount} variant{g.variantCount === 1 ? "" : "s"} ·{" "}
                <span className="font-medium text-stone-700 dark:text-stone-300">
                  {g.totalAvailable} available
                </span>
                {g.outCount > 0 ? ` · ${g.outCount} out of stock` : ""}
                {g.lowCount > 0 ? ` · ${g.lowCount} low` : ""}
              </p>
              {zohoAuditAvailable && g.zohoUnmatched > 0 ? (
                <p className="mt-1 text-xs font-medium text-amber-700 dark:text-amber-400">
                  {g.zohoUnmatched} SKU{g.zohoUnmatched === 1 ? "" : "s"} missing in Zoho Books
                </p>
              ) : null}
            </div>
          </button>

          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/admin/products/${g.productId}`}
              className="inline-flex items-center gap-1 rounded-md border border-stone-200 bg-white px-3 py-1.5 text-xs font-medium text-stone-700 shadow-sm hover:border-amber-400 hover:text-amber-800 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-200 dark:hover:border-amber-500 dark:hover:text-amber-300"
            >
              <IconExternal className="h-3.5 w-3.5" />
              Edit product
            </Link>
            <button
              type="button"
              disabled={zohoSyncing !== null}
              onClick={() => void runZohoSync({ productId: g.productId, label: g.productName })}
              className="inline-flex items-center gap-1 rounded-md bg-amber-500 px-3 py-1.5 text-xs font-semibold text-stone-900 shadow-sm hover:bg-amber-400 disabled:opacity-50"
            >
              <IconRefresh className={`h-3.5 w-3.5 ${productSyncing ? "animate-spin" : ""}`} />
              {productSyncing ? "Syncing…" : "Sync stock"}
            </button>
          </div>
        </div>

        {expanded ? (
          <div className="overflow-x-auto">
            <VariantTable
              rows={g.rows}
              zohoAuditAvailable={zohoAuditAvailable}
              thresholdDrafts={thresholdDrafts}
              setThresholdDrafts={setThresholdDrafts}
              thresholdChanges={thresholdChanges}
              busy={busy}
              saveThreshold={(id) => void saveThreshold(id)}
            />
          </div>
        ) : null}
      </section>
    );
  }

  return (
    <div className="mx-auto max-w-[1400px] space-y-5 font-sans">
      {toast ? (
        <div
          className={`fixed bottom-6 left-1/2 z-[110] max-w-md -translate-x-1/2 rounded-lg border px-4 py-3 text-sm shadow-xl ${
            toast.error
              ? "border-red-200 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-100"
              : "border-stone-200 bg-white text-stone-900 dark:border-stone-600 dark:bg-stone-900 dark:text-stone-100"
          }`}
          role="status"
        >
          {toast.message}
        </div>
      ) : null}

      {/* Page header — Zoho-style title + actions */}
      <div className="flex flex-col gap-4 border-b border-stone-200 pb-5 dark:border-stone-700 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-stone-900 dark:text-stone-50">
            Inventory
          </h1>
          <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
            Stock from Zoho Books · expand a product to view variants · edit thresholds for low-stock alerts
          </p>
          <p className="mt-1 text-xs text-stone-400">
            Last sync: {formatRelativeTime(lastZohoSync)}
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
            className="inline-flex items-center gap-2 rounded-md border border-stone-200 bg-white px-3 py-2 text-sm font-medium text-stone-700 shadow-sm hover:bg-stone-50 disabled:opacity-50 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-200"
          >
            <IconDownload className="h-4 w-4" />
            Export
          </button>
          <button
            type="button"
            disabled={bulkSaving || thresholdChanges.length === 0}
            onClick={() => void saveAllThresholds()}
            className="rounded-md border border-stone-200 bg-white px-3 py-2 text-sm font-medium text-stone-700 shadow-sm hover:bg-stone-50 disabled:opacity-50 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-200"
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
            className="inline-flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900 hover:bg-amber-100 disabled:opacity-50 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
          >
            <IconRefresh className={`h-4 w-4 ${zohoSyncing === "unmatched" ? "animate-spin" : ""}`} />
            {zohoSyncing === "unmatched" ? "Syncing…" : `Unmatched (${zohoUnmatchedTotal})`}
          </button>
          <button
            type="button"
            disabled={zohoSyncing !== null}
            onClick={() => void runZohoSync("all")}
            className="inline-flex items-center gap-2 rounded-md bg-amber-500 px-4 py-2 text-sm font-semibold text-stone-900 shadow-sm hover:bg-amber-400 disabled:opacity-60"
          >
            <IconRefresh className={`h-4 w-4 ${zohoSyncing === "all" ? "animate-spin" : ""}`} />
            {zohoSyncing === "all" ? "Syncing…" : "Sync all"}
          </button>
        </div>
      </div>

      {/* Summary strip — like Zoho payment summary */}
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-stone-200 bg-stone-200 shadow-sm sm:grid-cols-3 lg:grid-cols-5 dark:border-stone-700 dark:bg-stone-700">
        <div className="bg-white dark:bg-stone-900">
          <MetricCard label="Total variants" value={stats.total} />
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
        <div className="col-span-2 bg-white sm:col-span-1 dark:bg-stone-900">
          <MetricCard
            label="Not in Zoho"
            value={zohoAuditAvailable ? zohoUnmatchedTotal : "—"}
            tone="amber"
            onClick={zohoAuditAvailable && zohoUnmatchedTotal > 0 ? () => setStockFilter("not_in_zoho") : undefined}
          />
        </div>
      </div>

      {/* Toolbar */}
      <div className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm dark:border-stone-700 dark:bg-stone-900">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
          <div className="relative min-w-0 flex-1">
            <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
            <input
              id="inv-search"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search product name or SKU…"
              className="w-full rounded-md border border-stone-200 bg-stone-50 py-2.5 pl-10 pr-3 text-sm text-stone-900 placeholder:text-stone-400 focus:border-amber-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-amber-400 dark:border-stone-600 dark:bg-stone-950 dark:text-stone-100"
            />
          </div>
          <select
            id="inv-cat"
            value={categorySlug}
            onChange={(e) => setCategorySlug(e.target.value)}
            aria-label="Category"
            className="rounded-md border border-stone-200 bg-white px-3 py-2.5 text-sm text-stone-800 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400 dark:border-stone-600 dark:bg-stone-950 dark:text-stone-100 lg:w-52"
          >
            <option value="">All categories</option>
            {categoryOptions.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.label}
              </option>
            ))}
          </select>
          <div className="flex gap-2 text-sm">
            <button
              type="button"
              onClick={expandAll}
              className="rounded-md px-3 py-2 font-medium text-stone-600 hover:bg-stone-100 dark:text-stone-400 dark:hover:bg-stone-800"
            >
              Expand all
            </button>
            <button
              type="button"
              onClick={collapseAll}
              className="rounded-md px-3 py-2 font-medium text-stone-600 hover:bg-stone-100 dark:text-stone-400 dark:hover:bg-stone-800"
            >
              Collapse all
            </button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-1 border-t border-stone-100 pt-4 dark:border-stone-800">
          {stockTabs.map((tab) => {
            const count = tabCounts[tab.id];
            const active = stockFilter === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setStockFilter(tab.id)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                  active
                    ? "bg-amber-500 text-stone-900 shadow-sm"
                    : "text-stone-600 hover:bg-stone-100 dark:text-stone-400 dark:hover:bg-stone-800"
                }`}
              >
                {tab.label}
                <span className={`ml-1.5 tabular-nums ${active ? "text-stone-800" : "text-stone-400"}`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <button
        type="button"
        onClick={() => setHelpOpen((o) => !o)}
        className="text-xs font-medium text-stone-500 hover:text-amber-700 dark:hover:text-amber-400"
      >
        {helpOpen ? "Hide" : "Show"} quick guide
      </button>
      {helpOpen ? (
        <div className="rounded-lg border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-600 dark:border-stone-700 dark:bg-stone-900/60 dark:text-stone-400">
          <strong className="text-stone-800 dark:text-stone-200">Available</strong> = sellable units (Zoho stock
          minus checkout holds). Stock is edited in Zoho only.{" "}
          <strong className="text-stone-800 dark:text-stone-200">Threshold</strong> triggers the Low badge on
          this page and dashboard alerts.
        </div>
      ) : null}

      {err ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/50 dark:text-red-200" role="alert">
          {err}
        </p>
      ) : null}

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-16 animate-pulse rounded-lg border border-stone-200 bg-stone-100 dark:border-stone-700 dark:bg-stone-800"
            />
          ))}
        </div>
      ) : productGroups.length === 0 ? (
        <div className="rounded-lg border border-dashed border-stone-300 bg-white px-8 py-16 text-center dark:border-stone-600 dark:bg-stone-900">
          <p className="text-sm text-stone-500">No products match your filters.</p>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center justify-between px-1 text-xs text-stone-500">
            <span>
              {productGroups.length} product{productGroups.length === 1 ? "" : "s"} · {displayedRows.length}{" "}
              variant{displayedRows.length === 1 ? "" : "s"}
            </span>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => toggleSort("product")}
                className="hover:text-stone-700 dark:hover:text-stone-300"
              >
                Sort A–Z {sortKey === "product" ? (sortDir === "asc" ? "↑" : "↓") : ""}
              </button>
            </div>
          </div>
          {productGroups.map(renderProductGroup)}
        </div>
      )}
    </div>
  );
}
