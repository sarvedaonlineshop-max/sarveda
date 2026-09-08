"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, Download, FileSpreadsheet, GripVertical, ScanSearch } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { AdminToast } from "@/components/admin/AdminToast";
import { useAdminNavOptional } from "@/components/admin/AdminNavContext";
import { useAdminPageHeader } from "@/components/admin/useAdminPageHeader";
import type { AdminProductRow } from "@/lib/admin-api";
import { fetchAdminProducts, fetchProductsXlSheet, putAdminProduct, reorderAdminProducts } from "@/lib/admin-api";
import {
  downloadCsvFile,
  downloadExcelXmlFile,
  productsSheetToCsv,
  productsSheetToExcelXml
} from "@/lib/admin-sheet-export";
import { fetchCategoryTree } from "@/lib/api";
import type { CategoryNode } from "@/lib/types";
import { formatINRFromPaise } from "@/lib/money";

function flattenCategoryOptions(nodes: CategoryNode[], depth = 0): { slug: string; label: string }[] {
  const out: { slug: string; label: string }[] = [];
  for (const n of nodes) {
    out.push({ slug: n.slug, label: `${"\u2003".repeat(depth)}${n.name}` });
    if (n.children?.length) {
      out.push(...flattenCategoryOptions(n.children, depth + 1));
    }
  }
  return out;
}

const thClass =
  "px-4 py-[11px] text-left text-[14px] font-bold uppercase tracking-[0.08em] text-[var(--admin-text-muted,#8a7060)] whitespace-nowrap";

const ROW_H = 72;
const FULL_LIST_VISIBLE_ROWS = 24;
const FULL_LIST_MAX_H = ROW_H * FULL_LIST_VISIBLE_ROWS;
const AUTO_SCROLL_EDGE = 48;
const AUTO_SCROLL_STEP = 10;

