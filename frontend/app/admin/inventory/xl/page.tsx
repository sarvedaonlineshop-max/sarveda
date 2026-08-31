"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Download, Maximize2, Minimize2, Save } from "lucide-react";

import { AdminToast } from "@/components/admin/AdminToast";
import {
  fetchInventoryXlSheet,
  saveInventoryXlSheet,
  type InventoryXlSheetRow,
  type InventoryXlStockFilter
} from "@/lib/admin-api";
import {
  downloadCsvFile,
  downloadExcelXmlFile,
  inventorySheetToCsv,
  inventorySheetToExcelXml
} from "@/lib/admin-sheet-export";

type EditRow = {
  variantId: string;
  productId: string;
  productName: string;
  variantLabel: string;
  sku: string;
  onHand: string;
  reserved: number;
  available: number;
  lowStockThreshold: string;
  stockStatus: InventoryXlSheetRow["stockStatus"];
  productStatus: string;
};

function apiToEdit(r: InventoryXlSheetRow): EditRow {
  return {
    variantId: r.variantId,
    productId: r.productId,
    productName: r.productName,
    variantLabel: r.variantLabel,
    sku: r.sku,
    onHand: String(r.onHand ?? 0),
    reserved: r.reserved,
    available: r.available,
    lowStockThreshold: String(r.lowStockThreshold ?? 0),
    stockStatus: r.stockStatus,
    productStatus: r.productStatus
  };
}

const cellBorder = "1px solid #e3d9c8";

const stickyHead: React.CSSProperties = {
  position: "sticky",
  top: 0,
  zIndex: 3,
  background: "#1c352a",
  color: "#faf5ec",
  fontSize: "11px",
  fontWeight: 700,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  padding: "8px 6px",
  borderBottom: cellBorder,
  borderRight: cellBorder,
  whiteSpace: "nowrap",
  textAlign: "left"
};

const inputSt: React.CSSProperties = {
  width: "100%",
  minWidth: 0,
  border: "1px solid transparent",
  background: "transparent",
  padding: "6px 6px",
  fontSize: "12px",
  color: "var(--admin-text, #2c2420)",
  borderRadius: "4px",
  outline: "none",
  boxSizing: "border-box"
};

const numInput: React.CSSProperties = {
  ...inputSt,
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  textAlign: "right"
};

const tdSt: React.CSSProperties = {
  padding: 0,
  verticalAlign: "middle",
  borderRight: cellBorder,
  borderBottom: "1px solid #eee8e0"
};

function focusCell(e: React.FocusEvent<HTMLInputElement>) {
  e.currentTarget.style.borderColor = "rgba(185,138,62,0.55)";
  e.currentTarget.style.background = "rgba(185,138,62,0.08)";
}
function blurCell(e: React.FocusEvent<HTMLInputElement>) {
  e.currentTarget.style.borderColor = "transparent";
  e.currentTarget.style.background = "transparent";
}

function rowMatchesQuery(r: EditRow, q: string) {
  const blob = [r.productName, r.variantLabel, r.sku, r.stockStatus].join(" ").toLowerCase();
  return blob.includes(q);
}

function statusBadge(status: EditRow["stockStatus"]): { label: string; bg: string; color: string } {
  if (status === "out_of_stock") return { label: "Out of stock", bg: "#fef2f2", color: "#b91c1c" };
  if (status === "low_stock") return { label: "Low stock", bg: "#fffbeb", color: "#b45309" };
  return { label: "In stock", bg: "#ecfdf5", color: "#047857" };
}

function liveStockStatus(onHand: number, threshold: number): EditRow["stockStatus"] {
  if (onHand === 0) return "out_of_stock";
  if (onHand > threshold) return "in_stock";
  return "low_stock";
}

