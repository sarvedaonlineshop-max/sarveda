"use client";

import JsBarcode from "jsbarcode";
import { jsPDF } from "jspdf";
import { useMemo, useState } from "react";

import { SkuBarcode } from "@/components/admin/SkuBarcode";

export type BarcodeVariantRow = {
  key: string;
  sku: string;
  /** e.g. "Large / Blue" */
  variantLabel: string;
};

type Props = {
  productName: string;
  variants: BarcodeVariantRow[];
};

const LABEL_W_MM = 50;
const LABEL_H_MM = 25;
const MARGIN_MM = 5;
/** Usable A4 after margin */
const A4_W_MM = 210 - MARGIN_MM * 2;
const A4_H_MM = 297 - MARGIN_MM * 2;

function maxCols() {
  return Math.max(1, Math.floor(A4_W_MM / LABEL_W_MM));
}
function maxRows() {
  return Math.max(1, Math.floor(A4_H_MM / LABEL_H_MM));
}

function barcodePngDataUrl(sku: string): string | null {
  const canvas = document.createElement("canvas");
  try {
    JsBarcode(canvas, sku, {
      format: "CODE128",
      width: 2,
      height: 56,
      margin: 0,
      displayValue: false,
      background: "#ffffff",
      lineColor: "#000000"
    });
    return canvas.toDataURL("image/png");
  } catch {
    return null;
  }
}

function slugFile(name: string) {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "product"
  );
}

function downloadBarcodePdf(
  productName: string,
  items: { sku: string; variantLabel: string }[],
  cols: number,
  rows: number
) {
  const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const slots = cols * rows;
  const barcodeCache = new Map<string, string | null>();

  for (let i = 0; i < slots; i++) {
    const src = items[i % items.length]!;
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = MARGIN_MM + col * LABEL_W_MM;
    const y = MARGIN_MM + row * LABEL_H_MM;

    const title = [productName.trim(), src.variantLabel.trim()].filter(Boolean).join(" / ");

    // Light cut guide (optional dashed feel via thin rect)
    pdf.setDrawColor(200);
    pdf.setLineWidth(0.1);
    pdf.rect(x, y, LABEL_W_MM, LABEL_H_MM);

    pdf.setTextColor(17);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(7);
    const nameLines = pdf.splitTextToSize(title || "Product", LABEL_W_MM - 3);
    pdf.text(nameLines.slice(0, 2), x + 1.5, y + 3.2);

    if (!barcodeCache.has(src.sku)) {
      barcodeCache.set(src.sku, barcodePngDataUrl(src.sku));
    }
    const png = barcodeCache.get(src.sku);
    if (png) {
      const bcW = LABEL_W_MM - 4;
      const bcH = 10;
      pdf.addImage(png, "PNG", x + 2, y + 8, bcW, bcH);
    }

    pdf.setFontSize(8);
    pdf.text(src.sku, x + 1.5, y + LABEL_H_MM - 2.2);
  }

  pdf.save(`barcodes-${slugFile(productName)}.pdf`);
}

