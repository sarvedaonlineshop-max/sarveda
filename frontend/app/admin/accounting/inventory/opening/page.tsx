"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AdminConfirmModal } from "@/components/admin/AdminConfirmModal";
import {
  fetchInventoryOpeningBatches,
  formatInrPaise,
  postInventoryOpeningBatch,
  previewInventoryOpeningUpload,
  saveInventoryOpeningDraft
} from "@/lib/accounting-api";
import {
  AccountingAlert,
  AccountingEmptyState,
  AccountingPageHeader,
  AccountingSectionCard,
  AccountingSectionHeader,
  InventoryTableWrap,
  accountingButtonClass,
  accountingInputClass,
  fieldLabelClass,
  humanizeInventoryError,
  invTd,
  invTh,
  moneyClass
} from "@/components/admin/accounting/inventory/inventory-ui";

/**
 * Inventory opening XLSX — Advanced / cutover only.
 * Not listed in day-to-day Inventory Accounting tabs.
 */
export default function InventoryOpeningAdvancedPage() {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [preview, setPreview] = useState<Record<string, unknown> | null>(null);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [batches, setBatches] = useState<Array<Record<string, unknown>>>([]);
  const [effectiveDate, setEffectiveDate] = useState(new Date().toISOString().slice(0, 10));
  const [valuationSource, setValuationSource] = useState("Reviewed spreadsheet");
  const [allowMismatch, setAllowMismatch] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const loadBatches = useCallback(async () => {
    const b = await fetchInventoryOpeningBatches();
    setBatches(b.batches);
  }, []);

  useEffect(() => {
    void loadBatches().catch(() => undefined);
  }, [loadBatches]);

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
      setErr(humanizeInventoryError(e instanceof Error ? e.message : "Preview failed"));
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
      setMsg("Draft batch saved");
      await loadBatches();
    } catch (e) {
      setErr(humanizeInventoryError(e instanceof Error ? e.message : "Save draft failed"));
    } finally {
      setBusy(false);
    }
  }

  async function runPost() {
    if (!batchId) return;
    setBusy(true);
    setErr(null);
    try {
      await postInventoryOpeningBatch(batchId);
      setConfirmOpen(false);
      setMsg("Opening inventory recorded");
      await loadBatches();
    } catch (e) {
      setConfirmOpen(false);
      setErr(humanizeInventoryError(e instanceof Error ? e.message : "Post failed"));
    } finally {
      setBusy(false);
    }
  }

  const previewRows = (preview?.rows as Array<Record<string, unknown>>) ?? [];
  const previewErrors = (preview?.errors as Array<Record<string, unknown>>) ?? [];
  const totals = preview?.totals as Record<string, number> | undefined;

  return (
    <div className="mx-auto max-w-[1600px] space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <AccountingPageHeader
        title="Inventory Opening"
        subtitle="Import opening inventory quantities and costs for accounting cutover. Advanced cutover tool only."
      />
      <div className="rounded-[10px] border border-[#ebe4db] bg-[#faf5ec]/70 px-3 py-2 text-[12px] text-[#6b5c52]">
        <span className="font-semibold text-[#8a7060]">Advanced</span>
        <span className="mx-2 text-[#d4c4b0]">·</span>
        Low-frequency cutover tool — not part of daily inventory accounting.
      </div>
        <Link
          href="/admin/accounting/opening"
          className="text-xs font-semibold text-[#1c352a] underline-offset-2 hover:underline"
        >
          Full Opening Balances →
        </Link>
      </div>

      <AccountingAlert tone="warning">
        Posting opening inventory records accounting inventory values and journal entries. Use only for
        cutover or authorized setup.
      </AccountingAlert>

      {err ? <AccountingAlert tone="error">{err}</AccountingAlert> : null}
      {msg ? <AccountingAlert tone="success">{msg}</AccountingAlert> : null}

      <AccountingSectionCard>
        <AccountingSectionHeader title="Upload opening spreadsheet" />
        <div className="flex flex-wrap items-end gap-3">
          <label>
            <span className={fieldLabelClass()}>Effective date</span>
            <input
              type="date"
              className={accountingInputClass()}
              value={effectiveDate}
              onChange={(e) => setEffectiveDate(e.target.value)}
            />
          </label>
          <label className="min-w-[200px]">
            <span className={fieldLabelClass()}>Valuation source</span>
            <input
              className={accountingInputClass()}
              value={valuationSource}
              onChange={(e) => setValuationSource(e.target.value)}
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-[#6b5c52]">
            <input
              type="checkbox"
              checked={allowMismatch}
              onChange={(e) => setAllowMismatch(e.target.checked)}
            />
            Allow quantity mismatch override
          </label>
          <input
            type="file"
            accept=".xlsx"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          <a
            href="/api/admin/accounting/inventory/opening/template"
            className={accountingButtonClass("secondary", true)}
          >
            Download template
          </a>
          <button
            type="button"
            disabled={busy}
            onClick={() => void runPreview()}
            className={accountingButtonClass("primary")}
          >
            Preview import
          </button>
          <button
            type="button"
            disabled={busy || !preview?.canSaveDraft}
            onClick={() => void runSaveDraft()}
            className={accountingButtonClass("secondary")}
          >
            Save draft batch
          </button>
          <button
            type="button"
            disabled={busy || !batchId}
            onClick={() => setConfirmOpen(true)}
            className={accountingButtonClass("secondary")}
          >
            Post Opening Inventory
          </button>
        </div>

        {preview ? (
          <div className="mt-4 space-y-2 text-sm">
            <p>
              Preview: {String(totals?.physicalSkuCount ?? "—")} SKUs ·{" "}
              <span className={moneyClass()}>{formatInrPaise(totals?.valueInPaise ?? 0)}</span> total
            </p>
            {previewErrors.length > 0 ? (
              <ul className="max-h-32 overflow-auto text-xs text-red-700">
                {previewErrors.slice(0, 20).map((e, i) => (
                  <li key={i}>
                    {String(e.sku)} — {String(e.message)}
                  </li>
                ))}
              </ul>
            ) : null}
            <InventoryTableWrap>
              <table className="min-w-full">
                <thead>
                  <tr>
                    <th className={invTh()}>SKU</th>
                    <th className={invTh(true)}>Qty</th>
                    <th className={invTh(true)}>Unit Cost</th>
                    <th className={invTh()}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {previewRows.slice(0, 50).map((r) => (
                    <tr key={String(r.sku)} className="border-t border-[#eee8e0]">
                      <td className={invTd()}>{String(r.sku)}</td>
                      <td className={`${invTd(true)} tabular-nums`}>
                        {String(r.openingQuantity)}
                      </td>
                      <td className={`${invTd(true)} ${moneyClass()}`}>
                        {formatInrPaise(Number(r.unitCostInPaise ?? 0))}
                      </td>
                      <td className={invTd()}>
                        {r.excluded ? "Excluded" : r.quantityMismatch ? "Qty mismatch" : "OK"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </InventoryTableWrap>
            {batchId ? (
              <p className="text-xs text-[#8a7060]">Draft batch ready to post.</p>
            ) : null}
          </div>
        ) : null}
      </AccountingSectionCard>

      <AccountingSectionCard>
        <AccountingSectionHeader title="Opening batches" />
        {batches.length === 0 ? (
          <AccountingEmptyState title="No inventory opening batches yet" />
        ) : (
          <ul className="space-y-1 text-sm">
            {batches.map((b) => (
              <li key={String(b.id)} className="flex flex-wrap gap-2 text-[#2c2420]">
                <span className="font-medium">{String(b.batchNumber)}</span>
                <span className="text-[#8a7060]">{String(b.status)}</span>
                <span className={moneyClass()}>
                  {formatInrPaise(Number(b.totalValueInPaise ?? 0))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </AccountingSectionCard>

      <p className="text-xs text-[#8a7060]">
        <Link href="/admin/accounting/inventory" className="underline-offset-2 hover:underline">
          ← Back to Inventory Accounting
        </Link>
      </p>

      <AdminConfirmModal
        open={confirmOpen}
        title="Post opening inventory?"
        message="This creates cutover accounting entries for opening inventory quantities and costs. Use only for authorized go-live cutover."
        details={[
          batchId ? `Batch ready` : "No batch",
          totals ? `SKUs: ${totals.physicalSkuCount}` : "",
          totals ? `Total: ${formatInrPaise(totals.valueInPaise ?? 0)}` : ""
        ].filter(Boolean)}
        confirmLabel="Post Opening Inventory"
        cancelLabel="Cancel"
        danger
        busy={busy}
        onConfirm={() => void runPost()}
        onClose={() => setConfirmOpen(false)}
      />
    </div>
  );
}
