"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Save } from "lucide-react";

import { AdminToast } from "@/components/admin/AdminToast";
import {
  fetchProductsXlSheet,
  saveProductsXlSheet,
  type XlSheetRow
} from "@/lib/admin-api";

/** Editable row: money as major-unit strings for spreadsheet UX. */
type EditRow = {
  productId: string;
  variantId: string;
  productName: string;
  variantName: string;
  sku: string;
  qty: string;
  cost: string;
  mrp: string;
  sale: string;
  mrpUsd: string;
  saleUsd: string;
  mrpAed: string;
  saleAed: string;
  mrpGbp: string;
  saleGbp: string;
  hsnCode: string;
  productStatus: string;
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
    cost: minorToMajorStr(r.costInPaise),
    mrp: minorToMajorStr(r.mrpInPaise),
    sale: minorToMajorStr(r.saleInPaise),
    mrpUsd: minorToMajorStr(r.mrpUsdCents),
    saleUsd: minorToMajorStr(r.saleUsdCents),
    mrpAed: minorToMajorStr(r.mrpAedFils),
    saleAed: minorToMajorStr(r.saleAedFils),
    mrpGbp: minorToMajorStr(r.mrpGbpPence),
    saleGbp: minorToMajorStr(r.saleGbpPence),
    hsnCode: r.hsnCode || "",
    productStatus: r.productStatus
  };
}

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
  borderBottom: "1px solid rgba(255,255,255,0.12)",
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

function focusMoney(e: React.FocusEvent<HTMLInputElement>) {
  e.currentTarget.style.borderColor = "rgba(185,138,62,0.55)";
  e.currentTarget.style.background = "rgba(185,138,62,0.08)";
}
function blurMoney(e: React.FocusEvent<HTMLInputElement>) {
  e.currentTarget.style.borderColor = "transparent";
  e.currentTarget.style.background = "transparent";
}

const COL_COUNT = 14;