export default function AdminProductsPage() {
  const router = useRouter();
  const nav = useAdminNavOptional();
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<AdminProductRow[]>([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 24, total: 0, totalPages: 1 });
  const [categories, setCategories] = useState<{ slug: string; label: string }[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; error?: boolean } | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const [savingOrder, setSavingOrder] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const autoScrollRaf = useRef<number | null>(null);
  const autoScrollDir = useRef<0 | 1 | -1>(0);

  const searchActive = q.trim().length > 0;
  const canReorder = !searchActive && !savingOrder;
  const reorderHint = searchActive
    ? "Clear search to enable drag-reorder."
    : "Drag the grip handle to set storefront order. Saves automatically.";

  useEffect(() => {
    fetchCategoryTree({ cache: "no-store" })
      .then((tree) => setCategories(flattenCategoryOptions(tree)))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setExportOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  async function exportProducts(format: "csv" | "xls") {
    if (exporting) return;
    setExporting(true);
    setExportOpen(false);
    try {
      const data = await fetchProductsXlSheet({ status: "ALL" });
      const stamp = new Date().toISOString().slice(0, 10);
      if (format === "csv") {
        downloadCsvFile(`sarveda-products-${stamp}.csv`, productsSheetToCsv(data.rows));
      } else {
        downloadExcelXmlFile(`sarveda-products-${stamp}.xls`, productsSheetToExcelXml(data.rows));
      }
      setToast({ message: `Exported ${data.rows.length} variant row(s)` });
    } catch (ex) {
      setToast({ message: ex instanceof Error ? ex.message : "Export failed", error: true });
    } finally {
      setExporting(false);
    }
  }

  const load = useCallback(async () => {
    setErr(null);
    try {
      const data = await fetchAdminProducts({
        q: q || undefined,
        category: category || undefined,
        status: status || undefined,
        page: 1,
        limit: 2000
      });
      setItems(data.items);
      setPagination(data.pagination);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load products");
      setItems([]);
    }
  }, [q, category, status]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    return () => {
      if (autoScrollRaf.current != null) cancelAnimationFrame(autoScrollRaf.current);
    };
  }, []);

  function stopAutoScroll() {
    autoScrollDir.current = 0;
    if (autoScrollRaf.current != null) {
      cancelAnimationFrame(autoScrollRaf.current);
      autoScrollRaf.current = null;
    }
  }

  function ensureAutoScrollLoop() {
    if (autoScrollRaf.current != null) return;
    const tick = () => {
      const el = scrollRef.current;
      const dir = autoScrollDir.current;
      if (!el || dir === 0) {
        autoScrollRaf.current = null;
        return;
      }
      el.scrollTop += dir * AUTO_SCROLL_STEP;
      autoScrollRaf.current = requestAnimationFrame(tick);
    };
    autoScrollRaf.current = requestAnimationFrame(tick);
  }

  function handleListDragOver(e: React.DragEvent) {
    if (!canReorder) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const el = scrollRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const y = e.clientY - rect.top;
    if (y < AUTO_SCROLL_EDGE) {
      autoScrollDir.current = -1;
      ensureAutoScrollLoop();
    } else if (y > rect.height - AUTO_SCROLL_EDGE) {
      autoScrollDir.current = 1;
      ensureAutoScrollLoop();
    } else {
      stopAutoScroll();
    }
  }

  async function persistOrder(nextItems: AdminProductRow[]) {
    const prev = items;
    setItems(nextItems);
    setSavingOrder(true);
    try {
      await reorderAdminProducts({
        categorySlug: category.trim() ? category.trim() : null,
        orderedIds: nextItems.map((p) => p.id)
      });
      setToast({
        message: category.trim()
          ? "Category order saved"
          : "Storefront order saved"
      });
    } catch (ex) {
      setItems(prev);
      setToast({
        message: ex instanceof Error ? ex.message : "Failed to save order",
        error: true
      });
      await load();
    } finally {
      setSavingOrder(false);
    }
  }

  function onHandleDragStart(e: React.DragEvent, id: string) {
    if (!canReorder) {
      e.preventDefault();
      return;
    }
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", id);
    setDragId(id);
  }

  function onRowDragOver(e: React.DragEvent, index: number) {
    if (!canReorder || !dragId) return;
    e.preventDefault();
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const before = e.clientY < rect.top + rect.height / 2;
    setDropIndex(before ? index : index + 1);
  }

  async function onDrop(e: React.DragEvent) {
    e.preventDefault();
    stopAutoScroll();
    const id = dragId || e.dataTransfer.getData("text/plain");
    const target = dropIndex;
    setDragId(null);
    setDropIndex(null);
    if (!canReorder || !id || target == null) return;

    const from = items.findIndex((p) => p.id === id);
    if (from < 0) return;
    let to = target;
    if (from < to) to -= 1;
    if (from === to) return;

    const next = [...items];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    await persistOrder(next);
  }

  function onDragEnd() {
    stopAutoScroll();
    setDragId(null);
    setDropIndex(null);
  }

  async function toggleStatus(p: AdminProductRow, e: React.MouseEvent) {
    e.stopPropagation();
    const next = p.status === "ACTIVE" ? "DRAFT" : "ACTIVE";
    setBusyId(p.id);
    try {
      await putAdminProduct(p.id, { status: next });
      setToast({ message: next === "ACTIVE" ? "Product set to active" : "Product set to draft" });
      await load();
    } catch (ex) {
      setToast({ message: ex instanceof Error ? ex.message : "Update failed", error: true });
    } finally {
      setBusyId(null);
    }
  }

  const secondaryActionStyle: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: "5px",
    padding: "5px 10px",
    borderRadius: "999px",
    background: "rgba(255,255,255,0.08)",
    color: "#faf5ec",
    border: "1px solid rgba(232,213,168,0.45)",
    fontSize: "12px",
    fontWeight: 600,
    cursor: "pointer",
    textDecoration: "none",
    whiteSpace: "nowrap"
  };

  useAdminPageHeader(
    () => ({
      title: "Products",
      icon: "📦",
      subtitle: <>Drag the handle to set storefront order (global or this category).</>,
      actions: (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "center" }}>
          <div style={{ position: "relative" }} ref={exportMenuRef}>
            <button
              type="button"
              disabled={exporting}
              onClick={() => setExportOpen((o) => !o)}
              style={{
                ...secondaryActionStyle,
                cursor: exporting ? "wait" : "pointer",
                opacity: exporting ? 0.7 : 1
              }}
            >
              <Download size={14} aria-hidden />
              {exporting ? "Exporting…" : "Export"}
              <ChevronDown size={14} aria-hidden />
            </button>
            {exportOpen ? (
              <div className="absolute right-0 z-30 mt-1 min-w-[150px] overflow-hidden rounded-lg border border-stone-200 bg-white py-1 shadow-lg">
                <button
                  type="button"
                  className="block w-full px-3 py-2 text-left text-sm text-stone-800 hover:bg-[#faf5ec]"
                  onClick={() => void exportProducts("csv")}
                >
                  CSV
                </button>
                <button
                  type="button"
                  className="block w-full px-3 py-2 text-left text-sm text-stone-800 hover:bg-[#faf5ec]"
                  onClick={() => void exportProducts("xls")}
                >
                  Excel (XL)
                </button>
              </div>
            ) : null}
          </div>
          <Link href="/admin/products/xl" style={secondaryActionStyle}>
            <FileSpreadsheet size={14} aria-hidden />
            View in XL format
          </Link>
          <Link href="/admin/catalog-gaps" style={secondaryActionStyle}>
            <ScanSearch size={14} aria-hidden />
            Catalog gaps
          </Link>
          <Link
            href="/admin/products/new"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              padding: "8px 12px",
              borderRadius: "999px",
              textDecoration: "none",
              color: "#fff",
              background: "linear-gradient(135deg, #b98a3e, #c8960a)",
              fontSize: "13px",
              fontWeight: 700,
              border: "none",
              cursor: "pointer",
              whiteSpace: "nowrap"
            }}
          >
            ✨ Add product
          </Link>
        </div>
      )
    }),
    [exporting, exportOpen]
  );

  return (
    <div className="w-full space-y-5 font-sans">
      <AdminToast toast={toast} onDismiss={() => setToast(null)} />

      <div
        className="h-px w-full"
        style={{
          background: "linear-gradient(90deg, transparent, rgba(185,138,62,0.2), transparent)"
        }}
        aria-hidden
      />

      <div
        style={{
          background: "var(--admin-card-bg, #fff)",
          border: "1px solid var(--admin-card-border, #e8e2d9)",
          borderRadius: "12px",
          boxShadow: "0 1px 2px rgba(15,23,42,0.045), 0 8px 24px rgba(15,23,42,0.04)",
          padding: "12px 14px",
          display: "flex",
          flexWrap: "wrap",
          alignItems: "flex-end",
          gap: "8px"
        }}
      >
        <div style={{ flex: "1 1 180px", minWidth: "140px" }}>
          <label
            htmlFor="q"
            style={{
              display: "block",
              fontSize: "13px",
              fontWeight: 600,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              color: "var(--admin-text-muted, #8a7060)",
              marginBottom: "3px",
              whiteSpace: "nowrap"
            }}
          >
            Search
          </label>
          <input
            id="q"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onBlur={() => setPage(1)}
            placeholder="Product name…"
            style={{
              width: "100%",
              boxSizing: "border-box",
              padding: "6px 8px",
              borderRadius: "8px",
              border: "1px solid var(--admin-card-border, #e8e2d9)",
              background: "var(--admin-card-bg, #fff)",
              color: "var(--admin-text, #2c2420)",
              fontSize: "15px",
              minWidth: 0,
              fontFamily: "inherit",
              outline: "none"
            }}
          />
        </div>
        <div style={{ flex: "0 1 160px", minWidth: "140px" }}>
          <label
            htmlFor="category"
            style={{
              display: "block",
              fontSize: "13px",
              fontWeight: 600,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              color: "var(--admin-text-muted, #8a7060)",
              marginBottom: "3px",
              whiteSpace: "nowrap"
            }}
          >
            Category
          </label>
          <select
            id="category"
            value={category}
            onChange={(e) => {
              setPage(1);
              setCategory(e.target.value);
            }}
            style={{
              width: "100%",
              boxSizing: "border-box",
              padding: "6px 8px",
              borderRadius: "8px",
              border: "1px solid var(--admin-card-border, #e8e2d9)",
              background: "var(--admin-card-bg, #fff)",
              color: "var(--admin-text, #2c2420)",
              fontSize: "15px",
              minWidth: 0,
              fontFamily: "inherit",
              outline: "none"
            }}
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <div style={{ flex: "0 1 140px", minWidth: "120px" }}>
          <label
            htmlFor="status"
            style={{
              display: "block",
              fontSize: "13px",
              fontWeight: 600,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              color: "var(--admin-text-muted, #8a7060)",
              marginBottom: "3px",
              whiteSpace: "nowrap"
            }}
          >
            Status
          </label>
          <select
            id="status"
            value={status}
            onChange={(e) => {
              setPage(1);
              setStatus(e.target.value);
            }}
            style={{
              width: "100%",
              boxSizing: "border-box",
              padding: "6px 8px",
              borderRadius: "8px",
              border: "1px solid var(--admin-card-border, #e8e2d9)",
              background: "var(--admin-card-bg, #fff)",
              color: "var(--admin-text, #2c2420)",
              fontSize: "15px",
              minWidth: 0,
              fontFamily: "inherit",
              outline: "none"
            }}
          >
            <option value="">Active + Draft</option>
            <option value="ACTIVE">Active only</option>
            <option value="DRAFT">Draft only</option>
            <option value="ARCHIVED">Archived</option>
          </select>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          style={{
            padding: "7px 12px",
            borderRadius: "8px",
            border: "1px solid #1e3a2f",
            background: "linear-gradient(135deg, #1c352a, #2d5040)",
            color: "#fffbf5",
            fontSize: "15px",
            fontWeight: 600,
            cursor: "pointer",
            whiteSpace: "nowrap",
            flex: "0 0 auto",
            fontFamily: "inherit",
            boxShadow: "0 2px 6px rgba(28,53,42,0.18)"
          }}
        >
          Apply
        </button>
      </div>

      {savingOrder ? (
        <p style={{ fontSize: "13px", color: "var(--admin-text-muted, #8a7060)" }}>Saving order…</p>
      ) : (
        <p style={{ fontSize: "13px", color: "var(--admin-text-muted, #8a7060)" }}>{reorderHint}</p>
      )}

      {err ? (
        <p className="text-sm text-red-600 dark:text-red-400" role="alert">
          {err}
        </p>
      ) : null}

      <div
        ref={scrollRef}
        onDragOver={handleListDragOver}
        onDrop={(e) => void onDrop(e)}
        onDragLeave={(e) => {
          if (!scrollRef.current?.contains(e.relatedTarget as Node)) stopAutoScroll();
        }}
        className="overflow-x-auto overflow-y-auto rounded-lg border"
        style={{
          background: "var(--admin-card-bg, #fff)",
          boxShadow: "0 4px 20px rgba(28,53,42,0.08)",
          borderColor: "var(--admin-card-border, #e8e2d9)",
          maxHeight: FULL_LIST_MAX_H
        }}
      >
        <table className="min-w-full text-left text-sm">
          <thead className="sticky top-0 z-10 border-b border-[var(--admin-card-border,#e8e2d9)]" style={{ background: "var(--admin-table-head, linear-gradient(180deg,#f2ede5,#f9f7f4))" }}>
            <tr>
              <th className={`${thClass} w-10 px-2`} aria-label="Reorder" />
              <th className={thClass}>Image</th>
              <th className={thClass}>Product</th>
              <th className={thClass}>Category</th>
              <th className={thClass}>Sale price (from)</th>
              <th className={thClass}>Stock</th>
              <th className={thClass}>Status</th>
              <th className={`${thClass} text-right`}>Quick action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--admin-card-border,#f0ece6)]">
            {items.map((p, index) => {
              const isDragging = dragId === p.id;
              const showInsertBefore = canReorder && dropIndex === index && dragId !== p.id;
              return (
                <tr
                  key={p.id}
                  role="link"
                  tabIndex={0}
                  onClick={() => {
                    const href = `/admin/products/${p.id}`;
                    nav?.beginNavigation(href);
                    router.push(href);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      const href = `/admin/products/${p.id}`;
                      nav?.beginNavigation(href);
                      router.push(href);
                    }
                  }}
                  onDragOver={(e) => onRowDragOver(e, index)}
                  className={`relative transition-colors ${
                    isDragging
                      ? "bg-amber-50/80 shadow-md ring-1 ring-[#b98a3e]/40 dark:bg-amber-950/30"
                      : "cursor-pointer hover:bg-[var(--admin-row-hover,#faf5ec)]"
                  } ${isDragging ? "border-l-[3px] border-l-[#b98a3e]" : ""} ${
                    showInsertBefore ? "shadow-[inset_0_2px_0_0_#b98a3e]" : ""
                  }`}
                >
                  <td
                    className="w-10 px-1 py-2.5"
                    onClick={(e) => e.stopPropagation()}
                    onMouseDown={(e) => e.stopPropagation()}
                  >
                    <span
                      role="button"
                      tabIndex={canReorder ? 0 : -1}
                      draggable={canReorder}
                      title={canReorder ? "Drag to reorder" : undefined}
                      onDragStart={(e) => onHandleDragStart(e, p.id)}
                      onDragEnd={onDragEnd}
                      className={`inline-flex h-9 w-8 items-center justify-center rounded text-stone-300 transition-colors ${
                        canReorder
                          ? "cursor-grab text-stone-400 hover:text-[#b98a3e] active:cursor-grabbing"
                          : "cursor-not-allowed opacity-40"
                      }`}
                      aria-label="Drag to reorder"
                      aria-disabled={!canReorder}
                    >
                      <GripVertical className="h-5 w-5" strokeWidth={1.75} />
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="h-12 w-12 overflow-hidden rounded-md border border-[var(--admin-card-border,#e8e2d9)] bg-[var(--admin-input-bg,#f5f0e8)]">
                      {p.primaryImageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.primaryImageUrl} alt="" className="h-full w-full object-cover" />
                      ) : null}
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    <p className="font-semibold text-[var(--admin-text,#1c352a)]">{p.name}</p>
                    <p className="font-mono text-[11px] text-[#b98a3e]">{p.slug}</p>
                  </td>
                  <td className="max-w-[12rem] px-4 py-2.5 text-xs text-[var(--admin-text-muted,#6b5c52)]">
                    {p.categories.map((c) => c.name).join(", ") || "—"}
                  </td>
                  <td className="px-4 py-2.5 font-medium tabular-nums text-[var(--admin-text,#2c2420)]">
                    {formatINRFromPaise(p.fromPriceInPaise)}
                  </td>
                  <td className="px-4 py-2.5 tabular-nums text-[var(--admin-text,#2c2420)]">{p.totalOnHand}</td>
                  <td className="px-4 py-2.5">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold ${
                        p.status === "ACTIVE"
                          ? "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200/80 dark:bg-emerald-950/50 dark:text-emerald-300"
                          : "bg-amber-50 text-amber-900 ring-1 ring-amber-200/80 dark:bg-amber-950/40 dark:text-amber-200"
                      }`}
                    >
                      <span
                        className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                          p.status === "ACTIVE" ? "bg-emerald-500" : "bg-amber-500"
                        }`}
                        aria-hidden
                      />
                      {p.status}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      disabled={busyId === p.id}
                      onClick={(e) => void toggleStatus(p, e)}
                      style={{
                        border: "1px solid var(--admin-card-border, #e0d8ce)",
                        background: "var(--admin-card-bg, #fff)",
                        color: "var(--admin-text, #4a3f38)",
                        borderRadius: "8px",
                        padding: "4px 10px",
                        fontSize: "12px",
                        fontWeight: 600,
                        cursor: "pointer",
                        opacity: busyId === p.id ? 0.3 : 1
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = "#b98a3e";
                        e.currentTarget.style.background = "var(--admin-row-hover, #faf5ec)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = "var(--admin-card-border, #e0d8ce)";
                        e.currentTarget.style.background = "var(--admin-card-bg, #fff)";
                      }}
                    >
                      {busyId === p.id ? "…" : p.status === "ACTIVE" ? "Set draft" : "Set active"}
                    </button>
                  </td>
                </tr>
              );
            })}
            {canReorder && dropIndex === items.length && dragId ? (
              <tr className="pointer-events-none">
                <td colSpan={8} className="relative h-1 p-0">
                  <span className="absolute inset-x-2 top-0 h-0.5 bg-[#b98a3e]" />
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <p style={{ fontSize: "13px", color: "var(--admin-text-muted, #8a7060)" }}>
        Showing {items.length} of {pagination.total} products
        {pagination.total > items.length ? " (list capped at 2000)" : ""}
      </p>
    </div>
  );
}
