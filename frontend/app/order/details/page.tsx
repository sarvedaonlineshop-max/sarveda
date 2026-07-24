"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import { OrderPublicDetailCard } from "@/components/orders/OrderPublicDetailCard";
import type { OrderPublic } from "@/lib/orders-api";
import { fetchOrderPublic } from "@/lib/orders-api";

/** Public order view for WhatsApp / email / Track order links. */
function DetailsInner() {
  const search = useSearchParams();
  const orderNumber = search.get("orderNumber") ?? "";
  const email = search.get("email") ?? "";
  const phone = search.get("phone") ?? "";
  const [order, setOrder] = useState<OrderPublic | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!orderNumber || (!email && !phone)) return;
    void (async () => {
      try {
        setErr(null);
        const o = await fetchOrderPublic(orderNumber, email || phone, phone || undefined);
        setOrder(o);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Could not load order");
      }
    })();
  }, [orderNumber, email, phone]);

  if (!orderNumber || (!email && !phone)) {
    return (
      <div className="mx-auto max-w-3xl rounded-2xl border border-brand-cream-dark bg-white p-8 text-center shadow-card">
        <p className="text-stone-600">Missing order details.</p>
        <Link href="/profile?tab=orders" className="mt-6 inline-block font-medium text-brand-forest hover:underline">
          Back to My Orders
        </Link>
      </div>
    );
  }

  if (!order && err) {
    return (
      <div className="mx-auto max-w-3xl rounded-2xl border border-brand-cream-dark bg-white p-8 text-center shadow-card">
        <p className="text-stone-600">{err}</p>
        <Link href="/profile?tab=orders" className="mt-6 inline-block font-medium text-brand-forest hover:underline">
          Back to My Orders
        </Link>
      </div>
    );
  }

  if (!order) {
    return <p className="text-center text-stone-500">Loading order details…</p>;
  }

  const accessEmail = (email || order.email).trim().toLowerCase();

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/profile?tab=orders"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-forest transition-colors hover:text-brand-night hover:underline"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M19 12H5" />
          <path d="m12 19-7-7 7-7" />
        </svg>
        Back to My Orders
      </Link>

      <h1 className="mt-4 font-serif text-2xl font-semibold text-brand-ink">Order details</h1>
      <p className="mt-1 text-sm text-brand-muted">
        Confirmation for <span className="font-medium text-brand-ink">{order.email}</span>
      </p>

      <div className="mt-6">
        <OrderPublicDetailCard order={order} accessEmail={accessEmail} />
      </div>
    </div>
  );
}

export default function OrderDetailsPage() {
  return (
    <main className="min-h-screen bg-brand-cream px-4 py-8 sm:px-6">
      <Suspense fallback={<p className="text-center text-stone-500">Loading…</p>}>
        <DetailsInner />
      </Suspense>
    </main>
  );
}