export default function InventoryXlSheetPage() {
  const [rows, setRows] = useState<EditRow[]>([]);
  const [baseline, setBaseline] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; error?: boolean } | null>(null);
  const [filterInput, setFilterInput] = useState("");
  const [filterApplied, setFilterApplied] = useState("");
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [stockFilter, setStockFilter] = useState<InventoryXlStockFilter>("ALL");
  const [counts, setCounts] = useState({ all: 0, in_stock: 0, low_stock: 0, out_of_stock: 0 });
  const [productCount, setProductCount] = useState(0);
  const [immersive, setImmersive] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement | null>(null);
  const exportRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const data = await fetchInventoryXlSheet({ stock: stockFilter });
      const mapped = data.rows.map(apiToEdit);
      setRows(mapped);
      setBaseline(JSON.stringify(mapped));
      setProductCount(data.productCount ?? 0);
      setCounts(data.counts ?? { all: 0, in_stock: 0, low_stock: 0, out_of_stock: 0 });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load sheet");
      setRows([]);
      setProductCount(0);
    } finally {
      setLoading(false);
    }
  }, [stockFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const dirty = useMemo(() => JSON.stringify(rows) !== baseline, [rows, baseline]);

  function changeStockFilter(next: InventoryXlStockFilter) {
    if (next === stockFilter) return;
    if (dirty) {
      const ok = window.confirm("You have unsaved edits. Switch filter and discard them?");
      if (!ok) return;
    }
    setStockFilter(next);
  }

  const suggestions = useMemo(() => {
    const q = filterInput.trim().toLowerCase();
    if (!q) return [] as string[];
    const names = new Set<string>();
    for (const r of rows) {
      if (rowMatchesQuery(r, q)) names.add(r.productName);
    }
    return Array.from(names)
      .sort((a, b) => a.localeCompare(b))
      .slice(0, 20);
  }, [rows, filterInput]);

  const filtered = useMemo(() => {
    const q = filterApplied.trim().toLowerCase();
    if (!q) return rows.map((r, i) => ({ r, i }));
    return rows.map((r, i) => ({ r, i })).filter(({ r }) => rowMatchesQuery(r, q));
  }, [rows, filterApplied]);

  useEffect(() => {
    const onDocClick = (event: MouseEvent) => {
      if (!searchRef.current?.contains(event.target as Node)) setSuggestionsOpen(false);
      if (!exportRef.current?.contains(event.target as Node)) setExportOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  useEffect(() => {
    if (!filterInput.trim()) {
      setSuggestionsOpen(false);
      return;
    }
    setSuggestionsOpen(true);
  }, [filterInput]);

  function applyFilter(term?: string) {
    const next = (term ?? filterInput).trim();
    setFilterApplied(next);
    setFilterInput(next);
    setSuggestionsOpen(false);
  }

  function clearFilter() {
    setFilterInput("");
    setFilterApplied("");
    setSuggestionsOpen(false);
  }

  function patchRow(index: number, patch: Partial<EditRow>) {
    setRows((prev) =>
      prev.map((row, i) => {
        if (i !== index) return row;
        const next = { ...row, ...patch };
        const onHand = parseInt(next.onHand.trim() || "0", 10);
        const thr = parseInt(next.lowStockThreshold.trim() || "0", 10);
        const oh = Number.isFinite(onHand) ? Math.max(0, onHand) : 0;
        const th = Number.isFinite(thr) ? Math.max(0, thr) : 0;
        return {
          ...next,
          available: Math.max(0, oh - next.reserved),
          stockStatus: liveStockStatus(oh, th)
        };
      })
    );
  }

  const onSave = useCallback(async () => {
    if (!dirty || saving) return;
    setSaving(true);
    setErr(null);
    try {
      const payload = rows.map((r, idx) => {
        const label = r.sku || `row ${idx + 1}`;
        const onHand = parseInt(r.onHand.trim() || "0", 10);
        const lowStockThreshold = parseInt(r.lowStockThreshold.trim() || "0", 10);
        if (!Number.isFinite(onHand) || onHand < 0) throw new Error(`Invalid on hand for ${label}`);
        if (!Number.isFinite(lowStockThreshold) || lowStockThreshold < 0) {
          throw new Error(`Invalid threshold for ${label}`);
        }
        if (onHand < r.reserved) {
          throw new Error(`On hand cannot be below reserved (${r.reserved}) for ${label}`);
        }
        return { variantId: r.variantId, onHand, lowStockThreshold };
      });

      const result = await saveInventoryXlSheet(payload);
      const errCount = result.errors?.length ?? 0;
      if (errCount > 0) {
        setToast({
          message: `Saved with ${errCount} row error(s). Updated ${result.updated} row(s).`,
          error: true
        });
        setErr(result.errors.map((e) => `${e.sku || e.variantId}: ${e.error}`).slice(0, 8).join(" · "));
      } else {
        setToast({ message: `Saved. ${result.updated} inventory row(s) updated.` });
      }
      await load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Save failed";
      setErr(msg);
      setToast({ message: msg, error: true });
    } finally {
      setSaving(false);
    }
  }, [dirty, saving, rows, load]);

  function exportRows(format: "csv" | "xls") {
    const stamp = new Date().toISOString().slice(0, 10);
    const payload = filtered.map(({ r }) => {
      const onHand = parseInt(r.onHand.trim() || "0", 10) || 0;
      const thr = parseInt(r.lowStockThreshold.trim() || "0", 10) || 0;
      return {
        sku: r.sku,
        productName: r.productName,
        variantLabel: r.variantLabel,
        onHand,
        reserved: r.reserved,
        available: Math.max(0, onHand - r.reserved),
        lowStockThreshold: thr,
        stockStatus: r.stockStatus
      };
    });
    if (format === "csv") {
      downloadCsvFile(`sarveda-inventory-${stamp}.csv`, inventorySheetToCsv(payload));
    } else {
      downloadExcelXmlFile(`sarveda-inventory-${stamp}.xls`, inventorySheetToExcelXml(payload));
    }
    setExportOpen(false);
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void onSave();
        return;
      }
      if (e.key === "F11" || e.key === "F12") {
        e.preventDefault();
        setImmersive((v) => !v);
        return;
      }
      if (e.key === "Escape" && immersive) {
        e.preventDefault();
        setImmersive(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onSave, immersive]);

  const shellBtn: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    padding: "8px 14px",
    borderRadius: "8px",
    background: "rgba(255,255,255,0.12)",
    color: "#faf5ec",
    border: "1px solid rgba(255,255,255,0.2)",
    fontSize: "13px",
    fontWeight: 600,
    textDecoration: "none",
    cursor: "pointer"
  };

  const filterTabs: Array<{ id: InventoryXlStockFilter; label: string; count: number }> = [
    { id: "ALL", label: "All", count: counts.all },
    { id: "IN_STOCK", label: "In stock", count: counts.in_stock },
    { id: "LOW_STOCK", label: "Low stock", count: counts.low_stock },
    { id: "OUT_OF_STOCK", label: "Out of stock", count: counts.out_of_stock }
  ];

  return (
    <div
      className="font-sans"
      style={{
        ...(immersive
          ? {
              position: "fixed",
              inset: 0,
              zIndex: 2000,
              margin: 0,
              height: "100vh",
              width: "100vw"
            }
          : {
              margin: "-24px -32px -48px",
              height: "calc(100vh - 72px)"
            }),
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        background: "var(--admin-page-bg, #f4f1ec)"
      }}
    >
      <AdminToast toast={toast} onDismiss={() => setToast(null)} />

      <div
        style={{
          flexShrink: 0,
          background: "linear-gradient(135deg, #1c352a 0%, #2d5040 100%)",
          padding: "14px 20px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "12px",
          borderBottom: "1px solid rgba(255,255,255,0.08)"
        }}
      >
        <div className="flex flex-wrap items-center gap-3">
          <Link href="/admin/inventory" style={shellBtn}>
            <ArrowLeft size={14} aria-hidden />
            Back To List View
          </Link>
          <h1 style={{ color: "#faf5ec", fontSize: "20px", fontWeight: 800, margin: 0 }}>
            Inventory XL View
          </h1>
          {immersive ? (
            <span style={{ fontSize: "11px", color: "#a8c4b0" }}>Fullscreen · Esc to exit</span>
          ) : (
            <span style={{ fontSize: "11px", color: "#a8c4b0" }}>F12 fullscreen</span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative" ref={exportRef}>
            <button type="button" style={shellBtn} onClick={() => setExportOpen((o) => !o)}>
              <Download size={14} aria-hidden />
              Export
            </button>
            {exportOpen ? (
              <div
                className="absolute right-0 z-30 mt-1 min-w-[140px] overflow-hidden rounded-lg border border-stone-200 bg-white py-1 shadow-lg"
              >
                <button
                  type="button"
                  className="block w-full px-3 py-2 text-left text-sm text-stone-800 hover:bg-[#faf5ec]"
                  onClick={() => exportRows("csv")}
                >
                  CSV
                </button>
                <button
                  type="button"
                  className="block w-full px-3 py-2 text-left text-sm text-stone-800 hover:bg-[#faf5ec]"
                  onClick={() => exportRows("xls")}
                >
                  Excel (XL)
                </button>
              </div>
            ) : null}
          </div>
          <button type="button" style={shellBtn} onClick={() => setImmersive((v) => !v)}>
            {immersive ? <Minimize2 size={14} aria-hidden /> : <Maximize2 size={14} aria-hidden />}
            {immersive ? "Exit full" : "Fullscreen"}
          </button>
          <button
            type="button"
            disabled={!dirty || saving || loading}
            onClick={() => void onSave()}
            style={{
              ...shellBtn,
              background: dirty ? "linear-gradient(135deg, #b98a3e, #c8960a)" : "rgba(255,255,255,0.12)",
              border: dirty ? "none" : shellBtn.border,
              opacity: !dirty || saving || loading ? 0.55 : 1,
              cursor: !dirty || saving || loading ? "not-allowed" : "pointer"
            }}
          >
            <Save size={14} aria-hidden />
            {saving ? "Saving…" : dirty ? "Save changes" : "Saved"}
          </button>
        </div>
      </div>

      <div
        style={{
          flexShrink: 0,
          padding: "10px 20px",
          display: "flex",
          flexWrap: "wrap",
          gap: "10px",
          alignItems: "center",
          borderBottom: "1px solid #e8e2d9",
          background: "var(--admin-card-bg, #faf9f7)"
        }}
      >
        <div className="flex flex-wrap gap-1.5">
          {filterTabs.map((tab) => {
            const active = stockFilter === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => changeStockFilter(tab.id)}
                style={{
                  padding: "7px 12px",
                  borderRadius: "999px",
                  border: active ? "1px solid #b98a3e" : "1px solid #e0d8ce",
                  background: active ? "rgba(185,138,62,0.12)" : "#fff",
                  color: active ? "#8a5a12" : "#2c2420",
                  fontSize: "12px",
                  fontWeight: 700,
                  cursor: "pointer"
                }}
              >
                {tab.label} ({tab.count})
              </button>
            );
          })}
        </div>

        <div className="relative min-w-[220px] flex-1" ref={searchRef}>
          <input
            value={filterInput}
            onChange={(e) => setFilterInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") applyFilter();
            }}
            placeholder="Search product, SKU, variant…"
            style={{
              width: "100%",
              border: "1px solid #e0d8ce",
              borderRadius: "8px",
              padding: "8px 12px",
              fontSize: "13px",
              background: "#fff"
            }}
          />
          {suggestionsOpen && suggestions.length > 0 ? (
            <div className="absolute left-0 right-0 z-20 mt-1 max-h-56 overflow-auto rounded-lg border border-stone-200 bg-white shadow-lg">
              {suggestions.map((name) => (
                <button
                  key={name}
                  type="button"
                  className="block w-full px-3 py-2 text-left text-sm hover:bg-[#faf5ec]"
                  onClick={() => applyFilter(name)}
                >
                  {name}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => applyFilter()}
          style={{
            padding: "8px 14px",
            borderRadius: "8px",
            border: "1px solid #e0d8ce",
            background: "#fff",
            fontSize: "13px",
            fontWeight: 600,
            cursor: "pointer"
          }}
        >
          Search
        </button>
        {filterApplied ? (
          <button
            type="button"
            onClick={clearFilter}
            style={{
              padding: "8px 12px",
              borderRadius: "8px",
              border: "none",
              background: "transparent",
              fontSize: "12px",
              color: "#8a7060",
              cursor: "pointer"
            }}
          >
            Clear
          </button>
        ) : null}
        <span style={{ fontSize: "12px", color: "#8a7060" }}>
          {loading
            ? "Loading…"
            : `${filtered.length} row${filtered.length === 1 ? "" : "s"} · ${productCount} product${productCount === 1 ? "" : "s"}`}
          {dirty ? " · unsaved" : ""}
        </span>
      </div>

      {err ? (
        <div style={{ padding: "8px 20px", color: "#b91c1c", fontSize: "13px", flexShrink: 0 }}>{err}</div>
      ) : null}

      <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, minWidth: 980 }}>
          <thead>
            <tr>
              <th style={{ ...stickyHead, minWidth: 220 }}>Product</th>
              <th style={{ ...stickyHead, minWidth: 180 }}>Variant</th>
              <th style={{ ...stickyHead, minWidth: 120 }}>SKU</th>
              <th style={{ ...stickyHead, minWidth: 90, textAlign: "right" }}>On hand</th>
              <th style={{ ...stickyHead, minWidth: 80, textAlign: "right" }}>Reserved</th>
              <th style={{ ...stickyHead, minWidth: 80, textAlign: "right" }}>Available</th>
              <th style={{ ...stickyHead, minWidth: 100, textAlign: "right" }}>Low threshold</th>
              <th style={{ ...stickyHead, minWidth: 110 }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} style={{ padding: "24px", textAlign: "center", color: "#8a7060" }}>
                  Loading inventory…
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ padding: "24px", textAlign: "center", color: "#8a7060" }}>
                  No rows match this filter.
                </td>
              </tr>
            ) : (
              filtered.map(({ r, i }) => {
                const badge = statusBadge(r.stockStatus);
                return (
                  <tr key={r.variantId} style={{ background: i % 2 === 0 ? "#fff" : "#fbfaf8" }}>
                    <td style={{ ...tdSt, padding: "8px 6px", fontSize: "12px", fontWeight: 600 }}>
                      {r.productName}
                    </td>
                    <td style={{ ...tdSt, padding: "8px 6px", fontSize: "12px", color: "#5c534c" }}>
                      {r.variantLabel}
                    </td>
                    <td
                      style={{
                        ...tdSt,
                        padding: "8px 6px",
                        fontSize: "12px",
                        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace"
                      }}
                    >
                      {r.sku}
                    </td>
                    <td style={tdSt}>
                      <input
                        value={r.onHand}
                        onChange={(e) => patchRow(i, { onHand: e.target.value })}
                        onFocus={focusCell}
                        onBlur={blurCell}
                        inputMode="numeric"
                        style={numInput}
                        aria-label={`On hand ${r.sku}`}
                      />
                    </td>
                    <td
                      style={{
                        ...tdSt,
                        padding: "8px 6px",
                        textAlign: "right",
                        fontSize: "12px",
                        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                        color: "#8a7060"
                      }}
                    >
                      {r.reserved}
                    </td>
                    <td
                      style={{
                        ...tdSt,
                        padding: "8px 6px",
                        textAlign: "right",
                        fontSize: "12px",
                        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                        fontWeight: 700
                      }}
                    >
                      {r.available}
                    </td>
                    <td style={tdSt}>
                      <input
                        value={r.lowStockThreshold}
                        onChange={(e) => patchRow(i, { lowStockThreshold: e.target.value })}
                        onFocus={focusCell}
                        onBlur={blurCell}
                        inputMode="numeric"
                        style={numInput}
                        aria-label={`Low stock threshold ${r.sku}`}
                      />
                    </td>
                    <td style={{ ...tdSt, padding: "6px" }}>
                      <span
                        style={{
                          display: "inline-block",
                          borderRadius: "999px",
                          padding: "3px 8px",
                          fontSize: "11px",
                          fontWeight: 700,
                          background: badge.bg,
                          color: badge.color
                        }}
                      >
                        {badge.label}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
