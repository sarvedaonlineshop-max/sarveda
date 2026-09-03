"use client";

import Link from "next/link";
import { FileSpreadsheet } from "lucide-react";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AdminToast } from "@/components/admin/AdminToast";
import {
  useRegisterAdminHeaderSlot,
  type AdminHeaderSearchSuggestion
} from "@/components/admin/AdminHeaderSlotContext";
import { useAdminUser } from "@/components/admin/AdminUserContext";
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
  patchAdminInventoryVariant,
  pullStockFromZohoAdmin,
  pushItemsToZohoAdmin,
  pushStockToZohoAdmin,
  reconcileAdminInventoryReserved,
  refreshZohoAuditAdmin,
  syncStockFromZohoAdmin
} from "@/lib/admin-api";
import {
  computeInventoryStats,
  downloadCsv,
  downloadExcelXml,
  effectiveZohoScenario,
  filterZohoOnlyItems,
  formatRelativeTime,
  groupRowsByProductInOrder,
  inventoryToCsv,
  inventoryToExcelXml,
  INVENTORY_CATEGORY_TREE,
  matchesDropShipFilter,
  matchesStockFilter,
  resolveZohoSyncSummary,
  backendNeedsZohoScenarioUpdate,
  rowMatchesCategoryFilter,
  sortInventoryRows,
  type DropShipFilter,
  type ProductInventoryGroup,
  type SortDir,
  type SortKey,
  type StockFilter,
  type ZohoSyncSubFilter
} from "@/lib/inventory-utils";

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

function IconEdit({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
      />
    </svg>
  );
}

/** Floppy-disk save icon (Word / Excel style). */
function IconSave({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M17 3H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V7l-4-4zm-5 16a3 3 0 110-6 3 3 0 010 6zm3-10H5V5h10v4z" />
    </svg>
  );
}

/** Digits only; empty allowed while typing; negatives stripped. Zero allowed. */
function sanitizeNonNegIntInput(raw: string): string {
  return raw.replace(/[^\d]/g, "");
}

const RECONCILE_VISIBLE_EMAIL = "partha@sarveda.com";

function IconChevronDown({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  );
}

function MetricCard({
  label,
  value,
  tone = "default",
  onClick,
  active = false,
  flashKey = 0
}: {
  label: string;
  value: string | number;
  tone?: "default" | "amber" | "red" | "emerald";
  onClick?: () => void;
  active?: boolean;
  flashKey?: number;
}) {
  const valueClass =
    tone === "amber"
      ? "text-amber-700 dark:text-amber-400"
      : tone === "red"
        ? "text-red-700 dark:text-red-400"
        : tone === "emerald"
          ? "text-emerald-700 dark:text-emerald-400"
          : "text-stone-900 dark:text-stone-100";

  const borderBottom =
    tone === "emerald"
      ? "3px solid #16a34a"
      : tone === "amber"
        ? "3px solid #d97706"
        : tone === "red"
          ? "3px solid #dc2626"
          : "3px solid #1c352a";

  const inner = (
    <>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-stone-500">{label}</p>
      <p className={`mt-1 text-3xl font-extrabold tabular-nums ${valueClass}`}>{value}</p>
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-pressed={active}
        className={`admin-metric-fade w-full rounded-lg px-3 py-2 text-left ${
          active
            ? "bg-[#eef6f1] ring-1 ring-inset ring-[#1c352a]/35 dark:bg-emerald-950/35 dark:ring-emerald-700/50"
            : "hover:bg-emerald-50/70 dark:hover:bg-emerald-950/20"
        }`}
        style={{ borderBottom }}
        key={`${label}-${flashKey}-${active ? "on" : "off"}`}
      >
        {inner}
      </button>
    );
  }
  return (
    <div className="px-3 py-2" style={{ borderBottom }}>
      {inner}
    </div>
  );
}

function ExpandCollapseSwitcher({
  mode,
  onExpand,
  onCollapse
}: {
  mode: "expand" | "collapse";
  onExpand: () => void;
  onCollapse: () => void;
}) {
  return (
    <div
      className="relative inline-grid grid-cols-2 rounded-full border border-[#1c352a]/25 bg-[#eef6f1] p-0.5 text-xs font-semibold dark:border-emerald-800 dark:bg-emerald-950/40"
      role="group"
      aria-label="Expand or collapse product rows"
    >
      <span
        className="pointer-events-none absolute inset-y-0.5 left-0.5 w-[calc(50%-2px)] rounded-full bg-[#1c352a] shadow-sm transition-transform duration-300 ease-out"
        style={{ transform: mode === "expand" ? "translateX(100%)" : "translateX(0)" }}
        aria-hidden
      />
      <button
        type="button"
        onClick={onCollapse}
        className={`relative z-10 rounded-full px-3.5 py-1.5 transition-colors duration-200 ${
          mode === "collapse" ? "text-white" : "text-[#1c352a]/70 hover:text-[#1c352a] dark:text-emerald-200/80"
        }`}
      >
        Collapse
      </button>
      <button
        type="button"
        onClick={onExpand}
        className={`relative z-10 rounded-full px-3.5 py-1.5 transition-colors duration-200 ${
          mode === "expand" ? "text-white" : "text-[#1c352a]/70 hover:text-[#1c352a] dark:text-emerald-200/80"
        }`}
      >
        Expand
      </button>
    </div>
  );
}

