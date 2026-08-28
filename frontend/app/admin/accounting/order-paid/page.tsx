"use client";

import { useState } from "react";
import { AdminConfirmModal } from "@/components/admin/AdminConfirmModal";
import {
  discoverOrderPaidAccounting,
  fetchAccountingStatus,
  formatInrPaise,
  postOrderPaidAccounting,
  previewOrderPaidAccounting,
  type OrderPaidPreview
} from "@/lib/accounting-api";
import { AdminApiError } from "@/lib/admin-errors";
import {
  AccountingAlert,
  AccountingEmptyState,
  AccountingSectionCard,
  AccountingSectionHeader,
  AccountingStatusBadge,
  SalesPageShell,
  SalesTableWrap,
  accountLabel,
  accountingButtonClass,
  accountingInputClass,
  fieldLabelClass,
  humanizePostingError,
  lineRoleLabel,
  moneyClass,
  providerLabel,
  salesEligibilityLabel,
  salesTd,
  salesTh,
  softUnavailableMessage
} from "@/components/admin/accounting/sales/sales-ui";

export default function AdminSalesEntriesPage() {
  const [orderNumber, setOrderNumber] = useState("");
  const [preview, setPreview] = useState<OrderPaidPreview | null>(null);
  const [salesPostingEnabled, setSalesPostingEnabled] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [findResults, setFindResults] = useState<Array<{
    orderNumber: string;
    action: string;
    error?: string;
  }> | null>(null);

  async function loadStatus() {
    const s = await fetchAccountingStatus();
    setSalesPostingEnabled(s.salesPostingEnabled);
  }

  async function handlePreview() {
    setLoading(true);
    setError(null);
    setMessage(null);
    setShowDetails(false);
    try {
      await loadStatus();
      const data = await previewOrderPaidAccounting({ orderNumber: orderNumber.trim() });
      setPreview(data);
    } catch (err) {
      setPreview(null);
      setError(
        humanizePostingError(err instanceof AdminApiError ? err.message : "Preview failed")
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleRecord() {
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const result = await postOrderPaidAccounting({ orderNumber: orderNumber.trim() });
      setConfirmOpen(false);
      setMessage(
        result.duplicate
          ? `Already recorded — journal ${result.journal.entryNumber}`
          : `Sales entry recorded — journal ${result.journal.entryNumber}`
      );
      await handlePreview();
    } catch (err) {
      setConfirmOpen(false);
      setError(
        humanizePostingError(err instanceof AdminApiError ? err.message : "Recording failed")
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleFindUnrecorded() {
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const result = await discoverOrderPaidAccounting({
        orderNumber: orderNumber.trim() || undefined,
        dryRun: true,
        limit: orderNumber.trim() ? 1 : 10
      });
      setFindResults(result.results);
      setMessage(
        result.eligible > 0
          ? `Found ${result.eligible} unrecorded eligible order${result.eligible === 1 ? "" : "s"} (of ${result.scanned} reviewed).`
          : `No unrecorded eligible sales found among ${result.scanned} reviewed.`
      );
    } catch (err) {
      setFindResults(null);
      setError(
        humanizePostingError(
          err instanceof AdminApiError ? err.message : "Could not find unrecorded sales"
        )
      );
    } finally {
      setLoading(false);
    }
  }

  const eligibility = preview
    ? salesEligibilityLabel({
        eligible: preview.eligibility.eligible,
        code: preview.eligibility.code,
        reason: preview.eligibility.reason,
        postingStatus: preview.postingEvent?.status,
        journalNumber: preview.postingEvent?.journalEntry?.entryNumber
      })
    : null;

  const canRecord =
    Boolean(preview?.eligibility.eligible) &&
    Boolean(preview?.proposal) &&
    salesPostingEnabled &&
    preview?.postingEvent?.status !== "POSTED" &&
    !preview?.postingEvent?.journalEntry?.entryNumber;

  const totalDebit = preview?.proposal?.totalDebitPaise ?? 0;
  const totalCredit = preview?.proposal?.totalCreditPaise ?? 0;

  return (
    <SalesPageShell
      title="Sales Entries"
      subtitle="Record paid customer orders in the accounting books."
    >
      {!salesPostingEnabled && preview ? (
        <AccountingAlert tone="warning">{softUnavailableMessage("sales")}</AccountingAlert>
      ) : null}

      <AccountingSectionCard>
        <AccountingSectionHeader
          title="Look up order"
          description="Enter an order number to preview the accounting entry."
        />
        <div className="flex flex-wrap items-end gap-3">
          <label className="min-w-[240px] flex-1">
            <span className={fieldLabelClass()}>Order Number</span>
            <input
              className={accountingInputClass()}
              value={orderNumber}
              onChange={(e) => setOrderNumber(e.target.value)}
              placeholder="SRV-20260800001"
              disabled={loading}
            />
          </label>
          <button
            type="button"
            disabled={loading || !orderNumber.trim()}
            onClick={() => void handlePreview()}
            className={accountingButtonClass("primary")}
          >
            {loading ? "Working…" : "Preview Entry"}
          </button>
          <button
            type="button"
            disabled={loading || !canRecord}
            onClick={() => setConfirmOpen(true)}
            className={accountingButtonClass("secondary")}
          >
            Record Sales Entry
          </button>
        </div>
        <div className="mt-3">
          <button
            type="button"
            disabled={loading}
            onClick={() => void handleFindUnrecorded()}
            className="text-xs font-medium text-[#8a7060] underline-offset-2 hover:text-[#1c352a] hover:underline"
          >
            Find unrecorded orders
          </button>
        </div>
      </AccountingSectionCard>

      {error ? <AccountingAlert tone="error">{error}</AccountingAlert> : null}
      {message ? <AccountingAlert tone="success">{message}</AccountingAlert> : null}

      {findResults && findResults.length > 0 ? (
        <AccountingSectionCard>
          <AccountingSectionHeader title="Sales Entries to Review" />
          <SalesTableWrap>
            <table className="min-w-full">
              <thead>
                <tr>
                  <th className={salesTh()}>Order</th>
                  <th className={salesTh()}>Status</th>
                  <th className={salesTh()}>Action</th>
                </tr>
              </thead>
              <tbody>
                {findResults.map((row) => (
                  <tr key={row.orderNumber} className="border-t border-[#eee8e0]">
                    <td className={salesTd()}>{row.orderNumber}</td>
                    <td className={salesTd()}>
                      {row.action === "eligible" || row.action === "would_post"
                        ? "Eligible"
                        : row.action === "posted" || row.action === "already_posted"
                          ? "Already recorded"
                          : row.error
                            ? "Needs review"
                            : row.action.replace(/_/g, " ")}
                    </td>
                    <td className={salesTd()}>
                      <button
                        type="button"
                        className="text-xs font-semibold text-[#1c352a] underline-offset-2 hover:underline"
                        onClick={() => {
                          setOrderNumber(row.orderNumber);
                          void (async () => {
                            setOrderNumber(row.orderNumber);
                            setLoading(true);
                            setError(null);
                            try {
                              await loadStatus();
                              const data = await previewOrderPaidAccounting({
                                orderNumber: row.orderNumber
                              });
                              setPreview(data);
                            } catch (err) {
                              setError(
                                humanizePostingError(
                                  err instanceof AdminApiError ? err.message : "Preview failed"
                                )
                              );
                            } finally {
                              setLoading(false);
                            }
                          })();
                        }}
                      >
                        Preview Entry
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </SalesTableWrap>
        </AccountingSectionCard>
      ) : null}

      {!preview ? (
        <AccountingEmptyState
          title="No sales entry selected"
          description="Enter an order number to preview the accounting entry."
        />
      ) : (
        <div className="space-y-4">
          <AccountingSectionCard>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <AccountingSectionHeader title="Order" />
              {eligibility ? (
                <AccountingStatusBadge tone={eligibility.tone}>{eligibility.label}</AccountingStatusBadge>
              ) : null}
            </div>
            <dl className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-sm">
              <div>
                <dt className="text-xs text-[#8a7060]">Order</dt>
                <dd className="font-semibold text-[#2c2420]">{preview.snapshot.orderNumber}</dd>
              </div>
              <div>
                <dt className="text-xs text-[#8a7060]">Payment provider</dt>
                <dd className="font-semibold text-[#2c2420]">
                  {providerLabel(preview.snapshot.payment.provider)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-[#8a7060]">Order total</dt>
                <dd className={moneyClass()}>
                  {formatInrPaise(preview.snapshot.grandTotalInPaise)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-[#8a7060]">Payment status</dt>
                <dd className="font-semibold text-[#2c2420]">
                  {preview.snapshot.payment.status.replace(/_/g, " ")}
                </dd>
              </div>
            </dl>
            {eligibility?.detail ? (
              <div className="mt-3">
                <button
                  type="button"
                  className="text-xs text-[#8a7060] underline-offset-2 hover:underline"
                  onClick={() => setShowDetails((v) => !v)}
                >
                  {showDetails ? "Hide details" : "Show details"}
                </button>
                {showDetails ? (
                  <p className="mt-1 text-xs leading-relaxed text-[#6b5c52]">{eligibility.detail}</p>
                ) : null}
              </div>
            ) : null}
            {preview.buildError ? (
              <AccountingAlert tone="error" title="Could not build entry">
                {preview.buildError.message}
              </AccountingAlert>
            ) : null}
          </AccountingSectionCard>

          {preview.proposal ? (
            <AccountingSectionCard>
              <AccountingSectionHeader
                title="Accounting Entry"
                description="This records revenue and clearing in the books. It does not mean money has reached the bank."
              />
              <SalesTableWrap>
                <table className="min-w-full">
                  <thead>
                    <tr>
                      <th className={salesTh()}>Account</th>
                      <th className={salesTh(true)}>Debit</th>
                      <th className={salesTh(true)}>Credit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.proposal.lines.map((line, i) => {
                      const acc = accountLabel(line.accountCode, line.accountName);
                      const role = lineRoleLabel(line.accountCode, line.amountSource, line.accountName);
                      return (
                        <tr key={i} className="border-t border-[#eee8e0]">
                          <td className={salesTd()}>
                            <span className="font-medium text-[#2c2420]">{role || acc.primary}</span>
                            <span className="mt-0.5 block text-[11px] text-[#8a7060]">
                              {acc.code}
                              {acc.primary !== role ? ` · ${acc.primary}` : ""}
                            </span>
                          </td>
                          <td className={`${salesTd(true)} ${moneyClass()}`}>
                            {line.debitInPaise ? formatInrPaise(line.debitInPaise) : "—"}
                          </td>
                          <td className={`${salesTd(true)} ${moneyClass()}`}>
                            {line.creditInPaise ? formatInrPaise(line.creditInPaise) : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-[#e0d8ce] bg-[#faf5ec]/60">
                      <td className={`${salesTd()} font-semibold`}>Totals</td>
                      <td className={`${salesTd(true)} ${moneyClass()}`}>
                        {formatInrPaise(totalDebit)}
                      </td>
                      <td className={`${salesTd(true)} ${moneyClass()}`}>
                        {formatInrPaise(totalCredit)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </SalesTableWrap>
              {!preview.proposal.balanced ? (
                <p className="mt-2 text-xs text-amber-800">
                  Entry does not balance. Recording is blocked until this is resolved.
                </p>
              ) : null}
            </AccountingSectionCard>
          ) : preview.eligibility.eligible === false ? (
            <AccountingEmptyState
              title="Already recorded"
              description={
                eligibility?.label === "Already recorded"
                  ? "This order has already been recorded in accounting."
                  : "This order is not eligible to record as a sales entry."
              }
            />
          ) : null}
        </div>
      )}

      <AdminConfirmModal
        open={confirmOpen}
        title="Record sales entry?"
        message="This records the paid order in the accounting books. It does not mean the money has reached the bank yet. Gateway collections remain in clearing until settlement."
        details={[
          `Order: ${preview?.snapshot.orderNumber ?? orderNumber}`,
          `Amount: ${formatInrPaise(preview?.snapshot.grandTotalInPaise ?? 0)}`,
          `Payment provider: ${providerLabel(preview?.snapshot.payment.provider)}`
        ]}
        confirmLabel="Record Sales Entry"
        cancelLabel="Cancel"
        busy={loading}
        onConfirm={() => void handleRecord()}
        onClose={() => setConfirmOpen(false)}
      />
    </SalesPageShell>
  );
}
