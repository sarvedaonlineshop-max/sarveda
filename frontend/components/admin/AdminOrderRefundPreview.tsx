"use client";

import { useEffect, useState } from "react";

import { fetchOrderRefundPreview, type OrderRefundPreviewBreakdown } from "@/lib/admin-api";
import { formatMinorFromPaise } from "@/lib/money";

type Props = {
  orderId: string;
  currency: string;
};

function policyLabel(policy: string): string {
  switch (policy) {
    case "FULL_PRE_DISPATCH_CANCELLATION":
      return "Full cancellation before dispatch";
    case "DISPATCHED_SHIPPING_RETAINED":
      return "Product refund — shipping retained";
    case "RTO_SHIPPING_RETAINED":
      return "Product refund — shipping retained (RTO)";
    case "COD_CANCELLATION":
      return "COD cancellation — no gateway refund";
    default:
      return policy;
  }
}

export function AdminOrderRefundPreview({ orderId, currency }: Props) {
  const [breakdown, setBreakdown] = useState<OrderRefundPreviewBreakdown | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchOrderRefundPreview(orderId);
        if (!cancelled) setBreakdown(data.breakdown);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load refund preview");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  if (loading) {
    return (
      <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm dark:border-stone-700 dark:bg-stone-900">
        <p className="text-sm text-stone-500">Loading refund preview…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 shadow-sm dark:border-amber-900 dark:bg-amber-950/30">
        <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">Refund preview unavailable</p>
        <p className="mt-1 text-sm text-amber-800 dark:text-amber-300">{error}</p>
      </div>
    );
  }

  if (!breakdown) return null;

  const fmt = (paise: number) => formatMinorFromPaise(paise, currency);

  return (
    <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm dark:border-stone-700 dark:bg-stone-900">
      <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">Refund preview</p>
      <p className="mt-1 text-sm text-stone-600 dark:text-stone-300">{breakdown.explanation}</p>

      <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
        <div className="flex justify-between gap-3 sm:block">
          <dt className="text-stone-500">Customer paid</dt>
          <dd className="font-semibold text-stone-900 dark:text-stone-100">
            {fmt(breakdown.customerPaidAmountPaise)}
          </dd>
        </div>
        <div className="flex justify-between gap-3 sm:block">
          <dt className="text-stone-500">Captured (gateway)</dt>
          <dd className="font-semibold">{fmt(breakdown.capturedAmountPaise)}</dd>
        </div>
        <div className="flex justify-between gap-3 sm:block">
          <dt className="text-stone-500">Products paid value</dt>
          <dd>{fmt(breakdown.merchandiseNetPaise)}</dd>
        </div>
        <div className="flex justify-between gap-3 sm:block">
          <dt className="text-stone-500">Shipping paid</dt>
          <dd>{fmt(breakdown.shippingNetPaise)}</dd>
        </div>
        {breakdown.merchandiseDiscountPaise > 0 ? (
          <div className="flex justify-between gap-3 sm:block">
            <dt className="text-stone-500">Coupon / discount</dt>
            <dd className="text-red-700 dark:text-red-400">−{fmt(breakdown.merchandiseDiscountPaise)}</dd>
          </div>
        ) : null}
        <div className="flex justify-between gap-3 sm:block">
          <dt className="text-stone-500">Already refunded</dt>
          <dd>{fmt(breakdown.alreadyRefundedAmountPaise)}</dd>
        </div>
        {breakdown.retainedShippingPaise > 0 ? (
          <div className="flex justify-between gap-3 sm:block">
            <dt className="text-stone-500">Shipping retained</dt>
            <dd className="text-amber-800 dark:text-amber-300">−{fmt(breakdown.retainedShippingPaise)}</dd>
          </div>
        ) : null}
        <div className="flex justify-between gap-3 sm:col-span-2 sm:block">
          <dt className="text-stone-500">Remaining refundable</dt>
          <dd>{fmt(breakdown.remainingRefundableAmountPaise)}</dd>
        </div>
      </dl>

      <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50/80 px-4 py-3 dark:border-emerald-900 dark:bg-emerald-950/30">
        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800 dark:text-emerald-300">
          Proposed refund
        </p>
        <p className="mt-1 text-2xl font-bold text-emerald-900 dark:text-emerald-100">
          {fmt(breakdown.proposedRefundAmountPaise)}
        </p>
        <p className="mt-2 text-xs text-emerald-800/90 dark:text-emerald-300/90">
          Policy: {policyLabel(breakdown.policy)}
        </p>
      </div>

      {breakdown.warnings.length > 0 ? (
        <ul className="mt-3 list-inside list-disc text-xs text-amber-800 dark:text-amber-300">
          {breakdown.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      ) : null}

      {breakdown.unavailableCode ? (
        <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
          Note: {breakdown.unavailableCode}
          {breakdown.unavailableReason ? ` — ${breakdown.unavailableReason}` : ""}
        </p>
      ) : null}

      <p className="mt-3 text-[11px] text-stone-400">
        Preview only — does not initiate payment provider refund or change order state.
      </p>
    </div>
  );
}