function DropShipToggle({
  enabled,
  busy,
  onToggle
}: {
  enabled: boolean;
  busy: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      aria-label={enabled ? "Drop ship enabled" : "Drop ship disabled"}
      disabled={busy}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-200 disabled:opacity-50 ${
        enabled ? "bg-emerald-600" : "bg-stone-300 dark:bg-stone-600"
      }`}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform duration-200 ${
          enabled ? "translate-x-[22px]" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

function ZohoBadge({
  row,
  auditAvailable
}: {
  row: Pick<InventoryRow, "zohoSyncScenario" | "inZohoBooks" | "zohoStockOnHand" | "onHand">;
  auditAvailable: boolean;
}) {
  const scenario = effectiveZohoScenario(row);
  const zohoStock = row.zohoStockOnHand;

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
  const adminUser = useAdminUser();
  const canReconcile =
    (adminUser?.email ?? "").trim().toLowerCase() === RECONCILE_VISIBLE_EMAIL;

  const [allRows, setAllRows] = useState<InventoryRow[]>([]);
  const [productCount, setProductCount] = useState(0);
  const [savedThresholds, setSavedThresholds] = useState<Record<string, number>>({});
  const [thresholdDrafts, setThresholdDrafts] = useState<Record<string, string>>({});
  const [syncHistory, setSyncHistory] = useState<ZohoStockSyncHistoryEntry[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [lastZohoSync, setLastZohoSync] = useState<string | null>(null);
  const [zohoInventorySyncEnabled, setZohoInventorySyncEnabled] = useState(false);
  const [zohoAuditAvailable, setZohoAuditAvailable] = useState(false);
  const [zohoSyncSummary, setZohoSyncSummary] = useState<ZohoSyncSummary>({
    synced: 0,
    countMismatch: 0,
    zohoOnly: 0,
    sarvedaOnly: 0,
    outOfSync: 0
  });
  const [zohoOnlyItems, setZohoOnlyItems] = useState<ZohoOnlyItem[]>([]);
  const [reservedStock, setReservedStock] = useState<{
    pendingPaymentOrders: number;
    variantsWithStoredReserved: number;
    totalStoredReservedUnits: number;
    totalExpectedReservedUnits: number;
    orphanVariantCount: number;
    orphanUnits: number;
    reservedExceedsOnHandCount: number;
  } | null>(null);
  const [reconciling, setReconciling] = useState(false);

  /** Draft in the header — does not filter the table until Enter / suggestion select. */
  const [searchInput, setSearchInput] = useState("");
  /** Applied filter for the results table. */
  const [appliedSearch, setAppliedSearch] = useState("");
  const [stockFilter, setStockFilter] = useState<StockFilter>("all");
  const [statsFlash, setStatsFlash] = useState(0);
  const [listFadeKey, setListFadeKey] = useState(0);
  const [dropShipFilter, setDropShipFilter] = useState<DropShipFilter>("all");
  const [zohoSubFilter, setZohoSubFilter] = useState<ZohoSyncSubFilter>("count_mismatch");
  const [categorySlug, setCategorySlug] = useState("");
  const [dropShipBusyId, setDropShipBusyId] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("product");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [expandedProducts, setExpandedProducts] = useState<Set<string>>(new Set());

  const [busy, setBusy] = useState<string | null>(null);
  const [productSaving, setProductSaving] = useState<string | null>(null);
  const [zohoSyncing, setZohoSyncing] = useState<"audit" | "bulk" | string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; error?: boolean } | null>(null);
  const [availableDrafts, setAvailableDrafts] = useState<Record<string, string>>({});
  const [savedAvailable, setSavedAvailable] = useState<Record<string, number>>({});
  const [exportOpen, setExportOpen] = useState(false);
  const [categoryMenuOpen, setCategoryMenuOpen] = useState(false);
  const [categoryHoverRoot, setCategoryHoverRoot] = useState<string | null>(null);
  const exportMenuRef = useRef<HTMLDivElement>(null);
  const categoryMenuRef = useRef<HTMLDivElement>(null);

  const pushToast = useCallback((message: string, error = false) => {
    setToast({ message, error });
  }, []);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      const t = e.target as Node;
      if (exportMenuRef.current && !exportMenuRef.current.contains(t)) setExportOpen(false);
      if (categoryMenuRef.current && !categoryMenuRef.current.contains(t)) {
        setCategoryMenuOpen(false);
        setCategoryHoverRoot(null);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

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
      setReservedStock(data.meta.reservedStock ?? null);
      const th: Record<string, number> = {};
      const thDraft: Record<string, string> = {};
      const avail: Record<string, number> = {};
      const availDraft: Record<string, string> = {};
      for (const r of data.items) {
        th[r.variantId] = r.lowStockThreshold;
        thDraft[r.variantId] = String(r.lowStockThreshold);
        avail[r.variantId] = r.available;
        availDraft[r.variantId] = String(r.available);
      }
      setSavedThresholds(th);
      setThresholdDrafts(thDraft);
      setSavedAvailable(avail);
      setAvailableDrafts(availDraft);
      setLastZohoSync(data.meta.lastZohoStockSyncAt);
      setZohoInventorySyncEnabled(data.meta.zohoInventorySyncEnabled === true);
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
      if (data.meta.zohoInventorySyncEnabled) {
        await loadHistory();
      } else {
        setSyncHistory([]);
      }
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

  useEffect(() => {
    if (!zohoInventorySyncEnabled && stockFilter === "out_of_sync") {
      setStockFilter("all");
    }
  }, [zohoInventorySyncEnabled, stockFilter]);

  const showZohoSync = zohoInventorySyncEnabled;

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

  const availableChanges = useMemo(() => {
    const changes: Array<{ variantId: string; available: number }> = [];
    for (const id of Object.keys(savedAvailable)) {
      const orig = savedAvailable[id];
      const raw = availableDrafts[id];
      const n = raw !== undefined ? parseInt(raw, 10) : orig;
      if (Number.isFinite(n) && n >= 0 && n !== orig) {
        changes.push({ variantId: id, available: n });
      }
    }
    return changes;
  }, [savedAvailable, availableDrafts]);

  const searchFiltered = useMemo(() => {
    const q = appliedSearch.trim().toLowerCase();
    return allRows.filter((r) => {
      if (!rowMatchesCategoryFilter(r, categorySlug)) return false;
      if (!q) return true;
      return (
        r.productName.toLowerCase().includes(q) ||
        r.sku.toLowerCase().includes(q) ||
        (r.variantLabel?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [allRows, appliedSearch, categorySlug]);

  const headerSuggestions = useMemo((): AdminHeaderSearchSuggestion[] => {
    const q = searchInput.trim().toLowerCase();
    if (!q) return [];
    const seen = new Set<string>();
    const out: AdminHeaderSearchSuggestion[] = [];
    for (const r of allRows) {
      if (!rowMatchesCategoryFilter(r, categorySlug)) continue;
      const productHit = r.productName.toLowerCase().includes(q);
      const skuHit = r.sku.toLowerCase().includes(q);
      const variantHit = r.variantLabel?.toLowerCase().includes(q) ?? false;
      if (!productHit && !skuHit && !variantHit) continue;
      const id = productHit || !skuHit ? `product:${r.productId}` : `sku:${r.variantId}`;
      if (seen.has(id)) continue;
      seen.add(id);
      out.push({
        id,
        label: productHit || !skuHit ? r.productName : r.sku,
        sublabel:
          productHit || !skuHit
            ? `Product · ${r.sku}${r.variantLabel ? ` · ${r.variantLabel}` : ""}`
            : `${r.productName}${r.variantLabel ? ` · ${r.variantLabel}` : ""}`
      });
      if (out.length >= 10) break;
    }
    return out;
  }, [allRows, searchInput, categorySlug]);

  const zohoSubCounts = useMemo(
    () => ({
      count_mismatch: searchFiltered.filter((r) => effectiveZohoScenario(r) === 2).length,
      sarveda_only: searchFiltered.filter((r) => effectiveZohoScenario(r) === 4).length,
      zoho_only: filterZohoOnlyItems(zohoOnlyItems, appliedSearch).length
    }),
    [searchFiltered, zohoOnlyItems, appliedSearch]
  );

  const displayedRows = useMemo(() => {
    if (stockFilter === "out_of_sync" && zohoSubFilter === "zoho_only") return [];
    const filtered = searchFiltered.filter(
      (r) =>
        matchesStockFilter(
          r,
          stockFilter,
          stockFilter === "out_of_sync" ? zohoSubFilter : undefined
        ) && matchesDropShipFilter(r, dropShipFilter)
    );
    return sortInventoryRows(filtered, sortKey, sortDir);
  }, [searchFiltered, stockFilter, dropShipFilter, zohoSubFilter, sortKey, sortDir]);

  const displayedZohoOnly = useMemo(
    () => filterZohoOnlyItems(zohoOnlyItems, appliedSearch),
    [zohoOnlyItems, appliedSearch]
  );

  const productGroups = useMemo(
    () => groupRowsByProductInOrder(displayedRows),
    [displayedRows]
  );

  const filteredProductCount = useMemo(() => productGroups.length, [productGroups]);

  const stats = useMemo(() => computeInventoryStats(allRows), [allRows]);
  const resolvedSyncSummary = useMemo(
    () => resolveZohoSyncSummary(allRows, zohoOnlyItems, zohoSyncSummary),
    [allRows, zohoOnlyItems, zohoSyncSummary]
  );
  const outOfSyncTotal = resolvedSyncSummary.outOfSync;
  const staleBackend = useMemo(
    () => backendNeedsZohoScenarioUpdate(allRows, zohoAuditAvailable),
    [allRows, zohoAuditAvailable]
  );

  const hasActiveFilter = Boolean(
    appliedSearch.trim() || categorySlug || stockFilter !== "all" || dropShipFilter !== "all"
  );

  const dropShipTabCounts = useMemo(() => {
    const stockScoped = searchFiltered.filter((r) =>
      matchesStockFilter(
        r,
        stockFilter,
        stockFilter === "out_of_sync" ? zohoSubFilter : undefined
      )
    );
    let dropShipped = 0;
    for (const r of stockScoped) {
      if (r.dropShipEnabled) dropShipped++;
    }
    return {
      all: stockScoped.length,
      drop_shipped: dropShipped,
      non_drop_shipped: stockScoped.length - dropShipped
    };
  }, [searchFiltered, stockFilter, zohoSubFilter]);

  const expandMode: "expand" | "collapse" = useMemo(() => {
    if (productGroups.length === 0) return "collapse";
    const allOpen = productGroups.every((g) => expandedProducts.has(g.productId));
    return allOpen ? "expand" : "collapse";
  }, [productGroups, expandedProducts]);

  function applyInventorySearch(raw: string, opts?: { productId?: string }) {
    const next = raw.trim();
    setSearchInput(next);
    setAppliedSearch(next);
    setExpandedProducts(new Set());
    setListFadeKey((k) => k + 1);
    if (opts?.productId) {
      // Keep collapsed; user can expand the product row.
    }
  }

  function selectStockFilter(next: StockFilter) {
    setStockFilter(next);
    setStatsFlash((n) => n + 1);
    setListFadeKey((k) => k + 1);
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
    setListFadeKey((k) => k + 1);
  }

  function collapseAll() {
    setExpandedProducts(new Set());
    setListFadeKey((k) => k + 1);
  }

  async function toggleDropShip(row: InventoryRow) {
    const next = !row.dropShipEnabled;
    setDropShipBusyId(row.variantId);
    try {
      const result = await patchAdminInventoryVariant(row.variantId, {
        dropShipEnabled: next
      });
      const updated = result.inventory;
      setAllRows((prev) =>
        prev.map((r) =>
          r.variantId === row.variantId
            ? {
                ...r,
                dropShipEnabled: updated?.dropShipEnabled ?? next,
                shopAvailability: updated?.shopAvailability ?? r.shopAvailability
              }
            : r
        )
      );
      pushToast(next ? `Drop ship enabled for ${row.sku}` : `Drop ship disabled for ${row.sku}`);
    } catch (e) {
      pushToast(e instanceof Error ? e.message : "Could not update drop ship", true);
    } finally {
      setDropShipBusyId(null);
    }
  }

  async function saveProduct(productId: string, rows: InventoryRow[]) {
    const updates: Array<{ variantId: string; onHand?: number; lowStockThreshold?: number }> = [];
    for (const r of rows) {
      const patch: { variantId: string; onHand?: number; lowStockThreshold?: number } = {
        variantId: r.variantId
      };
      const availRaw = availableDrafts[r.variantId];
      const availN = availRaw !== undefined ? parseInt(availRaw, 10) : r.available;
      if (!Number.isFinite(availN) || availN < 0) {
        pushToast(`Invalid available qty for ${r.sku}`, true);
        return;
      }
      if (availN !== (savedAvailable[r.variantId] ?? r.available)) {
        patch.onHand = availN + Math.max(0, r.reserved);
      }
      const thRaw = thresholdDrafts[r.variantId];
      const thN = thRaw !== undefined ? parseInt(thRaw, 10) : r.lowStockThreshold;
      if (!Number.isFinite(thN) || thN < 0) {
        pushToast(`Invalid low-stock threshold for ${r.sku}`, true);
        return;
      }
      if (thN !== (savedThresholds[r.variantId] ?? r.lowStockThreshold)) {
        patch.lowStockThreshold = thN;
      }
      if (patch.onHand !== undefined || patch.lowStockThreshold !== undefined) {
        updates.push(patch);
      }
    }
    if (updates.length === 0) {
      pushToast("No changes to save");
      return;
    }
    setProductSaving(productId);
    try {
      const { updated } = await bulkPatchAdminInventory(updates);
      pushToast(`Saved ${updated} variant${updated === 1 ? "" : "s"}`);
      await load();
    } catch (e) {
      pushToast(e instanceof Error ? e.message : "Save failed", true);
    } finally {
      setProductSaving(null);
    }
  }

  function productHasChanges(rows: InventoryRow[]): boolean {
    return rows.some((r) => {
      const availRaw = availableDrafts[r.variantId];
      const availN = availRaw !== undefined ? parseInt(availRaw, 10) : NaN;
      const thRaw = thresholdDrafts[r.variantId];
      const thN = thRaw !== undefined ? parseInt(thRaw, 10) : NaN;
      const availDirty =
        Number.isFinite(availN) && availN !== (savedAvailable[r.variantId] ?? r.available);
      const thDirty =
        Number.isFinite(thN) && thN !== (savedThresholds[r.variantId] ?? r.lowStockThreshold);
      return availDirty || thDirty;
    });
  }

  function categoryLabel(): string {
    if (!categorySlug) return "All categories";
    for (const root of INVENTORY_CATEGORY_TREE) {
      if (root.slug === categorySlug) return root.name;
      const child = root.children.find((c) => c.slug === categorySlug);
      if (child) return `${root.name} · ${child.name}`;
    }
    return "Category";
  }

  const headerBtnClass =
    "inline-flex h-11 items-center gap-1.5 rounded-md border border-stone-200 bg-white px-3 text-sm font-semibold text-stone-700 shadow-sm hover:bg-[#eef6f1] disabled:opacity-50 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-200";

  useRegisterAdminHeaderSlot(
    () => ({
      wideSearch: true,
      searchPlaceholder: "Search inventory SKUs, products…",
      searchValue: searchInput,
      onSearchChange: setSearchInput,
      onSearchSubmit: (value) => applyInventorySearch(value),
      searchSuggestions: headerSuggestions,
      onSelectSuggestion: (s) => {
        if (s.id.startsWith("product:")) {
          applyInventorySearch(s.label, { productId: s.id.slice("product:".length) });
        } else {
          applyInventorySearch(s.label);
        }
      },
      afterSearch: (
        <div className="relative" ref={categoryMenuRef}>
          <button
            type="button"
            aria-expanded={categoryMenuOpen}
            aria-haspopup="menu"
            onClick={() => setCategoryMenuOpen((o) => !o)}
            className={`${headerBtnClass} max-w-[220px]`}
          >
            <span className="truncate">{categoryLabel()}</span>
            <IconChevronDown className="h-4 w-4 shrink-0 opacity-60" />
          </button>
          {categoryMenuOpen ? (
            <div className="absolute left-0 z-50 mt-1 flex overflow-hidden rounded-lg border border-stone-200 bg-white shadow-xl dark:border-stone-600 dark:bg-stone-900">
              <div className="w-56 border-r border-stone-100 py-1 dark:border-stone-700">
                <button
                  type="button"
                  className={`block w-full px-3 py-2 text-left text-sm ${
                    !categorySlug
                      ? "bg-[#faf5ec] font-semibold text-[#1e3a2f]"
                      : "text-stone-700 hover:bg-stone-50 dark:text-stone-200 dark:hover:bg-stone-800"
                  }`}
                  onClick={() => {
                    setCategorySlug("");
                    setCategoryMenuOpen(false);
                    setCategoryHoverRoot(null);
                  }}
                >
                  All
                </button>
                {INVENTORY_CATEGORY_TREE.map((root) => (
                  <button
                    key={root.slug}
                    type="button"
                    className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm ${
                      categorySlug === root.slug ||
                      root.children.some((c) => c.slug === categorySlug) ||
                      categoryHoverRoot === root.slug
                        ? "bg-[#faf5ec] font-semibold text-[#1e3a2f]"
                        : "text-stone-700 hover:bg-stone-50 dark:text-stone-200 dark:hover:bg-stone-800"
                    }`}
                    onMouseEnter={() => setCategoryHoverRoot(root.slug)}
                    onFocus={() => setCategoryHoverRoot(root.slug)}
                    onClick={() => {
                      setCategorySlug(root.slug);
                      setCategoryMenuOpen(false);
                      setCategoryHoverRoot(null);
                    }}
                  >
                    <span className="truncate">{root.name}</span>
                    <span className="text-stone-400">›</span>
                  </button>
                ))}
              </div>
              {categoryHoverRoot ? (
                <div className="w-56 py-1">
                  {(INVENTORY_CATEGORY_TREE.find((r) => r.slug === categoryHoverRoot)?.children ?? []).map(
                    (child) => (
                      <button
                        key={child.slug}
                        type="button"
                        className={`block w-full px-3 py-2 text-left text-sm ${
                          categorySlug === child.slug
                            ? "bg-[#faf5ec] font-semibold text-[#1e3a2f]"
                            : "text-stone-700 hover:bg-stone-50 dark:text-stone-200 dark:hover:bg-stone-800"
                        }`}
                        onClick={() => {
                          setCategorySlug(child.slug);
                          setCategoryMenuOpen(false);
                          setCategoryHoverRoot(null);
                        }}
                      >
                        {child.name}
                      </button>
                    )
                  )}
                </div>
              ) : (
                <div className="flex w-56 items-center px-3 py-6 text-xs text-stone-400">
                  Hover a category for sub-filters
                </div>
              )}
            </div>
          ) : null}
        </div>
      ),
      actions: (
        <>
          <Link href="/admin/inventory/xl" className={headerBtnClass}>
            <FileSpreadsheet className="h-3.5 w-3.5" />
            XL
          </Link>
          <div className="relative" ref={exportMenuRef}>
            <button
              type="button"
              onClick={() => setExportOpen((o) => !o)}
              disabled={loading || displayedRows.length === 0}
              className={headerBtnClass}
            >
              <IconDownload className="h-3.5 w-3.5" />
              Export
              <IconChevronDown className="h-3 w-3 opacity-70" />
            </button>
            {exportOpen ? (
              <div className="admin-menu-panel absolute right-0 z-50 mt-1 min-w-[140px] overflow-hidden rounded-lg border border-stone-200 bg-white py-1 shadow-lg dark:border-stone-600 dark:bg-stone-900">
                <button
                  type="button"
                  className="block w-full px-3 py-2 text-left text-sm text-stone-800 hover:bg-[#faf5ec] dark:text-stone-100 dark:hover:bg-stone-800"
                  onClick={() => {
                    downloadCsv(
                      `sarveda-inventory-${new Date().toISOString().slice(0, 10)}.csv`,
                      inventoryToCsv(displayedRows)
                    );
                    setExportOpen(false);
                  }}
                >
                  CSV
                </button>
                <button
                  type="button"
                  className="block w-full px-3 py-2 text-left text-sm text-stone-800 hover:bg-[#faf5ec] dark:text-stone-100 dark:hover:bg-stone-800"
                  onClick={() => {
                    downloadExcelXml(
                      `sarveda-inventory-${new Date().toISOString().slice(0, 10)}.xls`,
                      inventoryToExcelXml(displayedRows)
                    );
                    setExportOpen(false);
                  }}
                >
                  Excel
                </button>
              </div>
            ) : null}
          </div>
          {canReconcile ? (
            <button
              type="button"
              disabled={reconciling || loading}
              onClick={() => {
                void (async () => {
                  setReconciling(true);
                  try {
                    const result = await reconcileAdminInventoryReserved();
                    pushToast(
                      `Reserved reconciled: ${result.repaired.length} SKU(s) fixed, ${result.summaryAfter.orphanUnits} orphan unit(s) left`
                    );
                    await load();
                  } catch (e) {
                    pushToast(e instanceof Error ? e.message : "Reconcile failed", true);
                  } finally {
                    setReconciling(false);
                  }
                })();
              }}
              className="inline-flex h-11 items-center gap-1.5 rounded-md border border-amber-300 bg-amber-50 px-3 text-sm font-semibold text-amber-900 shadow-sm hover:bg-amber-100 disabled:opacity-50"
              title="Set reserved = unpaid checkout holds only"
            >
              {reconciling ? "…" : "Reconcile"}
            </button>
          ) : null}
        </>
      )
    }),
    [
      searchInput,
      headerSuggestions,
      categorySlug,
      categoryMenuOpen,
      categoryHoverRoot,
      exportOpen,
      loading,
      displayedRows,
      reconciling,
      canReconcile
    ]
  );

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

  async function runPullAllFromZoho() {
    if (
      !window.confirm(
        "Overwrite ALL Sarveda stock counts with Zoho's counts? Zoho is the master for stock. This does not change reserved (held) units."
      )
    ) {
      return;
    }
    setZohoSyncing("pull_all");
    try {
      const result = await syncStockFromZohoAdmin({ auditOnly: false });
      pushToast(
        `Synced ${result.synced} SKU${result.synced === 1 ? "" : "s"} from Zoho` +
          (result.skipped ? ` · ${result.skipped} skipped` : "") +
          (result.errors ? ` · ${result.errors} errors` : ""),
        result.errors > 0
      );
      await load();
      setHistoryOpen(true);
    } catch (e) {
      pushToast(e instanceof Error ? e.message : "Sync from Zoho failed", true);
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
        const ids = displayedRows.filter((r) => effectiveZohoScenario(r) === 4).map((r) => r.variantId);
        if (ids.length === 0) return;
        const r = await pushItemsToZohoAdmin(ids);
        pushToast(`Pushed ${r.ok} item${r.ok === 1 ? "" : "s"} to Zoho`, r.errors > 0);
      } else {
        const skus =
          zohoSubFilter === "count_mismatch"
            ? displayedRows.filter((r) => effectiveZohoScenario(r) === 2).map((r) => r.sku)
            : displayedRows.filter((r) => effectiveZohoScenario(r) === 4).map((r) => r.sku);
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
    const scenario = effectiveZohoScenario(r);
    if (!zohoAuditAvailable || !scenario || scenario === 1) return null;
    const syncing = busy === r.sku || zohoSyncing !== null;

    if (scenario === 2) {
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

    if (scenario === 4) {
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
    const dirty = productHasChanges(g.rows);
    const saving = productSaving === g.productId;

    return (
      <tr
        key={`product-${g.productId}`}
        className={`admin-inv-product-row cursor-pointer border-t border-stone-200 dark:border-stone-700 ${
          expanded ? "is-expanded" : "bg-stone-50/95 hover:bg-stone-100/80 dark:bg-stone-800/50 dark:hover:bg-stone-800"
        } ${
          g.zohoOutOfSync > 0
            ? "border-l-2 border-l-amber-400"
            : "border-l-2 border-l-transparent"
        }`}
        onClick={() => toggleProduct(g.productId)}
      >
        <td className="w-10 px-3 py-3">
          <IconChevron open={expanded} />
        </td>
        <td className="px-4 py-3" colSpan={2}>
          <span className="text-base font-semibold text-stone-900 dark:text-stone-100">{g.productName}</span>
          <p className="mt-0.5 text-xs text-stone-500">
            {g.variantCount} variant{g.variantCount === 1 ? "" : "s"}
            {showZohoSync && g.zohoOutOfSync > 0 ? ` · ${g.zohoOutOfSync} out of sync` : ""}
            {` · ${g.rows.filter((r) => r.dropShipEnabled).length}/${g.variantCount} drop ship`}
          </p>
        </td>
        {showZohoSync ? (
          <td className="px-4 py-3">
            {g.zohoOutOfSync > 0 ? (
              <span
                style={{
                  background: "#fef3c7",
                  color: "#92400e",
                  borderRadius: "999px",
                  padding: "2px 8px",
                  fontSize: "11px",
                  fontWeight: 700
                }}
              >
                Review SKUs
              </span>
            ) : g.zohoSynced > 0 ? (
              <span className="text-xs text-emerald-700 dark:text-emerald-400">Synced</span>
            ) : (
              <span className="text-xs text-stone-400">—</span>
            )}
          </td>
        ) : null}
        <td className="px-4 py-3 text-center text-stone-400">—</td>
        <td className="px-4 py-3 text-right font-mono font-semibold tabular-nums text-stone-800 dark:text-stone-100">
          {g.totalAvailable}
        </td>
        <td className="px-4 py-3 text-right text-stone-400">—</td>
        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
          <div className="flex flex-wrap justify-end gap-1.5">
            <Link
              href={`/admin/products/${g.productId}`}
              title="Edit product"
              aria-label="Edit product"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-stone-200 bg-white text-stone-700 shadow-sm hover:border-amber-400 hover:text-[#1e3a2f] dark:border-stone-600 dark:bg-stone-900 dark:text-stone-200"
            >
              <IconEdit className="h-4 w-4" />
            </Link>
            <button
              type="button"
              title="Save variants"
              aria-label="Save variants"
              disabled={!dirty || saving}
              onClick={() => void saveProduct(g.productId, g.rows)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-stone-200 bg-white text-[#1e3a2f] shadow-sm hover:border-amber-400 disabled:cursor-not-allowed disabled:opacity-35 dark:border-stone-600 dark:bg-stone-900 dark:text-[#8fd3b6]"
            >
              <IconSave className={`h-4 w-4 ${saving ? "animate-pulse" : ""}`} />
            </button>
            {showZohoSync ? (
              <button
                type="button"
                disabled={zohoSyncing !== null}
                onClick={() => void runProductAudit(g.productId, g.productName)}
                className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold ${actionForest}`}
              >
                <IconRefresh className={`h-3 w-3 ${productSyncing ? "animate-spin" : ""}`} />
                Audit
              </button>
            ) : null}
          </div>
        </td>
      </tr>
    );
  }

  function renderVariantRow(r: InventoryRow) {
    const thresholdDirty = thresholdChanges.some((c) => c.variantId === r.variantId);
    const availableDirty = availableChanges.some((c) => c.variantId === r.variantId);
    return (
      <Fragment key={r.variantId}>
        <tr
          className={`admin-inv-variant-row border-t border-stone-100 bg-white dark:border-stone-800 dark:bg-stone-900/40 ${
            r.low ? "bg-red-50/40 dark:bg-red-950/10" : ""
          } ${thresholdDirty || availableDirty ? "bg-amber-50/30 dark:bg-amber-950/10" : ""}`}
        >
          <td className="px-3 py-2.5" />
          <td className="px-4 py-2.5 pl-8 text-sm font-medium text-stone-800 dark:text-stone-200">
            {r.variantLabel ?? "Default"}
            {r.low ? (
              <span className="ml-2 rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-red-800 dark:bg-red-900/60 dark:text-red-100">
                Low
              </span>
            ) : null}
          </td>
          <td className="px-4 py-2.5 font-mono text-xs font-semibold text-stone-800 dark:text-stone-200">
            {r.sku}
          </td>
          {showZohoSync ? (
            <td className="px-4 py-2.5">
              <ZohoBadge row={r} auditAvailable={zohoAuditAvailable} />
            </td>
          ) : null}
          <td className="px-4 py-2.5 text-center" onClick={(e) => e.stopPropagation()}>
            <div className="inline-flex flex-col items-center gap-0.5">
              <DropShipToggle
                enabled={Boolean(r.dropShipEnabled)}
                busy={dropShipBusyId === r.variantId}
                onToggle={() => void toggleDropShip(r)}
              />
              <span className="text-[10px] font-medium text-stone-500">
                {r.dropShipEnabled ? "On" : "Off"}
              </span>
            </div>
          </td>
          <td className="px-4 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              aria-label={`Available ${r.sku}`}
              value={availableDrafts[r.variantId] ?? ""}
              onChange={(e) =>
                setAvailableDrafts((d) => ({
                  ...d,
                  [r.variantId]: sanitizeNonNegIntInput(e.target.value)
                }))
              }
              className="w-20 rounded border border-stone-200 px-2 py-1.5 text-right font-mono text-sm text-stone-900 outline-none focus:border-[#1c352a] focus:ring-2 focus:ring-[#1c352a]/15 dark:border-stone-600 dark:bg-stone-950 dark:text-stone-100"
            />
            {showZohoSync && r.zohoStockOnHand !== null && effectiveZohoScenario(r) === 2 ? (
              <span className="mt-0.5 block text-[10px] font-normal text-stone-400">
                Zoho: {r.zohoStockOnHand}
              </span>
            ) : null}
            {r.reserved > 0 ? (
              <span className="mt-0.5 block text-[10px] font-normal text-stone-400">{r.reserved} held</span>
            ) : null}
          </td>
          <td className="px-4 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              aria-label={`Low stock threshold ${r.sku}`}
              value={thresholdDrafts[r.variantId] ?? ""}
              onChange={(e) =>
                setThresholdDrafts((d) => ({
                  ...d,
                  [r.variantId]: sanitizeNonNegIntInput(e.target.value)
                }))
              }
              className="w-16 rounded border border-stone-200 px-2 py-1.5 text-right font-mono text-sm text-stone-900 outline-none focus:border-[#1c352a] focus:ring-2 focus:ring-[#1c352a]/15 dark:border-stone-600 dark:bg-stone-950 dark:text-stone-100"
            />
          </td>
          <td className="px-4 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
            {showZohoSync ? renderZohoRowActions(r) : (
              <span className="text-xs text-stone-400">—</span>
            )}
          </td>
        </tr>
      </Fragment>
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

  const dropShipTabs: { id: DropShipFilter; label: string }[] = [
    { id: "all", label: "All" },
    { id: "non_drop_shipped", label: "Through Sarveda Warehouse" },
    { id: "drop_shipped", label: "Drop shipped" }
  ];

  return (
    <div className="mx-auto max-w-[1400px] space-y-4 font-sans">
      <style>{`
        @keyframes admin-inv-fade {
          from { opacity: 0.45; }
          to { opacity: 1; }
        }
        .admin-metric-fade { animation: admin-inv-fade 0.35s ease; }
        .admin-inv-list-fade { animation: admin-inv-fade 0.38s ease; }
      `}</style>
      <AdminToast toast={toast} onDismiss={() => setToast(null)} />

      <div
        className={`grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-stone-200 bg-stone-200 sm:grid-cols-3 ${
          showZohoSync ? "lg:grid-cols-6" : "lg:grid-cols-5"
        } dark:border-stone-700 dark:bg-stone-700`}
      >
        <div className="bg-white dark:bg-stone-900">
          <MetricCard
            label="Variants"
            value={stats.total}
            active={stockFilter === "all"}
            flashKey={statsFlash}
            onClick={() => selectStockFilter("all")}
          />
        </div>
        <div className="bg-white dark:bg-stone-900">
          <MetricCard
            label="In stock"
            value={stats.inStock}
            tone="emerald"
            active={stockFilter === "in_stock"}
            flashKey={statsFlash}
            onClick={() => selectStockFilter("in_stock")}
          />
        </div>
        <div className="bg-white dark:bg-stone-900">
          <MetricCard
            label="Low stock"
            value={stats.lowStock}
            tone="amber"
            active={stockFilter === "low_stock"}
            flashKey={statsFlash}
            onClick={() => selectStockFilter("low_stock")}
          />
        </div>
        <div className="bg-white dark:bg-stone-900">
          <MetricCard
            label="Out of stock"
            value={stats.outOfStock}
            tone="red"
            active={stockFilter === "out_of_stock"}
            flashKey={statsFlash}
            onClick={() => selectStockFilter("out_of_stock")}
          />
        </div>
        <div className="bg-white dark:bg-stone-900">
          <MetricCard
            label="Reserved units"
            value={reservedStock?.totalStoredReservedUnits ?? allRows.reduce((s, r) => s + r.reserved, 0)}
            tone={(reservedStock?.orphanUnits ?? 0) > 0 ? "amber" : "emerald"}
          />
        </div>
        {showZohoSync ? (
          <div className="bg-white dark:bg-stone-900">
            <MetricCard
              label="Out of Sync with Zoho"
              value={zohoAuditAvailable ? outOfSyncTotal : "—"}
              tone="amber"
              active={stockFilter === "out_of_sync"}
              flashKey={statsFlash}
              onClick={
                zohoAuditAvailable && outOfSyncTotal > 0
                  ? () => {
                      selectStockFilter("out_of_sync");
                      setZohoSubFilter("count_mismatch");
                    }
                  : undefined
              }
            />
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {dropShipTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => {
              setDropShipFilter(tab.id);
              setListFadeKey((k) => k + 1);
            }}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors duration-200 ${
              dropShipFilter === tab.id
                ? "bg-[#1c352a] font-bold text-white shadow-sm"
                : "border border-stone-200 bg-white text-stone-600 hover:bg-[#eef6f1] dark:border-stone-600 dark:bg-stone-900 dark:text-stone-400 dark:hover:bg-stone-800"
            }`}
          >
            {tab.label}{" "}
            <span className="tabular-nums opacity-80">{dropShipTabCounts[tab.id]}</span>
          </button>
        ))}
        {showZohoSync ? (
          <div className="ml-auto flex flex-wrap gap-2">
            <button
              type="button"
              disabled={zohoSyncing === "audit"}
              onClick={() => void runZohoAudit()}
              className="inline-flex items-center gap-2 rounded-md border border-[#1e3a2f]/30 bg-white px-3 py-1.5 text-xs font-semibold text-[#1e3a2f] shadow-sm hover:bg-[#faf5ec]/60 disabled:opacity-50 dark:border-[#2d5240] dark:bg-stone-800 dark:text-[#8fd3b6]"
            >
              <IconRefresh className={`h-3.5 w-3.5 ${zohoSyncing === "audit" ? "animate-spin" : ""}`} />
              Refresh Zoho audit
            </button>
            <button
              type="button"
              disabled={zohoSyncing === "pull_all"}
              onClick={() => void runPullAllFromZoho()}
              className="inline-flex items-center gap-2 rounded-md bg-[#1e3a2f] px-3 py-1.5 text-xs font-semibold text-[#fffbf5] shadow-sm hover:bg-[#2d5240] disabled:opacity-50"
            >
              Sync all from Zoho
            </button>
          </div>
        ) : null}
      </div>
      {canReconcile && reservedStock && reservedStock.orphanUnits > 0 ? (
        <p className="text-sm text-amber-800">
          {reservedStock.orphanUnits} orphan reserved unit(s) across {reservedStock.orphanVariantCount}{" "}
          SKU(s) are not tied to unpaid checkouts. Use <strong>Reconcile</strong> in the top bar (safe — does
          not delete orders or change on-hand).
        </p>
      ) : null}

      {showZohoSync ? (
      <div className="rounded-lg border border-stone-200 bg-white shadow-sm dark:border-stone-700 dark:bg-stone-900">
        <button
          type="button"
          onClick={() => setHistoryOpen((o) => !o)}
          className="flex w-full items-center justify-between px-4 py-3 text-left text-sm transition-[background] duration-150 hover:bg-[#faf5ec] dark:text-stone-300 dark:hover:bg-stone-800/60"
        >
          <span style={{ fontWeight: 600, color: "#2c2420" }}>Sync history ({syncHistory.length})</span>
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
      ) : null}

      {showZohoSync && stockFilter === "out_of_sync" ? (
        <div
          className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm dark:border-stone-700 dark:bg-stone-900"
          style={{ borderLeft: "3px solid rgba(185,138,62,0.2)" }}
        >
          <div className="flex flex-wrap gap-1">
            {zohoSubTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setZohoSubFilter(tab.id)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium ${
                  zohoSubFilter === tab.id
                    ? "text-[#fffbf5]"
                    : "border border-stone-200 text-stone-600 dark:border-stone-600 dark:text-stone-400"
                }`}
                style={
                  zohoSubFilter === tab.id
                    ? {
                        background: "linear-gradient(135deg, #1c352a, #2d5040)",
                        boxShadow: "0 1px 4px rgba(28,53,42,0.2)"
                      }
                    : undefined
                }
              >
                {tab.label}{" "}
                <span className="tabular-nums opacity-80">{zohoSubCounts[tab.id]}</span>
              </button>
            ))}
          </div>
          {zohoSubFilter === "count_mismatch" && zohoSubCounts.count_mismatch > 0 ? (
            <div className="mt-3 flex flex-wrap gap-2">
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
              className={`${actionForest} mt-3`}
            >
              Bulk: Push to Zoho
            </button>
          ) : null}
        </div>
      ) : null}

      {showZohoSync && staleBackend ? (
        <div
          className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100"
          role="status"
        >
          <strong>Backend update pending on EC2.</strong> Staging is still running the old Zoho API (no{" "}
          <code className="text-xs">zohoSyncScenario</code> per row). Counts below use legacy{" "}
          <code className="text-xs">inZohoBooks</code> until you deploy backend and click{" "}
          <strong>Refresh Zoho audit</strong>. SSH:{" "}
          <code className="text-xs">git pull && cd backend && npm install && npm run build && pm2 restart sarveda-backend</code>
        </div>
      ) : null}

      {err ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800" role="alert">
          {err}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
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
        {!(stockFilter === "out_of_sync" && zohoSubFilter === "zoho_only") ? (
          <ExpandCollapseSwitcher mode={expandMode} onExpand={expandAll} onCollapse={collapseAll} />
        ) : null}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div
              key={i}
              className="h-14 animate-pulse rounded-lg bg-stone-100 dark:bg-stone-800"
              style={{ opacity: 1 - i * 0.25 }}
            />
          ))}
        </div>
      ) : showZohoSync && stockFilter === "out_of_sync" && zohoSubFilter === "zoho_only" ? (
        renderZohoOnlyTable()
      ) : productGroups.length === 0 ? (
        <div className="rounded-lg border border-dashed border-stone-300 px-8 py-16 text-center text-sm text-stone-500">
          🔍 No products match your current filters
          <p style={{ color: "#8a7060", marginTop: "8px", fontSize: "13px" }}>
            Try clearing the search or changing the stock filter
          </p>
        </div>
      ) : (
        <div
          key={listFadeKey}
          className="admin-inv-list-fade overflow-hidden rounded-lg border border-stone-200 bg-white shadow-sm dark:border-stone-700 dark:bg-stone-900"
        >
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 z-10 border-b border-stone-200 bg-gradient-to-b from-stone-100/95 to-stone-50/95 backdrop-blur dark:border-stone-600 dark:bg-stone-800/95">
                <tr>
                  <th className={`${thClass} w-10`} aria-label="Expand" />
                  <th className={thClass}>Product / variant</th>
                  <th className={thClass}>SKU</th>
                  {showZohoSync ? <th className={thClass}>Zoho</th> : null}
                  <th className={`${thClass} text-center`}>Drop ship</th>
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
