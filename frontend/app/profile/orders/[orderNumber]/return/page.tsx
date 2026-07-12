"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { MobileSubpageHeader } from "@/components/layout/MobileSubpageHeader";
import { OrderServiceRequestForm } from "@/components/orders/OrderServiceRequestForm";
import { fetchMe } from "@/lib/auth-client";
import {
  REFUND_AFTER_DELIVERY_REASONS,
  submitOrderRefundRequest
} from "@/lib/order-service-request";
import { fetchMyOrders } from "@/lib/orders-api";

export default function ReturnOrderRequestPage() {
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
        router.replace(`/login?next=/profile/orders/${encodeURIComponent(orderNumber)}/return`);
        return;
      }
      const orders = await fetchMyOrders();
      const order = orders.find((o) => o.orderNumber === orderNumber);
      if (!order) {
        if (!cancelled) setBlocked("Order not found.");
        return;
      }
      if (!order.canRefundRequest) {
        if (!cancelled) {
          setBlocked(
            order.serviceRequest?.status === "PENDING_APPROVAL"
              ? "A return/refund request is already waiting for approval."
              : "This order is not eligible for return or refund online."
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
      <MobileSubpageHeader title="Return / refund" backHref="/profile" />
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
            kind="refund"
            title="Return or refund"
            subtitle="Your order was delivered. Share details and photos so we can help."
            reasons={REFUND_AFTER_DELIVERY_REASONS}
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
