"use client";

import { useCallback, useEffect, useState } from "react";

import {
  fetchLineRefundOptions,
  type LineRefundOptions
} from "@/lib/admin-api";
import { formatMinorFromPaise } from "@/lib/money";

type Props = {
  orderId: string;
  currency: string;
  /** Bump after a refund so amounts reload from server truth. */
  refreshKey?: string | number;
  onRefunded?: () => void;
};

function statusTone(value: number) {
  if (value <= 0) return "border-emerald-200 bg-emerald-50 text-emerald-900";
  return "border-amber-200 bg-amber-50 text-amber-950";
}

/**
 * Order detail page must be a summary/dashboard only.
 * Refund execution belongs to Return/Cancellation/RTO case pages so we never create
 * duplicate refund paths from the order screen.
 */
export function AdminOrderLineRefund({ orderId, currency, refreshKey = 0 }: Props) {
  const [options, setOptions] = useState<LineRefundOptions | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchLineRefundOptions(orderId);
      setOptions(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load refund summary");
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const fmt = (paise: number) => formatMinorFromPaise(paise, currency);

  if (loading) {
    return (
      <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm dark:border-stone-700 dark:bg-stone-900">
        <p className="text-sm text-stone-500">Loading refund summary…</p>
      </div>
    );
  }

  if (!options) {
    return error ? (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/30">
        <p className="text-sm text-amber-900 dark:text-amber-200">{error}</p>
      </div>
    ) : null;
  }

  const remaining = Math.max(0, options.remainingRefundableInPaise);
  const refunded = Math.max(0, options.alreadyRefundedInPaise);
  const collected = Math.max(0, options.originallyCollectedInPaise);
  const netCollected = Math.max(0, collected - refunded);

  return (
    <div className="rounded-xl border border-stone-200 bg-white shadow-sm dark:border-stone-700 dark:bg-stone-900">
      <div className="border-b border-stone-100 px-4 py-3 dark:border-stone-700">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-bold text-[#1c352a] dark:text-stone-100">Refund summary</p>
            <p className="mt-0.5 text-xs text-stone-500 dark:text-stone-400">
              Summary only. Process refunds from the linked return, cancellation, or RTO case.
            </p>
          </div>
          <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${statusTone(remaining)}`}>
            {remaining <= 0 ? "No refundable balance" : `${fmt(remaining)} remaining`}
          </span>
        </div>
      </div>

      <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg bg-[#faf7f2] p-3 dark:bg-stone-800">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[#8a7060] dark:text-stone-400">Collected</p>
          <p className="mt-1 text-lg font-extrabold text-[#1c352a] dark:text-stone-100">{fmt(collected)}</p>
          <p className="mt-0.5 text-xs text-stone-500">{options.paymentMethod ?? "Payment"}</p>
        </div>
        <div className="rounded-lg bg-[#faf7f2] p-3 dark:bg-stone-800">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[#8a7060] dark:text-stone-400">Refunded</p>
          <p className="mt-1 text-lg font-extrabold text-[#1c352a] dark:text-stone-100">{fmt(refunded)}</p>
          <p className="mt-0.5 text-xs text-stone-500">Gateway/case recorded</p>
        </div>
        <div className="rounded-lg bg-[#faf7f2] p-3 dark:bg-stone-800">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[#8a7060] dark:text-stone-400">Remaining refundable</p>
          <p className="mt-1 text-lg font-extrabold text-[#1c352a] dark:text-stone-100">{fmt(remaining)}</p>
          <p className="mt-0.5 text-xs text-stone-500">After all processed refunds</p>
        </div>
        <div className="rounded-lg bg-[#faf7f2] p-3 dark:bg-stone-800">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[#8a7060] dark:text-stone-400">Net collected</p>
          <p className="mt-1 text-lg font-extrabold text-[#1c352a] dark:text-stone-100">{fmt(netCollected)}</p>
          <p className="mt-0.5 text-xs text-stone-500">Customer money retained</p>
        </div>
      </div>

      <div className="border-t border-stone-100 px-4 py-3 dark:border-stone-700">
        {options.lines.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-xs">
              <thead className="text-[11px] uppercase tracking-wide text-stone-500">
                <tr>
                  <th className="py-2 pr-3 font-semibold">Item</th>
                  <th className="py-2 pr-3 font-semibold">SKU</th>
                  <th className="py-2 pr-3 font-semibold">Qty</th>
                  <th className="py-2 pr-3 font-semibold">Refundable qty</th>
                  <th className="py-2 text-right font-semibold">Per-unit refund</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 dark:divide-stone-700">
                {options.lines.map((line) => (
                  <tr key={line.orderItemId}>
                    <td className="py-2 pr-3 font-medium text-stone-800 dark:text-stone-100">{line.name}</td>
                    <td className="py-2 pr-3 font-mono text-[11px] text-stone-500">{line.sku}</td>
                    <td className="py-2 pr-3 text-stone-600 dark:text-stone-300">{line.qtyOrdered}</td>
                    <td className="py-2 pr-3 text-stone-600 dark:text-stone-300">{line.maxRefundQty}</td>
                    <td className="py-2 text-right font-semibold text-stone-800 dark:text-stone-100">{fmt(line.perUnitRefundInPaise)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-stone-500">No line-level refund balance is available.</p>
        )}
        {!options.eligible && options.ineligibleReason ? (
          <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
            {options.ineligibleReason}
          </p>
        ) : null}
      </div>
    </div>
  );
}
