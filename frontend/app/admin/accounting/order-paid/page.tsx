"use client";

import { useState } from "react";
import { AdminAccountingHeader } from "@/components/admin/accounting/AdminAccountingNav";
import {
  discoverOrderPaidAccounting,
  fetchAccountingStatus,
  formatInrPaise,
  postOrderPaidAccounting,
  previewOrderPaidAccounting,
  type OrderPaidPreview
} from "@/lib/accounting-api";
import { AdminApiError } from "@/lib/admin-errors";

export default function AdminOrderPaidShadowPage() {
  const [orderNumber, setOrderNumber] = useState("");
  const [preview, setPreview] = useState<OrderPaidPreview | null>(null);
  const [salesPostingEnabled, setSalesPostingEnabled] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadStatus() {
    const s = await fetchAccountingStatus();
    setSalesPostingEnabled(s.salesPostingEnabled);
  }

  async function handlePreview() {
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      await loadStatus();
      const data = await previewOrderPaidAccounting({ orderNumber: orderNumber.trim() });
      setPreview(data);
    } catch (err) {
      setPreview(null);
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
      const result = await postOrderPaidAccounting({ orderNumber: orderNumber.trim() });
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
      const result = await discoverOrderPaidAccounting({
        orderNumber: orderNumber.trim() || undefined,
        dryRun: true,
        limit: orderNumber.trim() ? 1 : 10
      });
      setMessage(
        `Discovery dry-run: scanned ${result.scanned}, eligible ${result.eligible}, posted ${result.posted}`
      );
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : "Discovery failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <AdminAccountingHeader
        title="Sales Entries"
        subtitle="Preview and post accounting journals from paid commerce orders."
      />

      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
        Calculation version <strong>ORDER_PAID_V1</strong>. No commerce or payment code is modified.
        Persistence requires <code>ACCOUNTING_SALES_POSTING_ENABLED=1</code> on the API server.
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm">
          Order number
          <input
            className="rounded border border-neutral-300 px-3 py-2 min-w-[240px]"
            value={orderNumber}
            onChange={(e) => setOrderNumber(e.target.value)}
            placeholder="SRV-20260800001"
          />
        </label>
        <button
          type="button"
          disabled={loading || !orderNumber.trim()}
          onClick={() => void handlePreview()}
          className="rounded bg-[#1e3a2f] px-4 py-2 text-sm text-white disabled:opacity-50"
        >
          Preview
        </button>
        <button
          type="button"
          disabled={loading || !orderNumber.trim() || !salesPostingEnabled}
          onClick={() => void handlePost()}
          className="rounded border border-[#1e3a2f] px-4 py-2 text-sm text-[#1e3a2f] disabled:opacity-50"
        >
          Post to books
        </button>
        <button
          type="button"
          disabled={loading}
          onClick={() => void handleDiscoverDryRun()}
          className="rounded border border-neutral-400 px-4 py-2 text-sm disabled:opacity-50"
        >
          Discovery dry-run
        </button>
      </div>

      {error ? (
        <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">{error}</div>
      ) : null}
      {message ? (
        <div className="rounded border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-900">
          {message}
        </div>
      ) : null}

      {preview ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-sm">
            <div className="rounded border bg-white p-3">
              <p className="text-neutral-500">Grand total</p>
              <p className="font-semibold">{formatInrPaise(preview.snapshot.grandTotalInPaise)}</p>
            </div>
            <div className="rounded border bg-white p-3">
              <p className="text-neutral-500">Discount</p>
              <p className="font-semibold">{formatInrPaise(preview.snapshot.discountInPaise)}</p>
            </div>
            <div className="rounded border bg-white p-3">
              <p className="text-neutral-500">Provider</p>
              <p className="font-semibold">{preview.snapshot.payment.provider}</p>
            </div>
            <div className="rounded border bg-white p-3">
              <p className="text-neutral-500">Eligible</p>
              <p className="font-semibold">{preview.eligibility.eligible ? "Yes" : "No"}</p>
            </div>
          </div>

          {!preview.eligibility.eligible ? (
            <p className="text-sm text-red-700">{preview.eligibility.reason}</p>
          ) : null}

          {preview.buildError ? (
            <p className="text-sm text-red-700">{preview.buildError.message}</p>
          ) : null}

          {preview.proposal ? (
            <>
              <div className="text-sm">
                <p>
                  Balance: {preview.proposal.balanced ? "OK" : "FAIL"} (imbalance{" "}
                  {preview.proposal.imbalancePaise} paise)
                </p>
                <p>Posting event: {preview.postingEvent?.status ?? "NONE"}</p>
                {preview.proposal.diagnostics.zohoParity ? (
                  <p>
                    Zoho merchandise variance:{" "}
                    {preview.proposal.diagnostics.zohoParity.merchandiseVariancePaise} paise
                  </p>
                ) : null}
              </div>

              <div className="overflow-x-auto rounded border bg-white">
                <table className="min-w-full text-sm">
                  <thead className="bg-neutral-50 text-left">
                    <tr>
                      <th className="px-3 py-2">Account</th>
                      <th className="px-3 py-2">Debit</th>
                      <th className="px-3 py-2">Credit</th>
                      <th className="px-3 py-2">Source</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.proposal.lines.map((line, i) => (
                      <tr key={i} className="border-t">
                        <td className="px-3 py-2">
                          {line.accountCode} — {line.accountName}
                        </td>
                        <td className="px-3 py-2">{line.debitInPaise ? formatInrPaise(line.debitInPaise) : "—"}</td>
                        <td className="px-3 py-2">{line.creditInPaise ? formatInrPaise(line.creditInPaise) : "—"}</td>
                        <td className="px-3 py-2 text-neutral-600">{line.amountSource}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
