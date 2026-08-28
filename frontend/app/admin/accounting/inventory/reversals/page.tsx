"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AdminConfirmModal } from "@/components/admin/AdminConfirmModal";
import {
  discoverInventoryCogsReversalAccounting,
  formatInrPaise,
  postInventoryCogsReversalAccounting,
  previewInventoryCogsReversalAccounting
} from "@/lib/accounting-api";
import { AdminApiError } from "@/lib/admin-errors";
import {
  AccountingAlert,
  AccountingEmptyState,
  AccountingSectionCard,
  AccountingSectionHeader,
  InventoryPageShell,
  InventoryTableWrap,
  PreviewFact,
  accountingButtonClass,
  accountingInputClass,
  fieldLabelClass,
  humanizeInventoryError,
  invTd,
  invTh,
  moneyClass
} from "@/components/admin/accounting/inventory/inventory-ui";

type Row = Record<string, unknown>;

export default function InventoryReversalsPage() {
  const searchParams = useSearchParams();
  const autoFind = useRef(false);
  const [restockEventId, setRestockEventId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [findRows, setFindRows] = useState<Row[] | null>(null);
  const [preview, setPreview] = useState<Record<string, unknown> | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  async function handleFind() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const data = await discoverInventoryCogsReversalAccounting({ dryRun: true, limit: 25 });
      const results = (data.results as Row[]) ?? [];
      setFindRows(results);
      const eligible = results.filter(
        (r) => r.status === "dry_run_eligible" || r.status === "eligible"
      );
      setMessage(
        eligible.length > 0
          ? `Found ${eligible.length} eligible return${eligible.length === 1 ? "" : "s"} to review.`
          : "No eligible inventory cost reversals."
      );
    } catch (e) {
      setError(humanizeInventoryError(e instanceof AdminApiError ? e.message : "Find failed"));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (autoFind.current) return;
    if (searchParams.get("find") === "1") {
      autoFind.current = true;
      void handleFind();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  async function handlePreview(id?: string) {
    const rid = (id ?? restockEventId).trim();
    if (!rid) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      setRestockEventId(rid);
      setPreview(await previewInventoryCogsReversalAccounting({ restockEventId: rid }));
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
      await postInventoryCogsReversalAccounting({ restockEventId: restockEventId.trim() });
      setConfirmOpen(false);
      setMessage("Reversal recorded");
      await handlePreview(restockEventId.trim());
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
  const snapshot = preview?.snapshot as
    | {
        orderNumber?: string;
        orderId?: string;
        restockQuantity?: number;
        disposition?: string;
        sku?: string;
        productName?: string;
        inventoryIncremented?: boolean;
      }
    | undefined;
  const proposal = preview?.proposal as
    | { totalCostInPaise?: number; quantityReversed?: number }
    | null
    | undefined;
  const journal = preview?.journalProposal as
    | { totalCostInPaise?: number }
    | undefined;

  const total =
    proposal?.totalCostInPaise ?? journal?.totalCostInPaise ?? 0;
  const qty = proposal?.quantityReversed ?? snapshot?.restockQuantity ?? 0;
  const canRecord = Boolean(eligibility?.eligible && total > 0);

  function statusLabel(row: Row): string {
    const st = String(row.status ?? "");
    const code = String(row.code ?? "");
    if (st === "dry_run_eligible" || st === "eligible") return "Ready to restore inventory cost";
    if (st === "posted" || st === "duplicate" || code === "ALREADY_POSTED") return "Already recorded";
    if (code === "NO_ACCOUNTING_RESTOCK_REQUIRED" || code === "DAMAGED_NO_RESTOCK_VALUE") {
      return "No inventory cost reversal required";
    }
    if (code.includes("COST") || code.includes("GAP")) return "Cost information needs review";
    return "Needs review";
  }

  return (
    <InventoryPageShell
      title="Inventory Cost Reversals"
      subtitle="Review eligible returned inventory and reverse the related cost of goods sold."
    >
      {error ? <AccountingAlert tone="error">{error}</AccountingAlert> : null}
      {message ? <AccountingAlert tone="success">{message}</AccountingAlert> : null}

      <AccountingSectionCard>
        <AccountingSectionHeader
          title="Look up return"
          description="Select an eligible return from the worklist, or enter a restock reference to preview."
        />
        <div className="flex flex-wrap items-end gap-3">
          <label className="min-w-[280px] flex-1">
            <span className={fieldLabelClass()}>Restock reference</span>
            <input
              className={accountingInputClass()}
              value={restockEventId}
              onChange={(e) => setRestockEventId(e.target.value)}
              placeholder="Restock event reference"
              disabled={busy}
            />
          </label>
          <button
            type="button"
            disabled={busy || !restockEventId.trim()}
            onClick={() => void handlePreview()}
            className={accountingButtonClass("primary")}
          >
            {busy ? "Working…" : "Preview Reversal"}
          </button>
          <button
            type="button"
            disabled={busy || !canRecord}
            onClick={() => setConfirmOpen(true)}
            className={accountingButtonClass("secondary")}
          >
            Record Inventory Cost Reversal
          </button>
        </div>
        <div className="mt-4 border-t border-[#ebe4db] pt-3">
          <p className="mb-2 text-xs text-[#8a7060]">
            Or scan for eligible sellable returns that need cost restored.
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleFind()}
            className={accountingButtonClass("secondary", true)}
          >
            Find Returns to Review
          </button>
        </div>
      </AccountingSectionCard>

      {findRows && findRows.length > 0 ? (
        <AccountingSectionCard>
          <AccountingSectionHeader title="Returns to Review" />
          <InventoryTableWrap>
            <table className="min-w-full">
              <thead>
                <tr>
                  <th className={invTh()}>Order</th>
                  <th className={invTh()}>Return status</th>
                  <th className={invTh()}>Accounting status</th>
                  <th className={invTh()}>Action</th>
                </tr>
              </thead>
              <tbody>
                {findRows.map((r, i) => (
                  <tr key={`${String(r.restockEventId)}-${i}`} className="border-t border-[#eee8e0]">
                    <td className={invTd()}>{String(r.orderId ?? "—").slice(0, 8)}…</td>
                    <td className={invTd()}>
                      {String(r.code ?? r.status ?? "—")
                        .replace(/_/g, " ")
                        .toLowerCase()
                        .replace(/\b\w/g, (c) => c.toUpperCase())}
                    </td>
                    <td className={invTd()}>{statusLabel(r)}</td>
                    <td className={invTd()}>
                      <button
                        type="button"
                        className="text-xs font-semibold text-[#1c352a] underline-offset-2 hover:underline"
                        onClick={() => void handlePreview(String(r.restockEventId))}
                      >
                        Preview
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </InventoryTableWrap>
        </AccountingSectionCard>
      ) : findRows && findRows.length === 0 ? (
        <AccountingEmptyState title="No eligible inventory cost reversals" />
      ) : null}

      {!preview && !findRows ? (
        <AccountingEmptyState
          title="No eligible inventory cost reversals selected"
          description="Find returns to review, or enter a restock reference to preview."
        />
      ) : null}

      {preview ? (
        <div className="space-y-4">
          <AccountingSectionCard>
            <AccountingSectionHeader title="Reversal preview" />
            <dl className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
              <PreviewFact label="Original Order">
                {String(snapshot?.orderNumber ?? snapshot?.orderId ?? "—")}
              </PreviewFact>
              <PreviewFact label="Returned Product">
                {String(snapshot?.productName ?? "—")}
              </PreviewFact>
              <PreviewFact label="SKU">{String(snapshot?.sku ?? "—")}</PreviewFact>
              <PreviewFact label="Quantity">{String(qty)}</PreviewFact>
              <PreviewFact label="Original Inventory Cost" emphasize>
                {formatInrPaise(total)}
              </PreviewFact>
              <PreviewFact label="Inventory Value Restored" emphasize>
                {formatInrPaise(total)}
              </PreviewFact>
              <PreviewFact label="Return disposition">
                {String(snapshot?.disposition ?? "—")}
              </PreviewFact>
              {snapshot?.inventoryIncremented != null ? (
                <PreviewFact label="Operational stock note">
                  {snapshot.inventoryIncremented
                    ? "Ops already increased on-hand for this sellable restock"
                    : "Ops did not increase on-hand for this restock"}
                </PreviewFact>
              ) : null}
            </dl>
            <p className="mt-3 text-sm leading-relaxed text-[#6b5c52]">
              This reverses the inventory cost accounting for the eligible return. It does not by
              itself change operational on-hand quantity.
            </p>
          </AccountingSectionCard>

          {total > 0 ? (
            <AccountingSectionCard>
              <AccountingSectionHeader title="Accounting Impact" />
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
                      <td className={`${invTd(true)} ${moneyClass()}`}>{formatInrPaise(total)}</td>
                      <td className={invTd(true)}>—</td>
                    </tr>
                    <tr className="border-t border-[#eee8e0]">
                      <td className={invTd()}>
                        Cost of Goods Sold
                        <span className="mt-0.5 block text-[11px] text-[#8a7060]">5000</span>
                      </td>
                      <td className={invTd(true)}>—</td>
                      <td className={`${invTd(true)} ${moneyClass()}`}>{formatInrPaise(total)}</td>
                    </tr>
                  </tbody>
                </table>
              </InventoryTableWrap>
            </AccountingSectionCard>
          ) : eligibility?.reason ? (
            <AccountingAlert tone="warning">{eligibility.reason}</AccountingAlert>
          ) : null}
        </div>
      ) : null}

      <AdminConfirmModal
        open={confirmOpen}
        title="Record inventory cost reversal?"
        message="This restores the eligible returned inventory value in accounting and reverses the related cost of goods sold."
        details={[
          `Order: ${String(snapshot?.orderNumber ?? snapshot?.orderId ?? "—")}`,
          `Quantity: ${qty}`,
          `Value restored: ${formatInrPaise(total)}`
        ]}
        confirmLabel="Record Reversal"
        cancelLabel="Cancel"
        busy={busy}
        onConfirm={() => void handleRecord()}
        onClose={() => setConfirmOpen(false)}
      />
    </InventoryPageShell>
  );
}
