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

type EditRow = XlSheetRow & { dirty?: boolean };

const thSt: React.CSSProperties = {
  padding: "10px 12px",
  fontSize: "11px",
  fontWeight: 700,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: "var(--admin-text-muted, #8a7060)",
  background: "var(--admin-table-head, linear-gradient(180deg,#f2ede5,#f9f7f4))",
  textAlign: "left",
  position: "sticky",
  top: 0,
  zIndex: 2,
  borderBottom: "1px solid var(--admin-card-border, #e8e2d9)",
  whiteSpace: "nowrap"
};

const inputSt: React.CSSProperties = {
  width: "100%",
  border: "1px solid transparent",
  background: "transparent",
  padding: "8px 10px",
  fontSize: "13px",
  color: "var(--admin-text, #2c2420)",
  borderRadius: "6px",
  outline: "none"
};

export default function ProductsXlSheetPage() {
  const [rows, setRows] = useState<EditRow[]>([]);
  const [baseline, setBaseline] = useState<string>("");
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
      setRows(data.rows);
      setBaseline(JSON.stringify(data.rows));
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
      const payload = rows.map((r) => ({
        productId: r.productId,
        variantId: r.variantId,
        productName: r.productName.trim(),
        variantName: r.variantName.trim(),
        sku: r.sku.trim(),
        hsnCode: r.hsnCode.trim() || null
      }));
      const blankName = payload.find((r) => !r.productName);
      if (blankName) {
        throw new Error("Product name cannot be empty");
      }
      const blankSku = payload.find((r) => !r.sku);
      if (blankSku) {
        throw new Error("SKU cannot be empty");
      }

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
          message: `Saved. Updated ${result.updatedProducts} product(s) and ${result.updatedVariants} variant(s). Storefront will show the new names/SKUs/HSN.`
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
    <div className="w-full space-y-5 font-sans">
      <AdminToast toast={toast} onDismiss={() => setToast(null)} />

      <div
        style={{
          background: "linear-gradient(135deg, #1c352a 0%, #2d5040 100%)",
          borderRadius: "16px",
          padding: "22px 28px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "16px"
        }}
      >
        <div>
          <h1 style={{ color: "#faf5ec", fontSize: "26px", fontWeight: 800, margin: 0 }}>
            📊 Products — XL format
          </h1>
          <p style={{ color: "#a8c4b0", fontSize: "13px", marginTop: "4px", marginBottom: 0 }}>
            Edit like the Aug 9 sheet (Name, Variant, SKU) plus HSN. Save updates the catalog DB and storefront.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/admin/products"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              padding: "9px 16px",
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
            Back to products
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
              padding: "10px 18px",
              fontSize: "13px",
              border: "none",
              cursor: !dirty || saving ? "not-allowed" : "pointer",
              opacity: !dirty || saving ? 0.65 : 1,
              boxShadow: dirty ? "0 2px 8px rgba(185,138,62,0.35)" : "none"
            }}
          >
            <Save size={14} aria-hidden />
            {saving ? "Saving…" : dirty ? "Save changes" : "No changes"}
          </button>
        </div>
      </div>

      <div
        className="flex flex-wrap items-center gap-3 rounded-lg border p-3"
        style={{
          background: "var(--admin-card-bg, #faf9f7)",
          borderColor: "var(--admin-card-border, #e8e2d9)"
        }}
      >
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter name / variant / SKU / HSN…"
          style={{
            flex: 1,
            minWidth: "16rem",
            border: "1px solid var(--admin-card-border, #e8e2d9)",
            borderRadius: "8px",
            padding: "9px 12px",
            fontSize: "13px",
            background: "var(--admin-input-bg, #fff)",
            color: "var(--admin-text, #2c2420)"
          }}
        />
        <span style={{ fontSize: "12px", color: "var(--admin-text-muted, #8a7060)" }}>
          {loading ? "Loading…" : `${filtered.length} / ${rows.length} rows`}
          {dirty ? " · unsaved edits" : ""}
        </span>
      </div>

      {err ? (
        <div
          style={{
            padding: "12px 14px",
            borderRadius: "8px",
            background: "#fde8e8",
            color: "#9b2c2c",
            fontSize: "13px"
          }}
        >
          {err}
        </div>
      ) : null}

      <div
        style={{
          borderRadius: "12px",
          border: "1px solid var(--admin-card-border, #e8e2d9)",
          background: "var(--admin-card-bg, #fff)",
          maxHeight: "calc(100vh - 280px)",
          overflow: "auto",
          boxShadow: "0 1px 4px rgba(44,36,32,0.06)"
        }}
      >
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "900px" }}>
          <thead>
            <tr>
              <th style={{ ...thSt, width: "28%" }}>Name</th>
              <th style={{ ...thSt, width: "28%" }}>Variant Name</th>
              <th style={{ ...thSt, width: "22%" }}>SKU</th>
              <th style={{ ...thSt, width: "14%" }}>HSN Code</th>
              <th style={{ ...thSt, width: "8%" }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} style={{ padding: "24px", color: "var(--admin-text-muted,#8a7060)" }}>
                  Loading catalog sheet…
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ padding: "24px", color: "var(--admin-text-muted,#8a7060)" }}>
                  No rows.
                </td>
              </tr>
            ) : (
              filtered.map(({ r, i }) => {
                const isFirstOfProduct =
                  i === 0 || rows[i - 1]?.productId !== r.productId;
                const showNameEditor = isFirstOfProduct || filter.trim().length > 0;
                return (
                  <tr
                    key={r.variantId}
                    style={{
                      borderBottom: "1px solid var(--admin-card-border, #f0ece6)",
                      background: isFirstOfProduct ? "rgba(185,138,62,0.04)" : "transparent"
                    }}
                  >
                    <td style={{ padding: 0, verticalAlign: "middle" }}>
                      {showNameEditor ? (
                        <input
                          style={{
                            ...inputSt,
                            fontWeight: 600,
                            borderColor: "transparent"
                          }}
                          value={r.productName}
                          onChange={(e) => patchRow(i, { productName: e.target.value })}
                          onFocus={(e) => {
                            e.currentTarget.style.borderColor = "rgba(185,138,62,0.45)";
                            e.currentTarget.style.background = "rgba(185,138,62,0.06)";
                          }}
                          onBlur={(e) => {
                            e.currentTarget.style.borderColor = "transparent";
                            e.currentTarget.style.background = "transparent";
                          }}
                          aria-label="Product name"
                        />
                      ) : (
                        <div style={{ padding: "8px 10px", minHeight: "36px" }} />
                      )}
                    </td>
                    <td style={{ padding: 0 }}>
                      <input
                        style={inputSt}
                        value={r.variantName}
                        onChange={(e) => patchRow(i, { variantName: e.target.value })}
                        onFocus={(e) => {
                          e.currentTarget.style.borderColor = "rgba(185,138,62,0.45)";
                          e.currentTarget.style.background = "rgba(185,138,62,0.06)";
                        }}
                        onBlur={(e) => {
                          e.currentTarget.style.borderColor = "transparent";
                          e.currentTarget.style.background = "transparent";
                        }}
                        aria-label="Variant name"
                      />
                    </td>
                    <td style={{ padding: 0 }}>
                      <input
                        style={{
                          ...inputSt,
                          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                          fontSize: "12px"
                        }}
                        value={r.sku}
                        onChange={(e) => patchRow(i, { sku: e.target.value })}
                        onFocus={(e) => {
                          e.currentTarget.style.borderColor = "rgba(185,138,62,0.45)";
                          e.currentTarget.style.background = "rgba(185,138,62,0.06)";
                        }}
                        onBlur={(e) => {
                          e.currentTarget.style.borderColor = "transparent";
                          e.currentTarget.style.background = "transparent";
                        }}
                        aria-label="SKU"
                      />
                    </td>
                    <td style={{ padding: 0 }}>
                      {showNameEditor ? (
                        <input
                          style={{
                            ...inputSt,
                            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                            fontSize: "12px"
                          }}
                          value={r.hsnCode}
                          onChange={(e) => patchRow(i, { hsnCode: e.target.value })}
                          placeholder="e.g. 9205"
                          onFocus={(e) => {
                            e.currentTarget.style.borderColor = "rgba(185,138,62,0.45)";
                            e.currentTarget.style.background = "rgba(185,138,62,0.06)";
                          }}
                          onBlur={(e) => {
                            e.currentTarget.style.borderColor = "transparent";
                            e.currentTarget.style.background = "transparent";
                          }}
                          aria-label="HSN code"
                        />
                      ) : (
                        <div style={{ padding: "8px 10px", minHeight: "36px" }} />
                      )}
                    </td>
                    <td
                      style={{
                        padding: "8px 12px",
                        fontSize: "11px",
                        color: "var(--admin-text-muted, #8a7060)",
                        whiteSpace: "nowrap"
                      }}
                    >
                      {r.productStatus}
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
