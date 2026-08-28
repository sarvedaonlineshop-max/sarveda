"use client";

import { useState } from "react";
import { AdminConfirmModal } from "@/components/admin/AdminConfirmModal";
import {
  discoverOrderRefundedFullAccounting,
  fetchAccountingStatus,
  formatInrPaise,
  postOrderRefundedFullAccounting,
  previewOrderRefundedFullAccounting
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
  refundEligibilityLabel,
  salesTd,
  salesTh,
  softUnavailableMessage
} from "@/components/admin/accounting/sales/sales-ui";

type ProposalLine = {
  accountCode: string;
  accountName?: string;
  debitInPaise: number;
  creditInPaise: number;
  amountSource?: string;
};

export default function AdminRefundsPage() {
  const [orderNumber, setOrderNumber] = useState("");
  const [preview, setPreview] = useState<Record<string, unknown> | null>(null);
  const [refundPostingEnabled, setRefundPostingEnabled] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [findResults, setFindResults] = useState<Array<Record<string, unknown>> | null>(null);

  async function loadStatus() {
    const s = await fetchAccountingStatus();
    setRefundPostingEnabled(Boolean(s.refundPostingEnabled));
  }

  async function handlePreview() {
    setLoading(true);
    setError(null);
    setMessage(null);
    setShowDetails(false);
    try {
      await loadStatus();
      const data = await previewOrderRefundedFullAccounting({
        orderNumber: orderNumber.trim()
      });
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
      const result = await postOrderRefundedFullAccounting({
        orderNumber: orderNumber.trim()
      });
      setConfirmOpen(false);
      setMessage(
        result.duplicate
          ? `Already recorded — journal ${result.journal.entryNumber}`
          : `Refund entry recorded — journal ${result.journal.entryNumber}`
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

  async function handleFind() {
    setLoading(true);
    setError(null);
    try {
      const result = await discoverOrderRefundedFullAccounting({
        orderNumber: orderNumber.trim() || undefined,
        dryRun: true,
        limit: orderNumber.trim() ? 1 : 10
      });
      setFindResults(result.results as Array<Record<string, unknown>>);
      setMessage(
        result.autoPostable > 0
          ? `Found ${result.autoPostable} eligible full refund${result.autoPostable === 1 ? "" : "s"} to review.`
          : `No eligible full refunds found among ${result.scanned} reviewed.`
      );
    } catch (err) {
      setFindResults(null);
      setError(
        humanizePostingError(
          err instanceof AdminApiError ? err.message : "Could not find refunds"
        )
      );
    } finally {
      setLoading(false);
    }
  }

  const eligibilityRaw = preview?.eligibility as
    | {
        autoPostable?: boolean;
        eligible?: boolean;
        code?: string;
        reason?: string;
        candidateRefundId?: string;
        monetaryRefundTotalPaise?: number;
      }
    | undefined;

  const proposal = preview?.proposal as
    | {
        balanced?: boolean;
        totalDebitPaise?: number;
        totalCreditPaise?: number;
        lines?: ProposalLine[];
      }
    | null
    | undefined;

  const context = preview?.context as
    | {
        orderNumber?: string;
        grandTotalInPaise?: number;
        provider?: string;
        refundedInPaise?: number;
        paymentStatus?: string;
        refunds?: Array<{
          id: string;
          amountInPaise: number;
          status: string;
          providerRefundId: string | null;
        }>;
      }
    | undefined;

  const refundRow =
    context?.refunds?.find((r) => r.id === eligibilityRaw?.candidateRefundId) ??
    context?.refunds?.[0];

  const postingEvent = preview?.postingEvent as
    | { status?: string; journalEntry?: { entryNumber?: string } | null }
    | null
    | undefined;

  const orderLabel = context?.orderNumber ?? (orderNumber.trim() || "—");
  const saleAmount = context?.grandTotalInPaise ?? 0;
  const refundAmount =
    refundRow?.amountInPaise ??
    eligibilityRaw?.monetaryRefundTotalPaise ??
    context?.refundedInPaise ??
    0;
  const provider = context?.provider;

  const eligibility = eligibilityRaw
    ? refundEligibilityLabel({
        autoPostable: eligibilityRaw.autoPostable,
        eligible: eligibilityRaw.eligible,
        code: eligibilityRaw.code,
        reason: eligibilityRaw.reason
      })
    : postingEvent?.status === "POSTED" || postingEvent?.journalEntry?.entryNumber
      ? { label: "Already recorded", tone: "success" as const, detail: undefined, partialNote: false }
      : null;

  const canRecord =
    Boolean(eligibilityRaw?.autoPostable) &&
    Boolean(proposal) &&
    refundPostingEnabled &&
    postingEvent?.status !== "POSTED" &&
    !postingEvent?.journalEntry?.entryNumber;

  return (
    <SalesPageShell
      title="Refunds"
      subtitle="Record full customer refunds in the accounting books."
    >
      {!refundPostingEnabled && preview ? (
        <AccountingAlert tone="warning">{softUnavailableMessage("refunds")}</AccountingAlert>
      ) : null}

      <AccountingSectionCard>
        <AccountingSectionHeader
          title="Look up order"
          description="Enter an order number to preview the full refund accounting entry."
        />
        <div className="flex flex-wrap items-end gap-3">
          <label className="min-w-[240px] flex-1">
            <span className={fieldLabelClass()}>Order Number</span>
            <input
              className={accountingInputClass()}
              value={orderNumber}
              onChange={(e) => setOrderNumber(e.target.value)}
              placeholder="SRV-…"
              disabled={loading}
            />
          </label>
          <button
            type="button"
            disabled={loading || !orderNumber.trim()}
            onClick={() => void handlePreview()}
            className={accountingButtonClass("primary")}
          >
            {loading ? "Working…" : "Preview Refund"}
          </button>
          <button
            type="button"
            disabled={loading || !canRecord}
            onClick={() => setConfirmOpen(true)}
            className={accountingButtonClass("secondary")}
          >
            Record Refund
          </button>
        </div>
        <div className="mt-3">
          <button
            type="button"
            disabled={loading}
            onClick={() => void handleFind()}
            className="text-xs font-medium text-[#8a7060] underline-offset-2 hover:text-[#1c352a] hover:underline"
          >
            Find unrecorded refunds
          </button>
        </div>
      </AccountingSectionCard>

      {error ? <AccountingAlert tone="error">{error}</AccountingAlert> : null}
      {message ? <AccountingAlert tone="success">{message}</AccountingAlert> : null}

      {findResults && findResults.length > 0 ? (
        <AccountingSectionCard>
          <AccountingSectionHeader title="Refunds to Review" />
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
                {findResults.map((row, idx) => {
                  const on = String(row.orderNumber ?? "");
                  return (
                    <tr key={`${on}-${idx}`} className="border-t border-[#eee8e0]">
                      <td className={salesTd()}>{on || "—"}</td>
                      <td className={salesTd()}>
                        {row.autoPostable === true || row.action === "would_post" || row.action === "eligible"
                          ? "Eligible"
                          : row.eligible === false || row.action === "skip"
                            ? "Not eligible"
                            : "Needs review"}
                      </td>
                      <td className={salesTd()}>
                        {on ? (
                          <button
                            type="button"
                            className="text-xs font-semibold text-[#1c352a] underline-offset-2 hover:underline"
                            onClick={() => {
                              setOrderNumber(on);
                              void (async () => {
                                setLoading(true);
                                setError(null);
                                try {
                                  await loadStatus();
                                  setPreview(
                                    await previewOrderRefundedFullAccounting({ orderNumber: on })
                                  );
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
                            Preview Refund
                          </button>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </SalesTableWrap>
        </AccountingSectionCard>
      ) : null}

      {!preview ? (
        <AccountingEmptyState
          title="No eligible refund is selected"
          description="Enter an order number to preview the refund accounting entry."
        />
      ) : (
        <div className="space-y-4">
          <AccountingSectionCard>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <AccountingSectionHeader title="Refund" />
              {eligibility ? (
                <AccountingStatusBadge tone={eligibility.tone}>{eligibility.label}</AccountingStatusBadge>
              ) : null}
            </div>
            <dl className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-sm">
              <div>
                <dt className="text-xs text-[#8a7060]">Order</dt>
                <dd className="font-semibold text-[#2c2420]">{orderLabel}</dd>
              </div>
              <div>
                <dt className="text-xs text-[#8a7060]">Original sale amount</dt>
                <dd className={moneyClass()}>{formatInrPaise(saleAmount)}</dd>
              </div>
              <div>
                <dt className="text-xs text-[#8a7060]">Refund amount</dt>
                <dd className={moneyClass()}>{formatInrPaise(refundAmount)}</dd>
              </div>
              <div>
                <dt className="text-xs text-[#8a7060]">Provider / reference</dt>
                <dd className="font-semibold text-[#2c2420]">
                  {providerLabel(provider)}
                  {refundRow?.providerRefundId ? (
                    <span className="mt-0.5 block text-[11px] font-normal text-[#8a7060]">
                      {refundRow.providerRefundId}
                    </span>
                  ) : null}
                </dd>
              </div>
              {refundRow?.status ? (
                <div>
                  <dt className="text-xs text-[#8a7060]">Refund status</dt>
                  <dd className="font-semibold text-[#2c2420]">
                    {String(refundRow.status).replace(/_/g, " ")}
                  </dd>
                </div>
              ) : null}
            </dl>
            {eligibility?.partialNote ? (
              <p className="mt-3 text-xs text-[#8a7060]">
                Partial refund accounting is not available in this workflow yet.
              </p>
            ) : null}
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
          </AccountingSectionCard>

          {proposal?.lines?.length ? (
            <AccountingSectionCard>
              <AccountingSectionHeader
                title="Accounting Entry"
                description="This records the refund in accounting. It does not initiate a gateway refund to the customer."
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
                    {proposal.lines.map((line, i) => {
                      const acc = accountLabel(line.accountCode, line.accountName);
                      const role = lineRoleLabel(
                        line.accountCode,
                        line.amountSource,
                        line.accountName
                      );
                      return (
                        <tr key={i} className="border-t border-[#eee8e0]">
                          <td className={salesTd()}>
                            <span className="font-medium text-[#2c2420]">{role || acc.primary}</span>
                            <span className="mt-0.5 block text-[11px] text-[#8a7060]">
                              {acc.code}
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
                        {formatInrPaise(proposal.totalDebitPaise ?? 0)}
                      </td>
                      <td className={`${salesTd(true)} ${moneyClass()}`}>
                        {formatInrPaise(proposal.totalCreditPaise ?? 0)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </SalesTableWrap>
            </AccountingSectionCard>
          ) : (
            <AccountingEmptyState
              title="No refund entry to display"
              description="This order does not currently have an eligible full-refund accounting entry."
            />
          )}
        </div>
      )}

      <AdminConfirmModal
        open={confirmOpen}
        title="Record refund entry?"
        message="This reverses the accounting recognition for the eligible full refund. If the gateway refund has already occurred, this action does not return money to the customer — it records the refund in accounting."
        details={[
          `Order: ${orderLabel}`,
          `Refund amount: ${formatInrPaise(refundAmount)}`,
          `Payment provider: ${providerLabel(provider)}`
        ]}
        confirmLabel="Record Refund"
        cancelLabel="Cancel"
        busy={loading}
        onConfirm={() => void handleRecord()}
        onClose={() => setConfirmOpen(false)}
      />
    </SalesPageShell>
  );
}
