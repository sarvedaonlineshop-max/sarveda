"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AdminConfirmModal } from "@/components/admin/AdminConfirmModal";
import {
  discoverPurchaseCapitalization,
  fetchPurchaseCapitalizationClearing,
  formatInrPaise,
  postPurchaseCapitalization,
  previewPurchaseCapitalization
} from "@/lib/accounting-api";
import { AdminApiError } from "@/lib/admin-errors";
import {
  AccountingAlert,
  AccountingEmptyState,
  AccountingSectionCard,
  AccountingSectionHeader,
  AccountingStatusBadge,
  InventoryPageShell,
  InventorySkeleton,
  InventoryTableWrap,
  PreviewFact,
  accountingButtonClass,
  accountingInputClass,
  clearingStatusLabel,
  fieldLabelClass,
  humanizeInventoryError,
  inventoryStatusTone,
  invTd,
  invTh,
  moneyClass
} from "@/components/admin/accounting/inventory/inventory-ui";

type Row = Record<string, unknown>;

export default function InventoryCapitalizationPage() {
  const searchParams = useSearchParams();
  const autoFind = useRef(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [clearingRows, setClearingRows] = useState<Row[]>([]);
  const [findRows, setFindRows] = useState<Row[] | null>(null);
  const [receiptLineId, setReceiptLineId] = useState("");
  const [preview, setPreview] = useState<Record<string, unknown> | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  async function loadClearing() {
    const data = await fetchPurchaseCapitalizationClearing({ limit: 100 });
    setClearingRows((data.rows as Row[]) ?? []);
  }

  useEffect(() => {
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        await loadClearing();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not load purchases.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function handleFind() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const data = await discoverPurchaseCapitalization({ dryRun: true, limit: 25 });
      const rows = ((data.rows as Row[]) ?? []).filter((r) => r.receiptLineId && !r.error);
      setFindRows(rows);
      setMessage(
        rows.length > 0
          ? `Found ${rows.length} purchase receipt line${rows.length === 1 ? "" : "s"} to review.`
          : "No purchases waiting to be recorded."
      );
      await loadClearing();
    } catch (e) {
      setError(
        humanizeInventoryError(e instanceof AdminApiError ? e.message : "Find failed")
      );
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (autoFind.current) return;
    if (searchParams.get("find") === "1" && !loading) {
      autoFind.current = true;
      void handleFind();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, loading]);

  async function handlePreview(id?: string) {
    const rid = (id ?? receiptLineId).trim();
    if (!rid) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      setReceiptLineId(rid);
      setPreview(await previewPurchaseCapitalization(rid));
    } catch (e) {
      setPreview(null);
      setError(
        humanizeInventoryError(e instanceof AdminApiError ? e.message : "Preview failed")
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleRecord() {
    setBusy(true);
    setError(null);
    try {
      await postPurchaseCapitalization(receiptLineId.trim());
      setConfirmOpen(false);
      setMessage("Recorded");
      setPreview(await previewPurchaseCapitalization(receiptLineId.trim()));
      await loadClearing();
      await handleFind();
    } catch (e) {
      setConfirmOpen(false);
      setError(
        humanizeInventoryError(e instanceof AdminApiError ? e.message : "Recording failed")
      );
    } finally {
      setBusy(false);
    }
  }

  const eligibility = preview?.eligibility as
    | { eligible?: boolean; code?: string; reason?: string }
    | undefined;
  const snapshot = preview?.snapshot as Record<string, unknown> | undefined;
  const proposal = preview?.proposal as
    | {
        capitalizationValueInPaise?: number;
        unitCostInPaise?: number;
        quantityReceived?: number;
        lines?: Array<{ accountCode: string; debitInPaise: number; creditInPaise: number }>;
      }
    | null
    | undefined;

  const canRecord = Boolean(eligibility?.eligible && proposal && receiptLineId.trim());

  const impactInventory =
    proposal?.lines?.find((l) => l.accountCode === "1200")?.debitInPaise ??
    proposal?.capitalizationValueInPaise ??
    0;
  const impactClearing =
    proposal?.lines?.find((l) => l.accountCode === "1210")?.creditInPaise ??
    proposal?.capitalizationValueInPaise ??
    0;

  return (
    <InventoryPageShell
      title="Inventory Purchases"
      subtitle="Record received inventory into the Inventory Asset account after the related vendor bill has been recorded."
    >
      {error ? <AccountingAlert tone="error">{error}</AccountingAlert> : null}
      {message ? <AccountingAlert tone="success">{message}</AccountingAlert> : null}
      {loading ? <InventorySkeleton /> : null}

      {!loading ? (
        <>
          <AccountingSectionCard>
            <AccountingSectionHeader
              title="Look up receipt line"
              description="Enter a purchase receipt line reference to preview the inventory purchase entry."
            />
            <div className="flex flex-wrap items-end gap-3">
              <label className="min-w-[280px] flex-1">
                <span className={fieldLabelClass()}>Receipt line reference</span>
                <input
                  className={accountingInputClass()}
                  value={receiptLineId}
                  onChange={(e) => setReceiptLineId(e.target.value)}
                  placeholder="Receipt line ID"
                  disabled={busy}
                />
              </label>
              <button
                type="button"
                disabled={busy || !receiptLineId.trim()}
                onClick={() => void handlePreview()}
                className={accountingButtonClass("primary")}
              >
                {busy ? "Working…" : "Preview Entry"}
              </button>
              <button
                type="button"
                disabled={busy || !canRecord}
                onClick={() => setConfirmOpen(true)}
                className={accountingButtonClass("secondary")}
              >
                Record Inventory Purchase
              </button>
            </div>
            <div className="mt-4 border-t border-[#ebe4db] pt-3">
              <p className="mb-2 text-xs text-[#8a7060]">
                Or scan for received purchases that are ready to record.
              </p>
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleFind()}
                className={accountingButtonClass("secondary", true)}
              >
                Find Purchases to Record
              </button>
            </div>
          </AccountingSectionCard>

          {findRows && findRows.length > 0 ? (
            <AccountingSectionCard>
              <AccountingSectionHeader title="Purchases to Record" />
              <InventoryTableWrap>
                <table className="min-w-full">
                  <thead>
                    <tr>
                      <th className={invTh()}>SKU</th>
                      <th className={invTh(true)}>Quantity</th>
                      <th className={invTh(true)}>Inventory Value</th>
                      <th className={invTh()}>Status</th>
                      <th className={invTh()}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {findRows.map((r, i) => {
                      const elig = r.eligibility as { eligible?: boolean; code?: string } | undefined;
                      const prop = r.proposal as {
                        quantityReceived?: number;
                        capitalizationValueInPaise?: number;
                      } | null;
                      return (
                        <tr key={`${String(r.receiptLineId)}-${i}`} className="border-t border-[#eee8e0]">
                          <td className={invTd()}>{String(r.sku ?? "—")}</td>
                          <td className={`${invTd(true)} tabular-nums`}>
                            {prop?.quantityReceived ?? "—"}
                          </td>
                          <td className={`${invTd(true)} ${moneyClass()}`}>
                            {prop?.capitalizationValueInPaise != null
                              ? formatInrPaise(prop.capitalizationValueInPaise)
                              : "—"}
                          </td>
                          <td className={invTd()}>
                            {r.posted
                              ? "Already recorded"
                              : elig?.eligible
                                ? "Ready to record"
                                : "Needs review"}
                          </td>
                          <td className={invTd()}>
                            <button
                              type="button"
                              className="text-xs font-semibold text-[#1c352a] underline-offset-2 hover:underline"
                              onClick={() => void handlePreview(String(r.receiptLineId))}
                            >
                              Preview
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </InventoryTableWrap>
            </AccountingSectionCard>
          ) : findRows && findRows.length === 0 ? (
            <AccountingEmptyState title="No purchases waiting to be recorded" />
          ) : null}

          {preview ? (
            <AccountingSectionCard>
              <AccountingSectionHeader title="Inventory purchase preview" />
              <dl className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
                <PreviewFact label="Purchase / Bill">
                  {String(snapshot?.billNumber ?? "—")}
                </PreviewFact>
                <PreviewFact label="SKU">{String(snapshot?.sku ?? "—")}</PreviewFact>
                <PreviewFact label="Quantity">
                  {String(proposal?.quantityReceived ?? snapshot?.quantityReceived ?? "—")}
                </PreviewFact>
                <PreviewFact label="Unit Cost" emphasize>
                  {formatInrPaise(
                    Number(proposal?.unitCostInPaise ?? snapshot?.netUnitCostInPaise ?? 0)
                  )}
                </PreviewFact>
                <PreviewFact label="Inventory Value" emphasize>
                  {formatInrPaise(Number(proposal?.capitalizationValueInPaise ?? 0))}
                </PreviewFact>
                <PreviewFact label="Status">
                  {eligibility?.eligible
                    ? "Ready to record"
                    : eligibility?.code === "ALREADY_POSTED"
                      ? "Already recorded"
                      : "Needs review"}
                </PreviewFact>
              </dl>
              {proposal ? (
                <div className="mt-4">
                  <p className="mb-2 text-sm font-semibold text-[#2c2420]">Accounting Impact</p>
                  <InventoryTableWrap>
                    <table className="min-w-full">
                      <thead>
                        <tr>
                          <th className={invTh()}>Account</th>
                          <th className={invTh(true)}>Debit</th>
                          <th className={invTh(true)}>Credit</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="border-t border-[#eee8e0]">
                          <td className={invTd()}>
                            Inventory Asset
                            <span className="mt-0.5 block text-[11px] text-[#8a7060]">1200</span>
                          </td>
                          <td className={`${invTd(true)} ${moneyClass()}`}>
                            {formatInrPaise(impactInventory)}
                          </td>
                          <td className={invTd(true)}>—</td>
                        </tr>
                        <tr className="border-t border-[#eee8e0]">
                          <td className={invTd()}>
                            Inventory Purchases Clearing
                            <span className="mt-0.5 block text-[11px] text-[#8a7060]">1210</span>
                          </td>
                          <td className={invTd(true)}>—</td>
                          <td className={`${invTd(true)} ${moneyClass()}`}>
                            {formatInrPaise(impactClearing)}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </InventoryTableWrap>
                </div>
              ) : eligibility?.reason ? (
                <p className="mt-3 text-sm text-[#6b5c52]">{eligibility.reason}</p>
              ) : null}
            </AccountingSectionCard>
          ) : null}

          <AccountingSectionCard>
            <AccountingSectionHeader title="Purchase clearing status" />
            {clearingRows.length === 0 ? (
              <AccountingEmptyState title="No purchases waiting to be recorded" />
            ) : (
              <InventoryTableWrap>
                <table className="min-w-full">
                  <thead>
                    <tr>
                      <th className={invTh()}>Bill</th>
                      <th className={invTh()}>Purchase Order</th>
                      <th className={invTh()}>SKU</th>
                      <th className={invTh(true)}>Received</th>
                      <th className={invTh(true)}>Bill Qty</th>
                      <th className={invTh(true)}>Amount</th>
                      <th className={invTh()}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {clearingRows.slice(0, 50).map((r, i) => (
                      <tr key={`${String(r.vendorBillId)}-${i}`} className="border-t border-[#eee8e0]">
                        <td className={invTd()}>{String(r.billNumber)}</td>
                        <td className={invTd()}>{String(r.poNumber ?? "—")}</td>
                        <td className={invTd()}>{String(r.sku ?? "—")}</td>
                        <td className={`${invTd(true)} tabular-nums`}>
                          {String(r.receivedQuantity)}
                        </td>
                        <td className={`${invTd(true)} tabular-nums`}>
                          {String(r.billedQuantity)}
                        </td>
                        <td className={`${invTd(true)} ${moneyClass()}`}>
                          {formatInrPaise(Number(r.clearing1210OutstandingInPaise ?? 0))}
                        </td>
                        <td className={invTd()}>
                          <AccountingStatusBadge tone={inventoryStatusTone(String(r.status))}>
                            {clearingStatusLabel(String(r.status))}
                          </AccountingStatusBadge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </InventoryTableWrap>
            )}
          </AccountingSectionCard>
        </>
      ) : null}

      <AdminConfirmModal
        open={confirmOpen}
        title="Record inventory purchase?"
        message="This will record the received inventory value in accounting and create the related inventory cost layer."
        details={[
          `Purchase: ${String(snapshot?.billNumber ?? receiptLineId)}`,
          `Quantity: ${String(proposal?.quantityReceived ?? "—")}`,
          `Inventory value: ${formatInrPaise(Number(proposal?.capitalizationValueInPaise ?? 0))}`
        ]}
        confirmLabel="Record Inventory Purchase"
        cancelLabel="Cancel"
        busy={busy}
        onConfirm={() => void handleRecord()}
        onClose={() => setConfirmOpen(false)}
      />
    </InventoryPageShell>
  );
}
