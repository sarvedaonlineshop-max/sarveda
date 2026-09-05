"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { MobileSubpageHeader } from "@/components/layout/MobileSubpageHeader";
import { OrderAdjustmentRequestForm } from "@/components/orders/OrderAdjustmentRequestForm";
import { fetchMe } from "@/lib/auth-client";
import { fetchMyOrders } from "@/lib/orders-api";

export default function AdjustOrderRequestPage() {
  const params = useParams();
  const router = useRouter();
  const orderNumber = String(params.orderNumber ?? "");
  const [ready, setReady] = useState(false);
  const [blocked, setBlocked] = useState<string | null>(null);
  const [lineItems, setLineItems] = useState<
    Array<{ id: string; title: string; quantity: number; lineTotalInPaise: number; skuSnapshot?: string }>
  >([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const me = await fetchMe();
      if (!me) {
        router.replace(`/login?next=/profile/orders/${encodeURIComponent(orderNumber)}/adjust`);
        return;
      }
      const orders = await fetchMyOrders();
      const order = orders.find((o) => o.orderNumber === orderNumber);
      if (!order) {
        if (!cancelled) setBlocked("Order not found.");
        return;
      }
      if (!order.canAdjustRequest) {
        if (!cancelled) {
          setBlocked(
            order.adjustBlockReason ??
              (order.serviceRequest?.status === "PENDING_APPROVAL"
                ? "A change request is already waiting for approval."
                : "Your order has already been dispatched, so this change can no longer be made online.")
          );
        }
        return;
      }
      if (!order.lineItems?.length) {
        if (!cancelled) setBlocked("Order items could not be loaded. Please try again later.");
        return;
      }
      if (!cancelled) {
        setLineItems(order.lineItems);
        setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orderNumber, router]);

  return (
    <div className="min-h-[60vh] bg-brand-cream font-sans md:py-8 [&_.font-serif]:font-sans">
      <MobileSubpageHeader title="Request order change" backHref="/profile?tab=orders" backLabel="Back to My Orders" />
      <div className="mx-auto w-[92%] max-w-[1100px] space-y-5 py-4">
        <div className="hidden md:block">
          <Link
            href="/profile?tab=orders"
            className="inline-flex min-h-[40px] items-center gap-2 rounded-full border border-brand-forest/20 bg-white px-4 text-sm font-bold text-brand-forest shadow-sm transition-all hover:-translate-y-0.5 hover:bg-brand-forest/5 hover:shadow-md active:translate-y-0"
          >
            <span aria-hidden="true">←</span>
            Back to My Orders
          </Link>
        </div>

        {blocked ? (
          <div className="rounded-2xl border border-brand-cream-dark bg-white p-6 text-center shadow-card">
            <p className="text-sm text-brand-muted">{blocked}</p>
            <Link href="/profile?tab=orders" className="mt-4 inline-block text-sm font-semibold text-brand-forest underline">
              Back to My Orders
            </Link>
          </div>
        ) : ready ? (
          <OrderAdjustmentRequestForm orderNumber={orderNumber} lineItems={lineItems} backHref="/profile?tab=orders" />
        ) : (
          <p className="py-10 text-center text-sm text-brand-muted" role="status">
            Loading…
          </p>
        )}
      </div>
    </div>
  );
}
