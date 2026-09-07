"use client";

import { useEffect, useState } from "react";

import { fetchOrderRefundPreview, type OrderRefundPreviewBreakdown } from "@/lib/admin-api";
import { formatMinorFromPaise } from "@/lib/money";

type Props = {
  orderId: string;
  currency: string;
  /**
   * Bump after refund/cancel so the preview reloads server truth.
   * Typical: `${paymentStatus}:${refundedInPaise}:${status}`
   */
  refreshKey?: string | number;
};

function policyLabel(policy: string): string {
  switch (policy) {
    case "FULL_PRE_DISPATCH_CANCELLATION":
      return "Full refund before courier pickup";
    case "DISPATCHED_SHIPPING_RETAINED":
      return "Refund product value; shipping charge kept";
    case "RTO_SHIPPING_RETAINED":
      return "RTO refund: product value only, shipping charge kept";
    case "COD_CANCELLATION":
      return "COD cancellation: no online refund";
    default:
      return policy.replaceAll("_", " ").toLowerCase();
  }
}

function adminExplanation(policy: string, fullyRefunded: boolean): string {
  if (fullyRefunded) {
    return "The customer has already been refunded for the available refundable amount. No more gateway refund is available from this order.";
  }
  switch (policy) {
    case "RTO_SHIPPING_RETAINED":
      return "Customer cancelled after courier pickup. Refund the product amount after warehouse receipt and item condition are confirmed. Shipping is kept because the parcel already moved.";
    case "DISPATCHED_SHIPPING_RETAINED":
      return "Courier work has already started. Refund the product amount only unless an admin deliberately decides to return shipping too.";
    case "FULL_PRE_DISPATCH_CANCELLATION":
      return "Order was cancelled before courier pickup. The full captured amount can be refunded to the original payment method.";
    case "COD_CANCELLATION":
      return "Cash was not collected online, so there is no gateway refund. Close the case after admin review.";
    default:
      return "Money summary for this order. Use the related Return / Cancellation / RTO case to take action.";
  }
}

function cleanupOrderPageLabels() {
  if (typeof document === "undefined") return;
  const replacements: Array<[string, string]> = [
    ["Fulfillment:", "Shipment:"],
    ["Fulfillment", "Shipment"],
    ["Fulfilment", "Shipment"],
    ["Items & Fulfillment", "Items & Shipment"],
    ["Items & Fulfilment", "Items & Shipment"],
    ["Line items & fulfillment", "Line items & shipment"],
    ["Line items & fulfilment", "Line items & shipment"],
    ["Fulfilled From", "Shipped from"],
    ["Fulfilled from", "Shipped from"]
  ];

  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  let node = walker.nextNode();
  while (node) {
    textNodes.push(node as Text);
    node = walker.nextNode();
  }
  textNodes.forEach((textNode) => {
    let next = textNode.nodeValue ?? "";
    replacements.forEach(([from, to]) => {
      next = next.replaceAll(from, to);
    });
    if (next !== textNode.nodeValue) textNode.nodeValue = next;
  });
}