export default function ProductsXlSheetPage() {
  const [rows, setRows] = useState<EditRow[]>([]);
  const [baseline, setBaseline] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; error?: boolean } | null>(null);
  const [filter, setFilter] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const data = await fetchProductsXlSheet();
      const mapped = data.rows.map(apiToEdit);
      setRows(mapped);
      setBaseline(JSON.stringify(mapped));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load sheet");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const dirty = useMemo(() => JSON.stringify(rows) !== baseline, [rows, baseline]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return rows.map((r, i) => ({ r, i }));
    return rows
      .map((r, i) => ({ r, i }))
      .filter(
        ({ r }) =>
          r.productName.toLowerCase().includes(q) ||
          r.variantName.toLowerCase().includes(q) ||
          r.sku.toLowerCase().includes(q) ||
          r.hsnCode.toLowerCase().includes(q)
      );
  }, [rows, filter]);

  function patchRow(index: number, patch: Partial<EditRow>) {
    setRows((prev) => {
      const next = prev.map((row, i) => (i === index ? { ...row, ...patch } : row));
      const cur = next[index];
      if (!cur) return prev;

      if (patch.productName !== undefined || patch.hsnCode !== undefined) {
        return next.map((row) => {
          if (row.productId !== cur.productId) return row;
          return {
            ...row,
            ...(patch.productName !== undefined ? { productName: patch.productName } : {}),
            ...(patch.hsnCode !== undefined ? { hsnCode: patch.hsnCode ?? "" } : {})
          };
        });
      }
      return next;
    });
  }

  async function onSave() {
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
          costInPaise: majorStrToMinor(r.cost),
          mrpInPaise: majorStrToMinorRequired(r.mrp, `MRP (${rowLabel})`),
          saleInPaise: majorStrToMinorRequired(r.sale, `Sale (${rowLabel})`),
          mrpUsdCents: majorStrToMinor(r.mrpUsd),
          saleUsdCents: majorStrToMinor(r.saleUsd),
          mrpAedFils: majorStrToMinor(r.mrpAed),
          saleAedFils: majorStrToMinor(r.saleAed),
          mrpGbpPence: majorStrToMinor(r.mrpGbp),
          saleGbpPence: majorStrToMinor(r.saleGbp),
          hsnCode: r.hsnCode.trim() || null
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
          message: `Saved. Updated ${result.updatedProducts} product(s) and ${result.updatedVariants} variant(s). Storefront prices/names/stock reflect these values.`
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
  }

  return (
    <div
      className="font-sans"
      style={{
        margin: "-24px -32px -48px",
        height: "calc(100vh - 72px)",
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
        <div>
          <h1 style={{ color: "#faf5ec", fontSize: "20px", fontWeight: 800, margin: 0 }}>
            Website Catalog — XL
          </h1>
          <p style={{ color: "#a8c4b0", fontSize: "12px", marginTop: "2px", marginBottom: 0 }}>
            Name · Variant · SKU · Qty · Cost · MRP / Sale · USD · Dinar · GBP · HSN — save updates DB +
            storefront
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter…"
            style={{
              width: "200px",
              border: "1px solid rgba(255,255,255,0.2)",
              borderRadius: "8px",
              padding: "8px 12px",
              fontSize: "13px",
              background: "rgba(0,0,0,0.2)",
              color: "#faf5ec"
            }}
          />
          <span style={{ fontSize: "12px", color: "#a8c4b0", minWidth: "7rem" }}>
            {loading ? "Loading…" : `${filtered.length}/${rows.length}`}
            {dirty ? " · unsaved" : ""}
          </span>
          <Link
            href="/admin/products"
            style={{
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
              textDecoration: "none"
            }}
          >
            <ArrowLeft size={14} aria-hidden />
            Products
          </Link>
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
            {saving ? "Saving…" : dirty ? "Save changes" : "No changes"}
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

      <div style={{ flex: 1, minHeight: 0, overflow: "auto", background: "#fff" }}>
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            minWidth: "1280px",
            tableLayout: "fixed"
          }}
        >
          <colgroup>
            <col style={{ width: "160px" }} />
            <col style={{ width: "140px" }} />
            <col style={{ width: "120px" }} />
            <col style={{ width: "64px" }} />
            <col style={{ width: "80px" }} />
            <col style={{ width: "80px" }} />
            <col style={{ width: "80px" }} />
            <col style={{ width: "72px" }} />
            <col style={{ width: "72px" }} />
            <col style={{ width: "72px" }} />
            <col style={{ width: "72px" }} />
            <col style={{ width: "72px" }} />
            <col style={{ width: "72px" }} />
            <col style={{ width: "80px" }} />
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
                Cost
              </th>
              <th style={stickyHead} rowSpan={2}>
                MRP
              </th>
              <th style={stickyHead} rowSpan={2}>
                Proposed sale
              </th>
              <th style={{ ...stickyHead, textAlign: "center" }} colSpan={2}>
                USD
              </th>
              <th style={{ ...stickyHead, textAlign: "center" }} colSpan={2}>
                Dinar
              </th>
              <th style={{ ...stickyHead, textAlign: "center" }} colSpan={2}>
                GBP
              </th>
              <th style={stickyHead} rowSpan={2}>
                HSN
              </th>
            </tr>
            <tr>
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
                  No rows.
                </td>
              </tr>
            ) : (
              filtered.map(({ r, i }) => {
                const isFirstOfProduct = i === 0 || rows[i - 1]?.productId !== r.productId;
                const showNameEditor = isFirstOfProduct || filter.trim().length > 0;
                return (
                  <tr
                    key={r.variantId}
                    style={{
                      borderBottom: "1px solid #eee8e0",
                      background: isFirstOfProduct ? "rgba(185,138,62,0.05)" : "#fff"
                    }}
                  >
                    <td style={{ padding: 0, verticalAlign: "middle" }}>
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
                    <td style={{ padding: 0 }}>
                      <input
                        style={inputSt}
                        value={r.variantName}
                        onChange={(e) => patchRow(i, { variantName: e.target.value })}
                        onFocus={focusMoney}
                        onBlur={blurMoney}
                        aria-label="Variant name"
                      />
                    </td>
                    <td style={{ padding: 0 }}>
                      <input
                        style={{ ...numInput, textAlign: "left" }}
                        value={r.sku}
                        onChange={(e) => patchRow(i, { sku: e.target.value })}
                        onFocus={focusMoney}
                        onBlur={blurMoney}
                        aria-label="SKU"
                      />
                    </td>
                    <td style={{ padding: 0 }}>
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
                    <td style={{ padding: 0 }}>
                      <input
                        style={numInput}
                        inputMode="decimal"
                        value={r.cost}
                        onChange={(e) => patchRow(i, { cost: e.target.value })}
                        onFocus={focusMoney}
                        onBlur={blurMoney}
                        aria-label="Cost INR"
                        placeholder="—"
                      />
                    </td>
                    <td style={{ padding: 0 }}>
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
                    <td style={{ padding: 0 }}>
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
                    <td style={{ padding: 0 }}>
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
                    <td style={{ padding: 0 }}>
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
                    <td style={{ padding: 0 }}>
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
                    <td style={{ padding: 0 }}>
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
                    <td style={{ padding: 0 }}>
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
                    <td style={{ padding: 0 }}>
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
                    <td style={{ padding: 0 }}>
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
