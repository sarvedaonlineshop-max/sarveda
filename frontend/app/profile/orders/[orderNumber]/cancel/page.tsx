"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { MobileSubpageHeader } from "@/components/layout/MobileSubpageHeader";
import { OrderServiceRequestForm } from "@/components/orders/OrderServiceRequestForm";
import { fetchMe } from "@/lib/auth-client";
import {
  CANCEL_BEFORE_DELIVERY_REASONS,
  submitOrderCancelRequest
} from "@/lib/order-service-request";
import { fetchMyOrders } from "@/lib/orders-api";

export default function CancelOrderRequestPage() {
  const params = useParams();
  const router = useRouter();
  const orderNumber = String(params.orderNumber ?? "");
  const [ready, setReady] = useState(false);
  const [blocked, setBlocked] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const me = await fetchMe();
      if (!me) {
        router.replace(`/login?next=/profile/orders/${encodeURIComponent(orderNumber)}/cancel`);
        return;
      }
      const orders = await fetchMyOrders();
      const order = orders.find((o) => o.orderNumber === orderNumber);
      if (!order) {
        if (!cancelled) setBlocked("Order not found.");
        return;
      }
      if (!order.canCancelRequest) {
        if (!cancelled) {
          setBlocked(
            order.serviceRequest?.status === "PENDING_APPROVAL"
              ? "A cancellation request is already waiting for approval."
              : "This order cannot be cancelled online."
          );
        }
        return;
      }
      if (!cancelled) setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [orderNumber, router]);

  return (
    <div className="min-h-[60vh] bg-brand-cream md:py-10">
      <MobileSubpageHeader title="Cancel order" backHref="/profile" />
      <div className="mx-auto max-w-xl px-4 py-4 md:rounded-3xl md:border md:border-brand-cream-dark md:bg-white md:p-8">
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
            kind="cancel"
            title="Cancel this order"
            subtitle="Tell us why you would like to cancel before delivery. Our team will review your request."
            reasons={CANCEL_BEFORE_DELIVERY_REASONS}
            backHref="/profile"
            onSubmit={(payload) => submitOrderCancelRequest(orderNumber, payload)}
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
