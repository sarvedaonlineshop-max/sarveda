"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import type { OrderPublic } from "@/lib/orders-api";
import { fetchOrderPublic, orderInvoiceDownloadUrl } from "@/lib/orders-api";
import { formatINRFromPaise } from "@/lib/money";

function ConfirmedInner() {
  const search = useSearchParams();
  const orderNumber = search.get("orderNumber") ?? "";
  const email = search.get("email") ?? "";
  const [order, setOrder] = useState<OrderPublic | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!orderNumber || !email) {
      setErr("Missing order details.");
      return;
    }
    void (async () => {
      try {
        const o = await fetchOrderPublic(orderNumber, email);
        setOrder(o);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Could not load order");
      }
    })();
  }, [orderNumber, email]);

  if (err || (!order && !orderNumber)) {
    return (
      <div className="mx-auto max-w-lg rounded-2xl border border-stone-100 bg-white p-8 text-center shadow-sm">
        <p className="text-stone-600">{err ?? "Invalid link"}</p>
        <Link href="/shop" className="mt-6 inline-block font-medium text-amber-800 hover:underline">
          Back to shop
        </Link>
      </div>
    );
  }

  if (!order) {
    return <p className="text-center text-stone-500">Loading your order…</p>;
  }

  return (
    <div className="mx-auto max-w-lg rounded-2xl border border-stone-100 bg-white p-8 shadow-sm">
      <p className="text-center text-sm font-semibold uppercase tracking-widest text-emerald-600">Order confirmed</p>
      <h1 className="mt-3 text-center font-serif text-2xl font-semibold text-stone-900">Thank you</h1>
      <p className="mt-2 text-center text-stone-500">
        We&apos;ve received your payment for order{" "}
        <span className="font-medium text-stone-800">{order.orderNumber}</span>.
      </p>
      <div className="mt-8 border-t border-stone-100 pt-6">
        <p className="text-sm text-stone-500">Total paid</p>
        <p className="font-serif text-2xl font-semibold text-amber-800">
          {formatINRFromPaise(order.grandTotalInPaise)}
        </p>
        <p className="mt-1 text-xs text-stone-500">{order.paymentStatus === "CAPTURED" ? "Payment captured" : order.paymentStatus}</p>
      </div>
      <ul className="mt-6 space-y-2 text-sm text-stone-600">
        {order.items.map((i) => (
          <li key={`${i.skuSnapshot}-${i.nameSnapshot}`} className="flex justify-between gap-2">
            <span className="line-clamp-2">
              {i.nameSnapshot} × {i.qtyOrdered}
            </span>
            <span className="shrink-0">{formatINRFromPaise(i.lineTotalInPaise)}</span>
          </li>
        ))}
      </ul>
      <Link
        href="/shop"
        className="mt-8 flex min-h-[48px] w-full items-center justify-center rounded-xl bg-stone-900 font-semibold text-amber-400 transition-colors hover:bg-amber-700 hover:text-white"
      >
        Continue shopping
      </Link>
      {order.paymentStatus === "CAPTURED" || order.status === "PAID" ? (
        <a
          href={orderInvoiceDownloadUrl(order.orderNumber, email)}
          className="mt-3 flex min-h-[48px] w-full items-center justify-center rounded-xl border border-stone-300 font-semibold text-stone-800"
        >
          Download GST invoice
        </a>
      ) : null}
    </div>
  );
}

export default function OrderConfirmedPage() {
  return (
    <main className="min-h-screen bg-stone-50 px-4 py-16 sm:px-6">
      <Suspense fallback={<p className="text-center text-stone-500">Loading…</p>}>
        <ConfirmedInner />
      </Suspense>
    </main>
  );
}
