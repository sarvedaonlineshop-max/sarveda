"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import type { OrderPublic } from "@/lib/orders-api";
import { fetchOrderPublic, orderInvoiceDownloadUrl, refreshOrderShippingPublic } from "@/lib/orders-api";
import { formatINRFromPaise } from "@/lib/money";

function ConfirmedInner() {
  const search = useSearchParams();
  const orderNumber = search.get("orderNumber") ?? "";
  const email = search.get("email") ?? "";
  const [order, setOrder] = useState<OrderPublic | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (!orderNumber || !email) return;
    void (async () => {
      try {
        setErr(null);
        const o = await fetchOrderPublic(orderNumber, email);
        setOrder(o);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Could not load order");
      }
    })();
  }, [orderNumber, email]);

  async function onRefreshTracking() {
    if (!orderNumber || !email) return;
    setRefreshing(true);
    setErr(null);
    try {
      const { order: next } = await refreshOrderShippingPublic(orderNumber, email);
      setOrder(next);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not refresh tracking");
    } finally {
      setRefreshing(false);
    }
  }

  if (!orderNumber || !email) {
    return (
      <div className="mx-auto max-w-lg rounded-2xl border border-stone-100 bg-white p-8 text-center shadow-sm">
        <p className="text-stone-600">Missing order details.</p>
        <Link href="/shop" className="mt-6 inline-block font-medium text-amber-800 hover:underline">
          Back to shop
        </Link>
      </div>
    );
  }

  if (!order && err) {
    return (
      <div className="mx-auto max-w-lg rounded-2xl border border-stone-100 bg-white p-8 text-center shadow-sm">
        <p className="text-stone-600">{err}</p>
        <Link href="/shop" className="mt-6 inline-block font-medium text-amber-800 hover:underline">
          Back to shop
        </Link>
      </div>
    );
  }

  if (!order) {
    return <p className="text-center text-stone-500">Loading your order…</p>;
  }

  const shipments = order.shipments ?? [];

  return (
    <div className="mx-auto max-w-lg rounded-2xl border border-stone-100 bg-white p-8 shadow-sm">
      {err ? (
        <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-center text-sm text-red-800" role="alert">
          {err}
        </p>
      ) : null}
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

      <div className="mt-8 border-t border-stone-100 pt-6">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold text-stone-800">Delivery</p>
          <button
            type="button"
            disabled={refreshing || ["CANCELLED", "REFUNDED", "PENDING_PAYMENT"].includes(order.status)}
            onClick={() => void onRefreshTracking()}
            className="text-xs font-semibold text-amber-800 underline disabled:opacity-50 dark:text-amber-400"
          >
            {refreshing ? "Updating…" : "Refresh tracking"}
          </button>
        </div>
        {order.shippingLastError ? (
          <p className="mt-2 text-xs text-amber-900 dark:text-amber-200/90">
            Carrier note: {order.shippingLastError}
          </p>
        ) : null}
        {shipments.length === 0 ? (
          <p className="mt-2 text-sm text-stone-500">
            Tracking appears once your parcel is booked with the courier (usually after dispatch processing).
          </p>
        ) : (
          <ul className="mt-3 space-y-3 text-sm text-stone-600">
            {shipments.map((s) => (
              <li
                key={s.id}
                className="rounded-lg border border-stone-100 bg-stone-50/80 p-3 dark:border-stone-700 dark:bg-stone-800/50"
              >
                <p className="font-medium text-stone-800 dark:text-stone-100">{s.courier}</p>
                <p className="mt-1 text-xs text-stone-500">
                  Status:{" "}
                  <span className="font-semibold text-stone-700 dark:text-stone-200">
                    {s.status.replace(/_/g, " ")}
                  </span>
                </p>
                {s.awb ? <p className="mt-1 font-mono text-xs">AWB {s.awb}</p> : null}
                {s.trackingUrl ? (
                  <a
                    href={s.trackingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-block text-xs font-semibold text-amber-800 underline dark:text-amber-400"
                  >
                    Track shipment
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>

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