export function ProductBarcodeTab({ productName, variants }: Props) {
  const withSku = useMemo(
    () => variants.filter((v) => v.sku.trim().length > 0),
    [variants]
  );
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [cols, setCols] = useState(4);
  const [rows, setRows] = useState(10);

  const allSelected = withSku.length > 0 && withSku.every((v) => selected.has(v.key));

  function toggleAll() {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(withSku.map((v) => v.key)));
  }

  function toggleOne(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function openDialog() {
    if (selected.size === 0) return;
    setCols(Math.min(4, maxCols()));
    setRows(Math.min(10, maxRows()));
    setDialogOpen(true);
  }

  function savePdf() {
    const items = withSku
      .filter((v) => selected.has(v.key))
      .map((v) => ({ sku: v.sku.trim(), variantLabel: v.variantLabel }));
    if (!items.length) return;

    const safeCols = Math.min(maxCols(), Math.max(1, Math.floor(cols) || 1));
    const safeRows = Math.min(maxRows(), Math.max(1, Math.floor(rows) || 1));

    setBusy(true);
    try {
      downloadBarcodePdf(productName, items, safeCols, safeRows);
      setDialogOpen(false);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Could not create PDF");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm text-stone-600 dark:text-stone-300">
            Each variant uses its unique <strong>SKU</strong> as a Code128 barcode for stickers
            ({LABEL_W_MM / 10}&nbsp;cm × {LABEL_H_MM / 10}&nbsp;cm). Select rows, then download an
            A4 PDF (print from the PDF later).
          </p>
        </div>
        <button
          type="button"
          disabled={selected.size === 0}
          onClick={openDialog}
          className="shrink-0 rounded-lg bg-stone-900 px-4 py-2 text-sm font-semibold text-white hover:bg-stone-800 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-amber-500 dark:text-stone-900 dark:hover:bg-amber-400"
        >
          Save PDF{selected.size > 0 ? ` (${selected.size})` : ""}
        </button>
      </div>

      {withSku.length === 0 ? (
        <p className="rounded-lg border border-dashed border-stone-300 bg-stone-50 px-4 py-8 text-center text-sm text-stone-500 dark:border-stone-600 dark:bg-stone-950/40">
          No variants with SKUs yet. Add SKUs on the Variants step first.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-stone-200 dark:border-stone-600">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-stone-200 bg-stone-50 text-xs uppercase tracking-wider text-stone-500 dark:border-stone-600 dark:bg-stone-950/60">
              <tr>
                <th className="w-10 px-3 py-2">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                    aria-label="Select all variants"
                  />
                </th>
                <th className="px-3 py-2 font-semibold">Product / variant</th>
                <th className="px-3 py-2 font-semibold">SKU</th>
                <th className="px-3 py-2 font-semibold">Barcode</th>
              </tr>
            </thead>
            <tbody>
              {withSku.map((v) => {
                const title = [productName.trim(), v.variantLabel.trim()]
                  .filter(Boolean)
                  .join(" / ");
                return (
                  <tr
                    key={v.key}
                    className="border-b border-stone-100 last:border-0 dark:border-stone-800"
                  >
                    <td className="px-3 py-3 align-middle">
                      <input
                        type="checkbox"
                        checked={selected.has(v.key)}
                        onChange={() => toggleOne(v.key)}
                        aria-label={`Select ${v.sku}`}
                      />
                    </td>
                    <td className="max-w-[14rem] px-3 py-3 align-middle font-medium text-stone-800 dark:text-stone-100">
                      {title || "—"}
                    </td>
                    <td className="px-3 py-3 align-middle font-mono text-xs text-stone-700 dark:text-stone-300">
                      {v.sku}
                    </td>
                    <td className="px-3 py-3 align-middle">
                      <SkuBarcode value={v.sku} height={36} className="max-h-10 w-auto max-w-[220px]" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {dialogOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="barcode-pdf-title"
        >
          <div className="w-full max-w-md rounded-xl border border-stone-200 bg-white p-5 shadow-xl dark:border-stone-600 dark:bg-stone-900">
            <h2
              id="barcode-pdf-title"
              className="text-lg font-semibold text-stone-900 dark:text-stone-50"
            >
              Save A4 PDF
            </h2>
            <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
              Each label is {LABEL_W_MM / 10}×{LABEL_H_MM / 10} cm. The grid fills by repeating
              selected variants. Open the PDF and print when you are ready.
            </p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="bc-cols"
                  className="text-xs font-semibold uppercase tracking-wider text-stone-500"
                >
                  Columns
                </label>
                <input
                  id="bc-cols"
                  type="number"
                  min={1}
                  max={maxCols()}
                  value={cols}
                  onChange={(e) => setCols(Number(e.target.value))}
                  className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm dark:border-stone-600 dark:bg-stone-950"
                />
                <p className="mt-1 text-[11px] text-stone-500">Max {maxCols()} on A4</p>
              </div>
              <div>
                <label
                  htmlFor="bc-rows"
                  className="text-xs font-semibold uppercase tracking-wider text-stone-500"
                >
                  Rows
                </label>
                <input
                  id="bc-rows"
                  type="number"
                  min={1}
                  max={maxRows()}
                  value={rows}
                  onChange={(e) => setRows(Number(e.target.value))}
                  className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm dark:border-stone-600 dark:bg-stone-950"
                />
                <p className="mt-1 text-[11px] text-stone-500">Max {maxRows()} on A4</p>
              </div>
            </div>
            <p className="mt-3 text-xs text-stone-500">
              Total labels on sheet:{" "}
              <strong>
                {Math.max(1, Math.floor(cols) || 1) * Math.max(1, Math.floor(rows) || 1)}
              </strong>
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => setDialogOpen(false)}
                className="rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-200"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={savePdf}
                className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-semibold text-white dark:bg-amber-500 dark:text-stone-900"
              >
                {busy ? "Creating…" : "Download PDF"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
