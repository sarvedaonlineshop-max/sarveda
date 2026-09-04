"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { MobileSubpageHeader } from "@/components/layout/MobileSubpageHeader";
import { OrderServiceRequestForm } from "@/components/orders/OrderServiceRequestForm";
import { fetchMe } from "@/lib/auth-client";
import {
  fetchReturnEligibility,
  REFUND_AFTER_DELIVERY_REASONS,
  submitOrderRefundRequest,
  type CustomerReturnEligibilityLine
} from "@/lib/order-service-request";
import { fetchMyOrders, type OrderLineItem } from "@/lib/orders-api";

type ReturnLineItem = OrderLineItem & {
  returnEligibility?: {
    orderedQty: number;
    alreadyInReturnQty: number;
    rejectedLockedQty: number;
    remainingEligibleQty: number;
    maxReturnableQty: number;
    unavailableReason: string | null;
  };
};

function toFormLine(
  orderLine: OrderLineItem,
  elig: CustomerReturnEligibilityLine | undefined
): ReturnLineItem {
  const maxReturnableQty = elig?.maxReturnableQty ?? 0;
  return {
    ...orderLine,
    // Selector ceiling = backend remaining; purchased qty kept in returnEligibility.orderedQty
    quantity: Math.max(0, maxReturnableQty),
    returnEligibility: elig
      ? {
          orderedQty: elig.orderedQty,
          alreadyInReturnQty: elig.alreadyInReturnQty,
          rejectedLockedQty: elig.rejectedLockedQty,
          remainingEligibleQty: elig.remainingEligibleQty,
          maxReturnableQty: elig.maxReturnableQty,
          unavailableReason: elig.unavailableReason
        }
      : undefined
  };
}

export default function ReturnOrderRequestPage() {
  const params = useParams();
  const router = useRouter();
  const orderNumber = String(params.orderNumber ?? "");
  const [ready, setReady] = useState(false);
  const [blocked, setBlocked] = useState<string | null>(null);
  const [lineItems, setLineItems] = useState<ReturnLineItem[]>([]);
  const [currency, setCurrency] = useState("INR");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const me = await fetchMe();
      if (!me) {
        router.replace(`/login?next=/profile/orders/${encodeURIComponent(orderNumber)}/return`);
        return;
      }
      const orders = await fetchMyOrders();
      const order = orders.find((o) => o.orderNumber === orderNumber);
      if (!order) {
        if (!cancelled) setBlocked("Order not found.");
        return;
      }
      if (!order.lineItems?.length) {
        if (!cancelled) setBlocked("Order items could not be loaded. Please try again later.");
        return;
      }

      let eligibility;
      try {
        eligibility = await fetchReturnEligibility(orderNumber);
      } catch {
        if (!cancelled) setBlocked("Could not load return eligibility. Please try again later.");
        return;
      }

      if (!eligibility.orderEligible && eligibility.orderMessage) {
        if (!cancelled) setBlocked(eligibility.orderMessage);
        return;
      }

      const byId = new Map(eligibility.lines.map((l) => [l.orderItemId, l]));
      const mapped = order.lineItems.map((li) => toFormLine(li, byId.get(li.id)));
      const anySelectable = mapped.some((l) => (l.returnEligibility?.remainingEligibleQty ?? 0) > 0);
      if (!anySelectable) {
        if (!cancelled) {
          setBlocked(
            mapped.find((l) => l.returnEligibility?.unavailableReason)?.returnEligibility
              ?.unavailableReason ??
              "No units are currently eligible for a new return request."
          );
        }
        return;
      }

      if (!cancelled) {
        setLineItems(mapped);
        setCurrency(eligibility.currency || order.currency);
        setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orderNumber, router]);

  return (
    <div className="min-h-[60vh] bg-brand-cream md:py-8">
      <MobileSubpageHeader title="Return or replace" backHref="/profile" backLabel="Back to orders" />
      <div className="mx-auto w-[92%] max-w-[1100px] py-4">
        {blocked ? (
          <div className="rounded-2xl border border-brand-cream-dark bg-white p-6 text-center shadow-card">
            <p className="text-sm text-brand-muted">{blocked}</p>
            <Link href="/profile" className="mt-4 inline-block text-sm font-semibold text-brand-forest underline">
              Back to orders
            </Link>
          </div>
        ) : ready ? (
          <OrderServiceRequestForm
            orderNumber={orderNumber}
            currency={currency}
            kind="refund"
            title="Return or replace items"
            subtitle="Select delivered item(s) and a reason. Returns and replacements are available for 7 days after delivery."
            reasons={REFUND_AFTER_DELIVERY_REASONS}
            lineItems={lineItems}
            backHref="/profile"
            onSubmit={(payload) => submitOrderRefundRequest(orderNumber, payload)}
          />
        ) : (
          <p className="py-10 text-center text-sm text-brand-muted" role="status">
            Loading…
          </p>
        )}
      </div>
    </div>
  );
}
