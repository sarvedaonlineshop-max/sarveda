"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Download, Maximize2, Minimize2, Save } from "lucide-react";

import { AdminToast } from "@/components/admin/AdminToast";
import {
  fetchProductsXlSheet,
  saveProductsXlSheet,
  type XlSheetRow
} from "@/lib/admin-api";
import {
  downloadCsvFile,
  downloadExcelXmlFile,
  productsSheetToCsv,
  productsSheetToExcelXml
} from "@/lib/admin-sheet-export";
import { TAX_CLASS_OPTIONS, taxClassForForm } from "@/lib/tax-classes";

/** Editable row: money as major-unit strings for spreadsheet UX. */
type EditRow = {
  productId: string;
  variantId: string;
  productName: string;
  variantName: string;
  sku: string;
  qty: string;
  mrp: string;
  sale: string;
  mrpUsd: string;
  saleUsd: string;
  mrpAed: string;
  saleAed: string;
  mrpGbp: string;
  saleGbp: string;
  hsnCode: string;
  taxClass: string;
  productStatus: string;
  variantStatus: string;
};

function minorToMajorStr(minor: number | null | undefined): string {
  if (minor == null) return "";
  const n = minor / 100;
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
}

function majorStrToMinor(raw: string): number | null {
  const t = raw.trim().replace(/,/g, "");
  if (!t) return null;
  const n = parseFloat(t);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

function majorStrToMinorRequired(raw: string, label: string): number {
  const v = majorStrToMinor(raw);
  if (v == null) throw new Error(`${label} is required`);
  return v;
}

function apiToEdit(r: XlSheetRow): EditRow {
  return {
    productId: r.productId,
    variantId: r.variantId,
    productName: r.productName,
    variantName: r.variantName,
    sku: r.sku,
    qty: String(r.qty ?? 0),
    mrp: minorToMajorStr(r.mrpInPaise),
    sale: minorToMajorStr(r.saleInPaise),
    mrpUsd: minorToMajorStr(r.mrpUsdCents),
    saleUsd: minorToMajorStr(r.saleUsdCents),
    mrpAed: minorToMajorStr(r.mrpAedFils),
    saleAed: minorToMajorStr(r.saleAedFils),
    mrpGbp: minorToMajorStr(r.mrpGbpPence),
    saleGbp: minorToMajorStr(r.saleGbpPence),
    hsnCode: r.hsnCode || "",
    taxClass: taxClassForForm(r.taxClass || "standard"),
    productStatus: r.productStatus,
    variantStatus: r.variantStatus
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

const stickySub: React.CSSProperties = {
  ...stickyHead,
  top: 28,
  zIndex: 2,
  background: "#2d5040",
  fontSize: "10px",
  fontWeight: 600,
  letterSpacing: "0.03em",
  textTransform: "none",
  padding: "6px"
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
  fontSize: "12px",
  textAlign: "right"
};

const tdSt: React.CSSProperties = {
  padding: 0,
  verticalAlign: "middle",
  borderRight: cellBorder,
  borderBottom: "1px solid #eee8e0"
};

function focusMoney(e: React.FocusEvent<HTMLInputElement>) {
  e.currentTarget.style.borderColor = "rgba(185,138,62,0.55)";
  e.currentTarget.style.background = "rgba(185,138,62,0.08)";
}
function blurMoney(e: React.FocusEvent<HTMLInputElement>) {
  e.currentTarget.style.borderColor = "transparent";
  e.currentTarget.style.background = "transparent";
}

const COL_COUNT = 15;

type StatusFilter = "ACTIVE" | "DRAFT" | "ALL";

function rowMatchesQuery(r: EditRow, q: string) {
  const gstLabel =
    TAX_CLASS_OPTIONS.find((o) => o.value === r.taxClass)?.label ?? r.taxClass;
  const blob = [r.productName, r.variantName, r.sku, r.hsnCode, gstLabel]
    .join(" ")
    .toLowerCase();
  return blob.includes(q);
}

export default function ProductsXlSheetPage() {
  const [rows, setRows] = useState<EditRow[]>([]);
  const [baseline, setBaseline] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; error?: boolean } | null>(null);
  const [filterInput, setFilterInput] = useState("");
  const [filterApplied, setFilterApplied] = useState("");
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ACTIVE");
  const [productCount, setProductCount] = useState(0);
  const [immersive, setImmersive] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement | null>(null);
  const exportRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const data = await fetchProductsXlSheet({ status: statusFilter });
      const mapped = data.rows.map(apiToEdit);
      setRows(mapped);
      setBaseline(JSON.stringify(mapped));
      setProductCount(data.productCount ?? 0);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load sheet");
      setRows([]);
      setProductCount(0);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const dirty = useMemo(() => JSON.stringify(rows) !== baseline, [rows, baseline]);

  function changeStatusFilter(next: StatusFilter) {
    if (next === statusFilter) return;
    if (dirty) {
      const ok = window.confirm("You have unsaved edits. Switch status filter and discard them?");
      if (!ok) return;
    }
    setStatusFilter(next);
  }

  const suggestions = useMemo(() => {
    const q = filterInput.trim().toLowerCase();
    if (!q) return [] as string[];
    const names = new Set<string>();
    for (const r of rows) {
      if (rowMatchesQuery(r, q)) names.add(r.productName);
    }
    return Array.from(names).sort((a, b) => a.localeCompare(b)).slice(0, 20);
  }, [rows, filterInput]);

  const filtered = useMemo(() => {
    const q = filterApplied.trim().toLowerCase();
    if (!q) return rows.map((r, i) => ({ r, i }));
    return rows
      .map((r, i) => ({ r, i }))
      .filter(({ r }) => rowMatchesQuery(r, q));
  }, [rows, filterApplied]);

  useEffect(() => {
    const onDocClick = (event: MouseEvent) => {
      if (!searchRef.current?.contains(event.target as Node)) {
        setSuggestionsOpen(false);
      }
      if (!exportRef.current?.contains(event.target as Node)) {
        setExportOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  useEffect(() => {
    const q = filterInput.trim();
    if (!q) {
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

  function clearFilterInput() {
    setFilterInput("");
    setSuggestionsOpen(false);
  }

  function patchRow(index: number, patch: Partial<EditRow>) {
    setRows((prev) => {
      const next = prev.map((row, i) => (i === index ? { ...row, ...patch } : row));
      const cur = next[index];
      if (!cur) return prev;

      if (patch.productName !== undefined || patch.hsnCode !== undefined || patch.taxClass !== undefined) {
        return next.map((row) => {
          if (row.productId !== cur.productId) return row;
          return {
            ...row,
            ...(patch.productName !== undefined ? { productName: patch.productName } : {}),
            ...(patch.hsnCode !== undefined ? { hsnCode: patch.hsnCode ?? "" } : {}),
            ...(patch.taxClass !== undefined ? { taxClass: patch.taxClass } : {})
          };
        });
      }
      return next;
    });
  }

  const onSave = useCallback(async () => {
    if (!dirty || saving) return;
    setSaving(true);
    setErr(null);
    try {
      const payload = rows.map((r, idx) => {
        const rowLabel = r.sku || `row ${idx + 1}`;
        const qty = parseInt(r.qty.trim() || "0", 10);
        if (!Number.isFinite(qty) || qty < 0) {
          throw new Error(`Invalid qty for ${rowLabel}`);
        }
        if (!r.productName.trim()) throw new Error(`Product name empty (${rowLabel})`);
        if (!r.sku.trim()) throw new Error(`SKU empty at row ${idx + 1}`);
        return {
          productId: r.productId,
          variantId: r.variantId,
          productName: r.productName.trim(),
          variantName: r.variantName.trim(),
          sku: r.sku.trim(),
          qty,
          costInPaise: null,
          mrpInPaise: majorStrToMinorRequired(r.mrp, `MRP (${rowLabel})`),
          saleInPaise: majorStrToMinorRequired(r.sale, `Sale (${rowLabel})`),
          mrpUsdCents: majorStrToMinor(r.mrpUsd),
          saleUsdCents: majorStrToMinor(r.saleUsd),
          mrpAedFils: majorStrToMinor(r.mrpAed),
          saleAedFils: majorStrToMinor(r.saleAed),
          mrpGbpPence: majorStrToMinor(r.mrpGbp),
          saleGbpPence: majorStrToMinor(r.saleGbp),
          hsnCode: r.hsnCode.trim() || null,
          taxClass: taxClassForForm(r.taxClass)
        };
      });

      const result = await saveProductsXlSheet(payload);
      const errCount = result.errors?.length ?? 0;
      if (errCount > 0) {
        setToast({
          message: `Saved with ${errCount} row error(s). Products: ${result.updatedProducts}, variants: ${result.updatedVariants}.`,
          error: true
        });
        setErr(result.errors.map((e) => `${e.sku}: ${e.error}`).slice(0, 8).join(" · "));
      } else {
        setToast({
          message: `Saved. ${result.updatedProducts} product(s), ${result.updatedVariants} variant(s) updated (live catalog + prices).`
        });
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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void onSave();
        return;
      }
      // F11 / F12 → immersive XL (avoid fighting browser DevTools when possible)
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
          <Link href="/admin/products" style={shellBtn}>
            <ArrowLeft size={14} aria-hidden />
            Back To List View
          </Link>
          <h1 style={{ color: "#faf5ec", fontSize: "20px", fontWeight: 800, margin: 0 }}>
            Products XL View
          </h1>
          {immersive ? (
            <span style={{ fontSize: "11px", color: "#a8c4b0" }}>Fullscreen · Esc to exit</span>
          ) : (
            <span style={{ fontSize: "11px", color: "#a8c4b0" }}>F12 fullscreen</span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label
            htmlFor="xl-status"
            style={{ fontSize: "11px", fontWeight: 700, color: "#a8c4b0", letterSpacing: "0.04em" }}
          >
            STATUS
          </label>
          <select
            id="xl-status"
            value={statusFilter}
            onChange={(e) => changeStatusFilter(e.target.value as StatusFilter)}
            style={{
              border: "1px solid rgba(255,255,255,0.2)",
              borderRadius: "8px",
              padding: "8px 12px",
              fontSize: "13px",
              background: "rgba(0,0,0,0.2)",
              color: "#faf5ec",
              minWidth: "9.5rem"
            }}
          >
            <option value="ACTIVE">Active only</option>
            <option value="DRAFT">Draft only</option>
            <option value="ALL">Active + Draft</option>
          </select>
          <div ref={searchRef} className="relative" style={{ width: "min(22rem, 42vw)" }}>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                applyFilter();
              }}
            >
              <input
                value={filterInput}
                onChange={(e) => setFilterInput(e.target.value)}
                onFocus={() => {
                  if (filterInput.trim()) setSuggestionsOpen(true);
                }}
                placeholder="Search name / SKU — Enter to filter"
                autoComplete="off"
                style={{
                  width: "100%",
                  border: "1px solid rgba(255,255,255,0.2)",
                  borderRadius: "999px",
                  padding: "8px 36px 8px 14px",
                  fontSize: "13px",
                  background: "rgba(0,0,0,0.2)",
                  color: "#faf5ec"
                }}
              />
            </form>
            {filterInput ? (
              <button
                type="button"
                onClick={clearFilterInput}
                style={{
                  position: "absolute",
                  right: "10px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  color: "#a8c4b0",
                  background: "none",
                  border: "none",
                  fontSize: "18px",
                  cursor: "pointer"
                }}
                aria-label="Clear search"
              >
                ×
              </button>
            ) : null}
            {suggestionsOpen && filterInput.trim() ? (
              <ul
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  top: "calc(100% + 6px)",
                  zIndex: 40,
                  maxHeight: "20rem",
                  overflowY: "auto",
                  borderRadius: "12px",
                  border: "1px solid #e3d9c8",
                  background: "#fff",
                  padding: "4px 0",
                  boxShadow: "0 12px 28px rgba(0,0,0,0.18)",
                  listStyle: "none",
                  margin: 0
                }}
              >
                {suggestions.length > 0 ? (
                  suggestions.map((name) => (
                    <li key={name}>
                      <button
                        type="button"
                        onClick={() => applyFilter(name)}
                        style={{
                          width: "100%",
                          textAlign: "left",
                          padding: "10px 14px",
                          fontSize: "13px",
                          color: "#2c2420",
                          background: "transparent",
                          border: "none",
                          cursor: "pointer"
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = "#faf5ec";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = "transparent";
                        }}
                      >
                        {name}
                      </button>
                    </li>
                  ))
                ) : (
                  <li style={{ padding: "10px 14px", fontSize: "13px", color: "#8a7060" }}>
                    No matching products
                  </li>
                )}
              </ul>
            ) : null}
          </div>
          <span style={{ fontSize: "12px", color: "#a8c4b0", minWidth: "9rem" }}>
            {loading
              ? "Loading…"
              : `${productCount} product${productCount === 1 ? "" : "s"} · ${filtered.length}/${rows.length} rows`}
            {dirty ? " · unsaved" : ""}
          </span>
          <div className="relative" ref={exportRef}>
            <button type="button" style={shellBtn} onClick={() => setExportOpen((o) => !o)}>
              <Download size={14} aria-hidden />
              Export
            </button>
            {exportOpen ? (
              <div className="absolute right-0 z-30 mt-1 min-w-[140px] overflow-hidden rounded-lg border border-stone-200 bg-white py-1 shadow-lg">
                <button
                  type="button"
                  className="block w-full px-3 py-2 text-left text-sm text-stone-800 hover:bg-[#faf5ec]"
                  onClick={() => {
                    const stamp = new Date().toISOString().slice(0, 10);
                    const payload = filtered.map(({ r }) => ({
                      productName: r.productName,
                      variantName: r.variantName,
                      sku: r.sku,
                      qty: parseInt(r.qty.trim() || "0", 10) || 0,
                      mrpInPaise: majorStrToMinor(r.mrp) ?? 0,
                      saleInPaise: majorStrToMinor(r.sale) ?? 0,
                      mrpUsdCents: majorStrToMinor(r.mrpUsd),
                      saleUsdCents: majorStrToMinor(r.saleUsd),
                      mrpGbpPence: majorStrToMinor(r.mrpGbp),
                      saleGbpPence: majorStrToMinor(r.saleGbp),
                      hsnCode: r.hsnCode,
                      gstPercent:
                        r.taxClass === "gst-zero-rate"
                          ? 0
                          : r.taxClass === "gst-5"
                            ? 5
                            : r.taxClass === "gst12"
                              ? 12
                              : 18,
                      productStatus: r.productStatus,
                      variantStatus: r.variantStatus
                    }));
                    downloadCsvFile(`sarveda-products-${stamp}.csv`, productsSheetToCsv(payload));
                    setExportOpen(false);
                  }}
                >
                  CSV
                </button>
                <button
                  type="button"
                  className="block w-full px-3 py-2 text-left text-sm text-stone-800 hover:bg-[#faf5ec]"
                  onClick={() => {
                    const stamp = new Date().toISOString().slice(0, 10);
                    const payload = filtered.map(({ r }) => ({
                      productName: r.productName,
                      variantName: r.variantName,
                      sku: r.sku,
                      qty: parseInt(r.qty.trim() || "0", 10) || 0,
                      mrpInPaise: majorStrToMinor(r.mrp) ?? 0,
                      saleInPaise: majorStrToMinor(r.sale) ?? 0,
                      mrpUsdCents: majorStrToMinor(r.mrpUsd),
                      saleUsdCents: majorStrToMinor(r.saleUsd),
                      mrpGbpPence: majorStrToMinor(r.mrpGbp),
                      saleGbpPence: majorStrToMinor(r.saleGbp),
                      hsnCode: r.hsnCode,
                      gstPercent:
                        r.taxClass === "gst-zero-rate"
                          ? 0
                          : r.taxClass === "gst-5"
                            ? 5
                            : r.taxClass === "gst12"
                              ? 12
                              : 18,
                      productStatus: r.productStatus,
                      variantStatus: r.variantStatus
                    }));
                    downloadExcelXmlFile(
                      `sarveda-products-${stamp}.xls`,
                      productsSheetToExcelXml(payload)
                    );
                    setExportOpen(false);
                  }}
                >
                  Excel (XL)
                </button>
              </div>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => setImmersive((v) => !v)}
            style={shellBtn}
            title={immersive ? "Exit fullscreen (Esc)" : "Fullscreen (F12)"}
          >
            {immersive ? <Minimize2 size={14} aria-hidden /> : <Maximize2 size={14} aria-hidden />}
            {immersive ? "Exit full" : "Fullscreen"}
          </button>
          <button
            type="button"
            onClick={() => void onSave()}
            disabled={!dirty || saving || loading}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              background: dirty
                ? "linear-gradient(135deg, #b98a3e, #c8960a)"
                : "rgba(255,255,255,0.15)",
              color: "#fff",
              fontWeight: 700,
              borderRadius: "10px",
              padding: "9px 16px",
              fontSize: "13px",
              border: "none",
              cursor: !dirty || saving ? "not-allowed" : "pointer",
              opacity: !dirty || saving ? 0.65 : 1
            }}
          >
            <Save size={14} aria-hidden />
            {saving ? "Saving…" : dirty ? "Save (Ctrl+S)" : "No changes"}
          </button>
        </div>
      </div>

      {err ? (
        <div
          style={{
            flexShrink: 0,
            padding: "10px 16px",
            background: "#fde8e8",
            color: "#9b2c2c",
            fontSize: "13px"
          }}
        >
          {err}
        </div>
      ) : null}

      {filterApplied ? (
        <div
          style={{
            flexShrink: 0,
            padding: "8px 16px",
            background: "#faf5ec",
            borderBottom: "1px solid #e3d9c8",
            display: "flex",
            alignItems: "center",
            gap: "8px",
            fontSize: "13px",
            color: "#4a3f38"
          }}
        >
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              border: "1px solid #d8cdbd",
              borderRadius: "8px",
              padding: "4px 10px",
              background: "#fff"
            }}
          >
            Search: <strong>{filterApplied}</strong>
            <button
              type="button"
              onClick={clearFilter}
              style={{ border: "none", background: "none", cursor: "pointer", fontSize: "16px", color: "#8a7060" }}
              aria-label="Remove filter"
            >
              ×
            </button>
          </span>
          <span>{filtered.length} result{filtered.length === 1 ? "" : "s"}</span>
        </div>
      ) : null}

      <div style={{ flex: 1, minHeight: 0, overflow: "auto", background: "#fff" }}>
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            minWidth: "1200px",
            tableLayout: "fixed",
            border: cellBorder
          }}
        >
          <colgroup>
            <col style={{ width: "150px" }} />
            <col style={{ width: "130px" }} />
            <col style={{ width: "110px" }} />
            <col style={{ width: "64px" }} />
            <col style={{ width: "72px" }} />
            <col style={{ width: "80px" }} />
            <col style={{ width: "80px" }} />
            <col style={{ width: "72px" }} />
            <col style={{ width: "72px" }} />
            <col style={{ width: "72px" }} />
            <col style={{ width: "72px" }} />
            <col style={{ width: "72px" }} />
            <col style={{ width: "72px" }} />
            <col style={{ width: "80px" }} />
            <col style={{ width: "88px" }} />
          </colgroup>
          <thead>
            <tr>
              <th style={stickyHead} rowSpan={2}>
                Name
              </th>
              <th style={stickyHead} rowSpan={2}>
                Variant Name
              </th>
              <th style={stickyHead} rowSpan={2}>
                SKU
              </th>
              <th style={stickyHead} rowSpan={2}>
                Qty
              </th>
              <th style={stickyHead} rowSpan={2}>
                Var
              </th>
              <th style={{ ...stickyHead, textAlign: "center" }} colSpan={2}>
                India Rupees (INR)
              </th>
              <th style={{ ...stickyHead, textAlign: "center" }} colSpan={2}>
                USD
              </th>
              <th style={{ ...stickyHead, textAlign: "center" }} colSpan={2}>
                Dinar (AED)
              </th>
              <th style={{ ...stickyHead, textAlign: "center" }} colSpan={2}>
                GBP
              </th>
              <th style={stickyHead} rowSpan={2}>
                HSN
              </th>
              <th style={{ ...stickyHead, borderRight: "none" }} rowSpan={2}>
                GST %
              </th>
            </tr>
            <tr>
              <th style={stickySub}>MRP</th>
              <th style={stickySub}>Sale</th>
              <th style={stickySub}>MRP</th>
              <th style={stickySub}>Sale</th>
              <th style={stickySub}>MRP</th>
              <th style={stickySub}>Sale</th>
              <th style={stickySub}>MRP</th>
              <th style={stickySub}>Sale</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={COL_COUNT} style={{ padding: "24px", color: "#8a7060" }}>
                  Loading catalog sheet…
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={COL_COUNT} style={{ padding: "24px", color: "#8a7060" }}>
                  {statusFilter === "DRAFT"
                    ? "No draft products in the shop catalog (Caxixi / Wooden Xylophone appear when they are DRAFT)."
                    : "No rows."}
                </td>
              </tr>
            ) : (
              filtered.map(({ r, i }) => {
                const isFirstOfProduct = i === 0 || rows[i - 1]?.productId !== r.productId;
                const showNameEditor = isFirstOfProduct || filterApplied.trim().length > 0;
                return (
                  <tr
                    key={r.variantId}
                    style={{
                      background: isFirstOfProduct ? "rgba(185,138,62,0.05)" : "#fff"
                    }}
                  >
                    <td style={tdSt}>
                      {showNameEditor ? (
                        <input
                          style={{ ...inputSt, fontWeight: 600 }}
                          value={r.productName}
                          onChange={(e) => patchRow(i, { productName: e.target.value })}
                          onFocus={focusMoney}
                          onBlur={blurMoney}
                          aria-label="Product name"
                        />
                      ) : (
                        <div style={{ padding: "6px", minHeight: "30px" }} />
                      )}
                    </td>
                    <td style={tdSt}>
                      <input
                        style={inputSt}
                        value={r.variantName}
                        onChange={(e) => patchRow(i, { variantName: e.target.value })}
                        onFocus={focusMoney}
                        onBlur={blurMoney}
                        aria-label="Variant name"
                      />
                    </td>
                    <td style={tdSt}>
                      <input
                        style={{ ...numInput, textAlign: "left" }}
                        value={r.sku}
                        onChange={(e) => patchRow(i, { sku: e.target.value })}
                        onFocus={focusMoney}
                        onBlur={blurMoney}
                        aria-label="SKU"
                      />
                    </td>
                    <td style={tdSt}>
                      <input
                        style={numInput}
                        inputMode="numeric"
                        value={r.qty}
                        onChange={(e) => patchRow(i, { qty: e.target.value.replace(/[^\d]/g, "") })}
                        onFocus={focusMoney}
                        onBlur={blurMoney}
                        aria-label="Qty"
                      />
                    </td>
                    <td style={tdSt}>
                      <span
                        style={{
                          display: "inline-block",
                          margin: "4px 6px",
                          padding: "2px 7px",
                          borderRadius: "6px",
                          fontSize: "10px",
                          fontWeight: 700,
                          background: r.variantStatus === "ACTIVE" ? "#dcfce7" : "#f3f4f6",
                          color: r.variantStatus === "ACTIVE" ? "#166534" : "#4b5563"
                        }}
                      >
                        {r.variantStatus === "ACTIVE" ? "Active" : r.variantStatus}
                      </span>
                    </td>
                    <td style={tdSt}>
                      <input
                        style={numInput}
                        inputMode="decimal"
                        value={r.mrp}
                        onChange={(e) => patchRow(i, { mrp: e.target.value })}
                        onFocus={focusMoney}
                        onBlur={blurMoney}
                        aria-label="MRP INR"
                      />
                    </td>
                    <td style={tdSt}>
                      <input
                        style={numInput}
                        inputMode="decimal"
                        value={r.sale}
                        onChange={(e) => patchRow(i, { sale: e.target.value })}
                        onFocus={focusMoney}
                        onBlur={blurMoney}
                        aria-label="Sale INR"
                      />
                    </td>
                    <td style={tdSt}>
                      <input
                        style={numInput}
                        inputMode="decimal"
                        value={r.mrpUsd}
                        onChange={(e) => patchRow(i, { mrpUsd: e.target.value })}
                        onFocus={focusMoney}
                        onBlur={blurMoney}
                        aria-label="USD MRP"
                      />
                    </td>
                    <td style={tdSt}>
                      <input
                        style={numInput}
                        inputMode="decimal"
                        value={r.saleUsd}
                        onChange={(e) => patchRow(i, { saleUsd: e.target.value })}
                        onFocus={focusMoney}
                        onBlur={blurMoney}
                        aria-label="USD Sale"
                      />
                    </td>
                    <td style={tdSt}>
                      <input
                        style={numInput}
                        inputMode="decimal"
                        value={r.mrpAed}
                        onChange={(e) => patchRow(i, { mrpAed: e.target.value })}
                        onFocus={focusMoney}
                        onBlur={blurMoney}
                        aria-label="Dinar MRP"
                      />
                    </td>
                    <td style={tdSt}>
                      <input
                        style={numInput}
                        inputMode="decimal"
                        value={r.saleAed}
                        onChange={(e) => patchRow(i, { saleAed: e.target.value })}
                        onFocus={focusMoney}
                        onBlur={blurMoney}
                        aria-label="Dinar Sale"
                      />
                    </td>
                    <td style={tdSt}>
                      <input
                        style={numInput}
                        inputMode="decimal"
                        value={r.mrpGbp}
                        onChange={(e) => patchRow(i, { mrpGbp: e.target.value })}
                        onFocus={focusMoney}
                        onBlur={blurMoney}
                        aria-label="GBP MRP"
                      />
                    </td>
                    <td style={tdSt}>
                      <input
                        style={numInput}
                        inputMode="decimal"
                        value={r.saleGbp}
                        onChange={(e) => patchRow(i, { saleGbp: e.target.value })}
                        onFocus={focusMoney}
                        onBlur={blurMoney}
                        aria-label="GBP Sale"
                      />
                    </td>
                    <td style={tdSt}>
                      {showNameEditor ? (
                        <input
                          style={{ ...numInput, textAlign: "left" }}
                          value={r.hsnCode}
                          onChange={(e) => patchRow(i, { hsnCode: e.target.value })}
                          onFocus={focusMoney}
                          onBlur={blurMoney}
                          aria-label="HSN"
                          placeholder="HSN"
                        />
                      ) : (
                        <div style={{ padding: "6px", minHeight: "30px" }} />
                      )}
                    </td>
                    <td style={{ ...tdSt, borderRight: "none" }}>
                      {showNameEditor ? (
                        <select
                          style={{
                            ...numInput,
                            textAlign: "left",
                            paddingRight: "4px",
                            cursor: "pointer"
                          }}
                          value={r.taxClass}
                          onChange={(e) => patchRow(i, { taxClass: e.target.value })}
                          aria-label="GST percent"
                        >
                          {TAX_CLASS_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.value === "standard"
                                ? "18%"
                                : opt.value === "gst12"
                                  ? "12%"
                                  : opt.value === "gst-5"
                                    ? "5%"
                                    : "0%"}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <div style={{ padding: "6px", minHeight: "30px" }} />
                      )}
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
