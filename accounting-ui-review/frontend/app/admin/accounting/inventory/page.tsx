"use client";

import { useCallback, useEffect, useState } from "react";
import {
  discoverInventoryCogsAccounting,
  discoverInventoryCogsReversalAccounting,
  discoverPurchaseCapitalization,
  fetchInventoryClassificationSummary,
  fetchInventoryOpeningBatches,
  fetchInventoryReconciliationV4,
  fetchPurchaseCapitalizationClearing,
  postInventoryOpeningBatch,
  postInventoryCogsAccounting,
  postInventoryCogsReversalAccounting,
  postPurchaseCapitalization,
  previewInventoryOpeningUpload,
  previewInventoryCogsAccounting,
  previewInventoryCogsReversalAccounting,
  previewPurchaseCapitalization,
  saveInventoryOpeningDraft
} from "@/lib/accounting-api";
import { AdminAccountingHeader } from "@/components/admin/accounting/AdminAccountingNav";

function formatPaise(p: number | undefined | null) {
  if (p == null) return "—";
  return `₹${(p / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
}

export default function AccountingInventoryPage() {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [recon, setRecon] = useState<Record<string, unknown> | null>(null);
  const [classification, setClassification] = useState<Record<string, number> | null>(null);
  const [preview, setPreview] = useState<Record<string, unknown> | null>(null);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [batches, setBatches] = useState<Array<Record<string, unknown>>>([]);
  const [capClearing, setCapClearing] = useState<Record<string, unknown> | null>(null);
  const [capPreview, setCapPreview] = useState<Record<string, unknown> | null>(null);
  const [receiptLineId, setReceiptLineId] = useState("");
  const [cogsPreview, setCogsPreview] = useState<Record<string, unknown> | null>(null);
  const [cogsOrderId, setCogsOrderId] = useState("");
  const [reversalPreview, setReversalPreview] = useState<Record<string, unknown> | null>(null);
  const [restockEventId, setRestockEventId] = useState("");

  const [effectiveDate, setEffectiveDate] = useState(new Date().toISOString().slice(0, 10));
  const [valuationSource, setValuationSource] = useState("Reviewed spreadsheet");
  const [allowMismatch, setAllowMismatch] = useState(false);
  const [file, setFile] = useState<File | null>(null);

  const loadRecon = useCallback(async () => {
    setBusy(true);
    setErr(null);
    try {
      const [r, c, b, clearing] = await Promise.all([
        fetchInventoryReconciliationV4({ physicalOnly: true, limit: 200 }),
        fetchInventoryClassificationSummary(),
        fetchInventoryOpeningBatches(),
        fetchPurchaseCapitalizationClearing({ limit: 50 })
      ]);
      setRecon(r);
      setClassification(c);
      setBatches(b.batches);
      setCapClearing(clearing);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Load failed");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void loadRecon();
  }, [loadRecon]);

  async function runPreview() {
    if (!file) {
      setErr("Choose an XLSX file first");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const data = await previewInventoryOpeningUpload(file, {
        effectiveDate,
        valuationSource,
        allowQuantityMismatch: allowMismatch
      });
      setPreview(data);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Preview failed");
    } finally {
      setBusy(false);
    }
  }

  async function runSaveDraft() {
    if (!preview) return;
    setBusy(true);
    setErr(null);
    try {
      const data = await saveInventoryOpeningDraft({
        effectiveDate,
        valuationSource,
        allowQuantityMismatch: allowMismatch,
        rows: (preview.rows as Array<Record<string, unknown>>) ?? [],
        batchId: batchId ?? undefined
      });
      const id = (data.batch as { id?: string })?.id;
      if (id) setBatchId(id);
      await loadRecon();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save draft failed");
    } finally {
      setBusy(false);
    }
  }

  async function runPost() {
    if (!batchId) {
      setErr("Save a draft batch first");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await postInventoryOpeningBatch(batchId);
      await loadRecon();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Post failed");
    } finally {
      setBusy(false);
    }
  }

  const rows = (recon?.rows as Array<Record<string, unknown>>) ?? [];
  const financial = recon?.financialControl as Record<string, number> | undefined;
  const previewRows = (preview?.rows as Array<Record<string, unknown>>) ?? [];
  const previewErrors = (preview?.errors as Array<Record<string, unknown>>) ?? [];

  return (
    <div className="space-y-6 p-6">
      <AdminAccountingHeader
        title="Inventory / Native Value Layers"
        subtitle="Phase 3D1 opening layers + Phase 3D2 purchase capitalization + Phase 3D3 FIFO COGS. Does not modify operational stock."
      />

      {err ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{err}</div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-lg border bg-white p-4">
          <p className="text-xs uppercase text-neutral-500">1200 GL balance</p>
          <p className="text-lg font-semibold">{formatPaise(financial?.inventoryGl1200InPaise)}</p>
        </div>
        <div className="rounded-lg border bg-white p-4">
          <p className="text-xs uppercase text-neutral-500">Native layer value</p>
          <p className="text-lg font-semibold">{formatPaise(financial?.nativeLayersTotalValueInPaise)}</p>
        </div>
        <div className="rounded-lg border bg-white p-4">
          <p className="text-xs uppercase text-neutral-500">GL vs layers variance</p>
          <p className="text-lg font-semibold">{formatPaise(financial?.glVsLayersVarianceInPaise)}</p>
        </div>
      </div>

      {classification ? (
        <div className="rounded-lg border bg-white p-4 text-sm">
          <p className="mb-2 font-medium">Classification summary</p>
          <pre className="overflow-auto text-xs">{JSON.stringify(classification, null, 2)}</pre>
        </div>
      ) : null}

      <section className="rounded-lg border bg-white p-4 space-y-3">
        <h2 className="font-semibold">FIFO COGS (Phase 3D3)</h2>
        <p className="text-sm text-neutral-600">
          Dr 5000 Cost of Goods Sold / Cr 1200 Inventory Asset from native FIFO layer consumption only.
        </p>
        <div className="flex flex-wrap gap-2 items-end">
          <label className="text-sm block">
            Order ID
            <input
              className="mt-1 block rounded border px-2 py-1 min-w-[320px] font-mono text-xs"
              value={cogsOrderId}
              onChange={(e) => setCogsOrderId(e.target.value)}
              placeholder="uuid of Order"
            />
          </label>
          <button
            type="button"
            disabled={busy || !cogsOrderId.trim()}
            onClick={async () => {
              setBusy(true);
              setErr(null);
              try {
                setCogsPreview(await previewInventoryCogsAccounting({ orderId: cogsOrderId.trim() }));
              } catch (e) {
                setErr(e instanceof Error ? e.message : "Preview failed");
              } finally {
                setBusy(false);
              }
            }}
            className="rounded bg-neutral-800 px-3 py-2 text-sm text-white disabled:opacity-50"
          >
            Preview
          </button>
          <button
            type="button"
            disabled={busy || !cogsOrderId.trim()}
            onClick={async () => {
              setBusy(true);
              setErr(null);
              try {
                await postInventoryCogsAccounting({ orderId: cogsOrderId.trim() });
                await loadRecon();
              } catch (e) {
                setErr(e instanceof Error ? e.message : "Post failed");
              } finally {
                setBusy(false);
              }
            }}
            className="rounded bg-emerald-700 px-3 py-2 text-sm text-white disabled:opacity-50"
          >
            Post one
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setErr(null);
              try {
                setCogsPreview(await discoverInventoryCogsAccounting({ dryRun: true, limit: 25 }));
                await loadRecon();
              } catch (e) {
                setErr(e instanceof Error ? e.message : "Discovery failed");
              } finally {
                setBusy(false);
              }
            }}
            className="rounded bg-amber-700 px-3 py-2 text-sm text-white disabled:opacity-50"
          >
            Dry-run discovery
          </button>
        </div>
        {cogsPreview ? (
          <pre className="max-h-48 overflow-auto rounded bg-neutral-50 p-2 text-xs">
            {JSON.stringify(cogsPreview, null, 2)}
          </pre>
        ) : null}
      </section>

      <section className="rounded-lg border bg-white p-4 space-y-3">
        <h2 className="font-semibold">Return / Restock COGS reversal (Phase 3D4)</h2>
        <p className="text-sm text-neutral-600">
          Dr 1200 Inventory Asset / Cr 5000 COGS from historical AccountingInventoryCostConsumption only.
          Source: SELLABLE OrderInventoryRestockEvent. Does not change onHand.
        </p>
        <div className="flex flex-wrap gap-2 items-end">
          <label className="text-sm block">
            Restock event ID
            <input
              className="mt-1 block rounded border px-2 py-1 min-w-[320px] font-mono text-xs"
              value={restockEventId}
              onChange={(e) => setRestockEventId(e.target.value)}
              placeholder="uuid of OrderInventoryRestockEvent"
            />
          </label>
          <button
            type="button"
            disabled={busy || !restockEventId.trim()}
            onClick={async () => {
              setBusy(true);
              setErr(null);
              try {
                setReversalPreview(
                  await previewInventoryCogsReversalAccounting({
                    restockEventId: restockEventId.trim()
                  })
                );
              } catch (e) {
                setErr(e instanceof Error ? e.message : "Preview failed");
              } finally {
                setBusy(false);
              }
            }}
            className="rounded bg-neutral-800 px-3 py-2 text-sm text-white disabled:opacity-50"
          >
            Preview
          </button>
          <button
            type="button"
            disabled={busy || !restockEventId.trim()}
            onClick={async () => {
              setBusy(true);
              setErr(null);
              try {
                await postInventoryCogsReversalAccounting({
                  restockEventId: restockEventId.trim()
                });
                await loadRecon();
              } catch (e) {
                setErr(e instanceof Error ? e.message : "Post failed");
              } finally {
                setBusy(false);
              }
            }}
            className="rounded bg-emerald-700 px-3 py-2 text-sm text-white disabled:opacity-50"
          >
            Post one
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setErr(null);
              try {
                setReversalPreview(
                  await discoverInventoryCogsReversalAccounting({ dryRun: true, limit: 25 })
                );
                await loadRecon();
              } catch (e) {
                setErr(e instanceof Error ? e.message : "Discovery failed");
              } finally {
                setBusy(false);
              }
            }}
            className="rounded bg-amber-700 px-3 py-2 text-sm text-white disabled:opacity-50"
          >
            Dry-run discovery
          </button>
        </div>
        {reversalPreview ? (
          <pre className="max-h-64 overflow-auto rounded bg-neutral-50 p-2 text-xs">
            {JSON.stringify(reversalPreview, null, 2)}
          </pre>
        ) : null}
      </section>

      <section className="rounded-lg border bg-white p-4 space-y-3">
        <h2 className="font-semibold">Purchase Capitalization (Phase 3D2)</h2>
        <p className="text-sm text-neutral-600">
          Dr 1200 Inventory Asset / Cr 1210 Clearing when a posted vendor bill matches a purchase receipt line.
        </p>
        <div className="flex flex-wrap gap-2 items-end">
          <label className="text-sm block">
            Receipt line ID
            <input
              className="mt-1 block rounded border px-2 py-1 min-w-[320px] font-mono text-xs"
              value={receiptLineId}
              onChange={(e) => setReceiptLineId(e.target.value)}
              placeholder="uuid of PurchaseReceiptLine"
            />
          </label>
          <button
            type="button"
            disabled={busy || !receiptLineId.trim()}
            onClick={async () => {
              setBusy(true);
              setErr(null);
              try {
                setCapPreview(await previewPurchaseCapitalization(receiptLineId.trim()));
              } catch (e) {
                setErr(e instanceof Error ? e.message : "Preview failed");
              } finally {
                setBusy(false);
              }
            }}
            className="rounded bg-neutral-800 px-3 py-2 text-sm text-white disabled:opacity-50"
          >
            Preview
          </button>
          <button
            type="button"
            disabled={busy || !receiptLineId.trim()}
            onClick={async () => {
              setBusy(true);
              setErr(null);
              try {
                await postPurchaseCapitalization(receiptLineId.trim());
                await loadRecon();
              } catch (e) {
                setErr(e instanceof Error ? e.message : "Post failed");
              } finally {
                setBusy(false);
              }
            }}
            className="rounded bg-emerald-700 px-3 py-2 text-sm text-white disabled:opacity-50"
          >
            Post one
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await discoverPurchaseCapitalization({ dryRun: true, limit: 25 });
                await loadRecon();
              } catch (e) {
                setErr(e instanceof Error ? e.message : "Discovery failed");
              } finally {
                setBusy(false);
              }
            }}
            className="rounded bg-amber-700 px-3 py-2 text-sm text-white disabled:opacity-50"
          >
            Dry-run discovery
          </button>
        </div>
        {capPreview ? (
          <pre className="max-h-48 overflow-auto rounded bg-neutral-50 p-2 text-xs">
            {JSON.stringify(capPreview, null, 2)}
          </pre>
        ) : null}
        {capClearing ? (
          <div className="overflow-auto max-h-64">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b text-left">
                  <th className="p-1">Bill</th>
                  <th className="p-1">SKU</th>
                  <th className="p-1">Billed</th>
                  <th className="p-1">Received</th>
                  <th className="p-1">Capitalized</th>
                  <th className="p-1">1210 out</th>
                  <th className="p-1">Status</th>
                </tr>
              </thead>
              <tbody>
                {((capClearing.rows as Array<Record<string, unknown>>) ?? []).slice(0, 30).map((row, i) => (
                  <tr key={i} className="border-b">
                    <td className="p-1">{String(row.billNumber)}</td>
                    <td className="p-1">{String(row.sku ?? "—")}</td>
                    <td className="p-1">{String(row.billedQuantity)}</td>
                    <td className="p-1">{String(row.receivedQuantity)}</td>
                    <td className="p-1">{String(row.capitalizedQuantity)}</td>
                    <td className="p-1">{formatPaise(row.clearing1210OutstandingInPaise as number)}</td>
                    <td className="p-1">{String(row.status)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      <section className="rounded-lg border bg-white p-4 space-y-3">
        <h2 className="font-semibold">Opening inventory XLSX</h2>
        <div className="flex flex-wrap gap-3 items-end">
          <label className="text-sm">
            Effective date
            <input
              type="date"
              className="ml-2 rounded border px-2 py-1"
              value={effectiveDate}
              onChange={(e) => setEffectiveDate(e.target.value)}
            />
          </label>
          <label className="text-sm">
            Valuation source
            <input
              className="ml-2 rounded border px-2 py-1 min-w-[200px]"
              value={valuationSource}
              onChange={(e) => setValuationSource(e.target.value)}
            />
          </label>
          <label className="text-sm flex items-center gap-2">
            <input type="checkbox" checked={allowMismatch} onChange={(e) => setAllowMismatch(e.target.checked)} />
            Allow qty mismatch override
          </label>
          <input type="file" accept=".xlsx" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          <a
            href="/api/admin/accounting/inventory/opening/template"
            className="rounded bg-neutral-100 px-3 py-2 text-sm hover:bg-neutral-200"
          >
            Download template
          </a>
          <button
            type="button"
            disabled={busy}
            onClick={() => void runPreview()}
            className="rounded bg-[#1e3a2f] px-3 py-2 text-sm text-white disabled:opacity-50"
          >
            Preview import
          </button>
          <button
            type="button"
            disabled={busy || !preview?.canSaveDraft}
            onClick={() => void runSaveDraft()}
            className="rounded bg-amber-700 px-3 py-2 text-sm text-white disabled:opacity-50"
          >
            Save draft batch
          </button>
          <button
            type="button"
            disabled={busy || !batchId}
            onClick={() => void runPost()}
            className="rounded bg-emerald-700 px-3 py-2 text-sm text-white disabled:opacity-50"
          >
            Post opening batch
          </button>
        </div>

        {preview ? (
          <div className="text-sm space-y-2">
            <p>
              Preview: {String(preview.totals && (preview.totals as Record<string, number>).physicalSkuCount)} SKUs,{" "}
              {formatPaise((preview.totals as Record<string, number>)?.valueInPaise)} total
            </p>
            {previewErrors.length > 0 ? (
              <ul className="text-red-700 text-xs max-h-32 overflow-auto">
                {previewErrors.slice(0, 20).map((e, i) => (
                  <li key={i}>
                    {String(e.sku)} — {String(e.code)}: {String(e.message)}
                  </li>
                ))}
              </ul>
            ) : null}
            <div className="max-h-48 overflow-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left border-b">
                    <th className="py-1">SKU</th>
                    <th>Qty</th>
                    <th>Cost</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {previewRows.slice(0, 50).map((r) => (
                    <tr key={String(r.sku)} className="border-b border-neutral-100">
                      <td className="py-1">{String(r.sku)}</td>
                      <td>{String(r.openingQuantity)}</td>
                      <td>{formatPaise(r.unitCostInPaise as number)}</td>
                      <td>{r.excluded ? "excluded" : r.quantityMismatch ? "qty mismatch" : "ok"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        {batchId ? <p className="text-xs text-neutral-600">Draft batch: {batchId}</p> : null}
      </section>

      <section className="rounded-lg border bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">Physical inventory reconciliation (sample)</h2>
          <button
            type="button"
            disabled={busy}
            onClick={() => void loadRecon()}
            className="rounded bg-neutral-100 px-3 py-1 text-sm"
          >
            Refresh
          </button>
        </div>
        <div className="overflow-auto max-h-96">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left border-b">
                <th className="py-1 pr-2">SKU</th>
                <th className="pr-2">onHand</th>
                <th className="pr-2">Layers</th>
                <th className="pr-2">Value</th>
                <th className="pr-2">Consumed</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 100).map((r) => (
                <tr key={String(r.variantId)} className="border-b border-neutral-100">
                  <td className="py-1 pr-2">{String(r.sku)}</td>
                  <td className="pr-2">{String(r.operationalOnHand)}</td>
                  <td className="pr-2">{String(r.nativeLayerQuantity)}</td>
                  <td className="pr-2">{formatPaise(r.nativeInventoryValueInPaise as number)}</td>
                  <td className="pr-2">{String(r.consumedQty ?? "—")}</td>
                  <td>{String(r.openingStatus)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {batches.length > 0 ? (
        <section className="rounded-lg border bg-white p-4 text-sm">
          <h2 className="font-semibold mb-2">Opening batches</h2>
          <ul className="space-y-1 text-xs">
            {batches.map((b) => (
              <li key={String(b.id)}>
                {String(b.batchNumber)} — {String(b.status)} — {formatPaise(b.totalValueInPaise as number)}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