export function AdminOrderRefundPreview({ orderId, currency, refreshKey = 0 }: Props) {
  const [breakdown, setBreakdown] = useState<OrderRefundPreviewBreakdown | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    cleanupOrderPageLabels();
    const observer = new MutationObserver(() => cleanupOrderPageLabels());
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchOrderRefundPreview(orderId);
        if (!cancelled) setBreakdown(data.breakdown);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load refund summary");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orderId, refreshKey]);

  if (loading) {
    return (
      <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm dark:border-stone-700 dark:bg-stone-900">
        <p className="text-sm text-stone-500">Loading refund summary…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 shadow-sm dark:border-amber-900 dark:bg-amber-950/30">
        <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">Refund summary unavailable</p>
        <p className="mt-1 text-sm text-amber-800 dark:text-amber-300">{error}</p>
      </div>
    );
  }

  if (!breakdown) return null;

  const fmt = (paise: number) => formatMinorFromPaise(paise, currency);
  const fullyRefunded =
    breakdown.unavailableCode === "FULLY_REFUNDED" ||
    (breakdown.capturedAmountPaise > 0 &&
      breakdown.alreadyRefundedAmountPaise >= breakdown.capturedAmountPaise &&
      breakdown.remainingRefundableAmountPaise <= 0);
  const showProposed =
    !fullyRefunded &&
    breakdown.refundEligible !== false &&
    breakdown.proposedRefundAmountPaise > 0;
  const visibleWarnings = breakdown.warnings.filter((w) => !w.includes("_") && !w.toLowerCase().includes("phase"));

  return (
    <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm dark:border-stone-700 dark:bg-stone-900">
      <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">Refund summary</p>
      <p className="mt-1 text-sm text-stone-600 dark:text-stone-300">
        {adminExplanation(breakdown.policy, fullyRefunded)}
      </p>

      {fullyRefunded ? (
        <div className="mt-3 rounded-lg border border-stone-300 bg-stone-100 px-4 py-3 dark:border-stone-600 dark:bg-stone-800">
          <p className="text-xs font-semibold uppercase tracking-wide text-stone-600 dark:text-stone-300">
            Status
          </p>
          <p className="mt-1 text-lg font-bold text-stone-900 dark:text-stone-100">Fully refunded</p>
          <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">
            The customer has no remaining refundable balance on this payment.
          </p>
        </div>
      ) : null}

      <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
        <div className="flex justify-between gap-3 sm:block">
          <dt className="text-stone-500">Customer paid</dt>
          <dd className="font-semibold text-stone-900 dark:text-stone-100">
            {fmt(breakdown.customerPaidAmountPaise)}
          </dd>
        </div>
        <div className="flex justify-between gap-3 sm:block">
          <dt className="text-stone-500">Gateway captured</dt>
          <dd className="font-semibold">{fmt(breakdown.capturedAmountPaise)}</dd>
        </div>
        <div className="flex justify-between gap-3 sm:block">
          <dt className="text-stone-500">Products paid</dt>
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
          <dd className="font-semibold">{fmt(breakdown.alreadyRefundedAmountPaise)}</dd>
        </div>
        {breakdown.retainedShippingPaise > 0 ? (
          <div className="flex justify-between gap-3 sm:block">
            <dt className="text-stone-500">Shipping kept by store</dt>
            <dd className="text-amber-800 dark:text-amber-300">−{fmt(breakdown.retainedShippingPaise)}</dd>
          </div>
        ) : null}
        <div className="flex justify-between gap-3 sm:col-span-2 sm:block">
          <dt className="text-stone-500">Still refundable</dt>
          <dd className="font-semibold">{fmt(breakdown.remainingRefundableAmountPaise)}</dd>
        </div>
      </dl>

      {showProposed ? (
        <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50/80 px-4 py-3 dark:border-emerald-900 dark:bg-emerald-950/30">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800 dark:text-emerald-300">
            Suggested next refund amount
          </p>
          <p className="mt-1 text-2xl font-bold text-emerald-900 dark:text-emerald-100">
            {fmt(breakdown.proposedRefundAmountPaise)}
          </p>
          <p className="mt-2 text-xs text-emerald-800/90 dark:text-emerald-300/90">
            {policyLabel(breakdown.policy)}
          </p>
        </div>
      ) : null}

      {visibleWarnings.length > 0 ? (
        <ul className="mt-3 list-inside list-disc text-xs text-amber-800 dark:text-amber-300">
          {visibleWarnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      ) : null}

      {breakdown.unavailableCode && breakdown.unavailableCode !== "FULLY_REFUNDED" && !breakdown.unavailableCode.includes("_") ? (
        <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
          {breakdown.unavailableReason ?? breakdown.unavailableCode}
        </p>
      ) : null}

      <p className="mt-3 text-[11px] text-stone-500">
        To issue money or close a return, open the linked Return / Cancellation / RTO case.
      </p>
    </div>
  );
}
