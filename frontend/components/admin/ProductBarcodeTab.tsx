"use client";

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
/** Usable A4 after ~5mm page margin */
const A4_W_MM = 200;
const A4_H_MM = 287;

function maxCols() {
  return Math.max(1, Math.floor(A4_W_MM / LABEL_W_MM));
}
function maxRows() {
  return Math.max(1, Math.floor(A4_H_MM / LABEL_H_MM));
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Build print HTML: Code128 via JsBarcode CDN for the print window. */
function buildPrintHtml(
  productName: string,
  items: { sku: string; variantLabel: string }[],
  cols: number,
  rows: number
) {
  const slots = cols * rows;
  const cells: { sku: string; title: string }[] = [];
  for (let i = 0; i < slots; i++) {
    const src = items[i % items.length]!;
    const title = [productName.trim(), src.variantLabel.trim()].filter(Boolean).join(" / ");
    cells.push({ sku: src.sku, title });
  }

  const cellHtml = cells
    .map(
      (c, i) => `
    <div class="label">
      <div class="name">${escapeHtml(c.title || "Product")}</div>
      <svg class="bc" id="bc-${i}"></svg>
      <div class="sku">${escapeHtml(c.sku)}</div>
    </div>`
    )
    .join("");

  const skusJson = JSON.stringify(cells.map((c) => c.sku));

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Print barcodes — ${escapeHtml(productName || "Sarveda")}</title>
  <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"></script>
  <style>
    @page { size: A4; margin: 5mm; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: #111; }
    .sheet {
      width: ${cols * LABEL_W_MM}mm;
      display: grid;
      grid-template-columns: repeat(${cols}, ${LABEL_W_MM}mm);
      grid-template-rows: repeat(${rows}, ${LABEL_H_MM}mm);
      page-break-after: always;
    }
    .label {
      width: ${LABEL_W_MM}mm;
      height: ${LABEL_H_MM}mm;
      padding: 1.2mm 1.5mm 1mm;
      overflow: hidden;
      border: 0.2mm dashed #ccc;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      align-items: flex-start;
    }
    .name {
      font-size: 6.5pt;
      font-weight: 600;
      line-height: 1.15;
      max-height: 7mm;
      overflow: hidden;
      width: 100%;
    }
    .bc {
      width: 100%;
      max-height: 11mm;
      display: block;
    }
    .sku {
      font-size: 7pt;
      font-weight: 600;
      letter-spacing: 0.02em;
      width: 100%;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    @media print {
      .label { border-color: transparent; }
    }
  </style>
</head>
<body>
  <div class="sheet">${cellHtml}</div>
  <script>
    (function () {
      var skus = ${skusJson};
      for (var i = 0; i < skus.length; i++) {
        var el = document.getElementById("bc-" + i);
        if (!el || !skus[i]) continue;
        try {
          JsBarcode(el, skus[i], {
            format: "CODE128",
            width: 1.1,
            height: 28,
            margin: 0,
            displayValue: false
          });
        } catch (e) {}
      }
      setTimeout(function () { window.focus(); window.print(); }, 200);
    })();
  </script>
</body>
</html>`;
}

export function ProductBarcodeTab({ productName, variants }: Props) {
  const withSku = useMemo(
    () => variants.filter((v) => v.sku.trim().length > 0),
    [variants]
  );
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [printOpen, setPrintOpen] = useState(false);
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

  function openPrint() {
    if (selected.size === 0) return;
    setCols(Math.min(4, maxCols()));
    setRows(Math.min(10, maxRows()));
    setPrintOpen(true);
  }

  function doPrint() {
    const items = withSku
      .filter((v) => selected.has(v.key))
      .map((v) => ({ sku: v.sku.trim(), variantLabel: v.variantLabel }));
    if (!items.length) return;

    const safeCols = Math.min(maxCols(), Math.max(1, Math.floor(cols) || 1));
    const safeRows = Math.min(maxRows(), Math.max(1, Math.floor(rows) || 1));
    const html = buildPrintHtml(productName, items, safeCols, safeRows);
    const w = window.open("", "_blank", "noopener,noreferrer,width=900,height=700");
    if (!w) {
      alert("Pop-up blocked. Allow pop-ups for this site to print barcodes.");
      return;
    }
    w.document.open();
    w.document.write(html);
    w.document.close();
    setPrintOpen(false);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm text-stone-600 dark:text-stone-300">
            Each variant uses its unique <strong>SKU</strong> as a Code128 barcode for stickers
            ({LABEL_W_MM / 10}&nbsp;cm × {LABEL_H_MM / 10}&nbsp;cm). Select rows, then Print for an
            A4 sheet.
          </p>
        </div>
        <button
          type="button"
          disabled={selected.size === 0}
          onClick={openPrint}
          className="shrink-0 rounded-lg bg-stone-900 px-4 py-2 text-sm font-semibold text-white hover:bg-stone-800 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-amber-500 dark:text-stone-900 dark:hover:bg-amber-400"
        >
          Print{selected.size > 0 ? ` (${selected.size})` : ""}
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

      {printOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="barcode-print-title"
        >
          <div className="w-full max-w-md rounded-xl border border-stone-200 bg-white p-5 shadow-xl dark:border-stone-600 dark:bg-stone-900">
            <h2
              id="barcode-print-title"
              className="text-lg font-semibold text-stone-900 dark:text-stone-50"
            >
              Print on A4
            </h2>
            <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
              Each label is {LABEL_W_MM / 10}×{LABEL_H_MM / 10} cm. The grid fills by repeating
              selected variants (handy for many copies of one SKU).
            </p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="bc-cols" className="text-xs font-semibold uppercase tracking-wider text-stone-500">
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
                <label htmlFor="bc-rows" className="text-xs font-semibold uppercase tracking-wider text-stone-500">
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
                onClick={() => setPrintOpen(false)}
                className="rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-200"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={doPrint}
                className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-semibold text-white dark:bg-amber-500 dark:text-stone-900"
              >
                Print
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
