"use client";

import { useState } from "react";
import { AdminAccountingHeader } from "@/components/admin/accounting/AdminAccountingNav";
import {
  discoverOrderRefundedFullAccounting,
  fetchAccountingStatus,
  fetchReconciliationV2,
  formatInrPaise,
  postOrderRefundedFullAccounting,
  previewOrderRefundedFullAccounting
} from "@/lib/accounting-api";
import { AdminApiError } from "@/lib/admin-errors";

export default function AdminOrderRefundedFullShadowPage() {
  const [orderNumber, setOrderNumber] = useState("");
  const [preview, setPreview] = useState<Record<string, unknown> | null>(null);
  const [recon, setRecon] = useState<Record<string, unknown> | null>(null);
  const [refundPostingEnabled, setRefundPostingEnabled] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadStatus() {
    const s = await fetchAccountingStatus();
    setRefundPostingEnabled(Boolean(s.refundPostingEnabled));
  }

  async function handlePreview() {
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      await loadStatus();
      const data = await previewOrderRefundedFullAccounting({
        orderNumber: orderNumber.trim()
      });
      setPreview(data);
      const report = await fetchReconciliationV2({ orderNumber: orderNumber.trim() });
      setRecon((report.rows[0] as Record<string, unknown>) ?? null);
    } catch (err) {
      setPreview(null);
      setRecon(null);
      setError(err instanceof AdminApiError ? err.message : "Preview failed");
    } finally {
      setLoading(false);
    }
  }

  async function handlePost() {
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const result = await postOrderRefundedFullAccounting({
        orderNumber: orderNumber.trim()
      });
      setMessage(
        result.duplicate
          ? `Already posted — journal ${result.journal.entryNumber}`
          : `Posted journal ${result.journal.entryNumber}`
      );
      await handlePreview();
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : "Post failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleDiscoverDryRun() {
    setLoading(true);
    setError(null);
    try {
      const result = await discoverOrderRefundedFullAccounting({
        orderNumber: orderNumber.trim() || undefined,
        dryRun: true,
        limit: orderNumber.trim() ? 1 : 10
      });
      setMessage(
        `Discovery dry-run: scanned ${result.scanned}, autoPostable ${result.autoPostable}, posted ${result.posted}`
      );
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : "Discovery failed");
    } finally {
      setLoading(false);
    }
  }

  const eligibility = preview?.eligibility as
    | { autoPostable?: boolean; code?: string; reason?: string }
    | undefined;
  const proposal = preview?.proposal as
    | {
        calcVersion?: string;
        balanced?: boolean;
        imbalancePaise?: number;
        totalDebitPaise?: number;
        totalCreditPaise?: number;
        lines?: Array<{
          accountCode: string;
          accountName: string;
          debitInPaise: number;
          creditInPaise: number;
        }>;
      }
    | null
    | undefined;

  return (
    <div className="space-y-6">
      <AdminAccountingHeader
        title="ORDER_REFUNDED_FULL Shadow"
        subtitle="Single full-refund reversal of ORDER_PAID_V1 — discovery only; Zoho remains authoritative"
      />

      <div className="flex flex-wrap items-end gap-3">
        <label className="block text-sm">
          <span className="mb-1 block text-neutral-600">Order number</span>
          <input
            value={orderNumber}
            onChange={(e) => setOrderNumber(e.target.value)}
            className="rounded border border-neutral-300 px-3 py-2 text-sm"
            placeholder="SRV-..."
          />
        </label>
        <button
          type="button"
          disabled={loading || !orderNumber.trim()}
          onClick={handlePreview}
          className="rounded bg-[#1e3a2f] px-4 py-2 text-sm text-white disabled:opacity-50"
        >
          Preview
        </button>
        <button
          type="button"
          disabled={loading || !orderNumber.trim() || !refundPostingEnabled}
          onClick={handlePost}
          className="rounded bg-amber-700 px-4 py-2 text-sm text-white disabled:opacity-50"
        >
          Post (flag required)
        </button>
        <button
          type="button"
          disabled={loading}
          onClick={handleDiscoverDryRun}
          className="rounded border border-neutral-300 px-4 py-2 text-sm"
        >
          Discover dry-run
        </button>
      </div>

      <p className="text-xs text-neutral-500">
        Refund posting enabled: {refundPostingEnabled ? "yes" : "no"} (ACCOUNTING_REFUND_POSTING_ENABLED)
      </p>

      {message ? <p className="text-sm text-emerald-700">{message}</p> : null}
      {error ? <p className="text-sm text-red-700">{error}</p> : null}

      {eligibility ? (
        <div className="rounded border border-neutral-200 p-4 text-sm">
          <p>
            Eligibility: <strong>{eligibility.code}</strong> — autoPostable=
            {String(eligibility.autoPostable)}
          </p>
          <p className="text-neutral-600">{eligibility.reason}</p>
        </div>
      ) : null}

      {recon ? (
        <div className="rounded border border-neutral-200 p-4 text-sm">
          <p>
            Recon V2 status: <strong>{String(recon.status)}</strong>
          </p>
          <p className="text-neutral-600">{String(recon.statusReason)}</p>
        </div>
      ) : null}

      {proposal ? (
        <div className="space-y-3">
          <p className="text-sm">
            {proposal.calcVersion} — balanced={String(proposal.balanced)} — imbalance=
            {proposal.imbalancePaise} — Dr {formatInrPaise(proposal.totalDebitPaise ?? 0)} / Cr{" "}
            {formatInrPaise(proposal.totalCreditPaise ?? 0)}
          </p>
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b">
                <th className="py-2">Account</th>
                <th>Debit</th>
                <th>Credit</th>
              </tr>
            </thead>
            <tbody>
              {(proposal.lines ?? []).map((line, idx) => (
                <tr key={`${line.accountCode}-${idx}`} className="border-b border-neutral-100">
                  <td className="py-2">
                    {line.accountCode} {line.accountName}
                  </td>
                  <td>{line.debitInPaise ? formatInrPaise(line.debitInPaise) : "—"}</td>
                  <td>{line.creditInPaise ? formatInrPaise(line.creditInPaise) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
