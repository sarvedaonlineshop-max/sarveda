"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import { formatMinorFromPaise } from "@/lib/money";
import type { OrderPublic } from "@/lib/orders-api";
import { fetchOrderPublic } from "@/lib/orders-api";
import { checkoutReorderUrl } from "@/lib/reorder-cancelled";

function CancelledInner() {
  const search = useSearchParams();
  const router = useRouter();
  const orderNumber = search.get("orderNumber") ?? "";
  const email = search.get("email") ?? "";

  const [order, setOrder] = useState<OrderPublic | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [reorderBusy, setReorderBusy] = useState(false);
  const [reorderMsg, setReorderMsg] = useState<string | null>(null);
  const [reorderWarn, setReorderWarn] = useState<string | null>(null);

  useEffect(() => {
    if (!orderNumber || !email) return;
    void (async () => {
      try {
        setErr(null);
        const o = await fetchOrderPublic(orderNumber, email);
        if (o.status === "PENDING_PAYMENT" && o.paymentStatus !== "CAPTURED") {
          router.replace(
            `/checkout?${new URLSearchParams({ orderNumber, email }).toString()}`
          );
          return;
        }
        setOrder(o);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Could not load order");
      }
    })();
  }, [orderNumber, email, router]);

  if (!orderNumber || !email) {
    return (
      <div className="mx-auto max-w-lg rounded-2xl border border-stone-200 bg-white p-8 text-center shadow-sm">
        <p className="text-stone-600">Missing order details.</p>
        <Link href="/shop" className="mt-6 inline-block font-medium text-sky-700 hover:underline">
          Continue shopping
        </Link>
      </div>
    );
  }

  if (err) {
    return (
      <div className="mx-auto max-w-lg rounded-2xl border border-stone-200 bg-white p-8 text-center shadow-sm">
        <p className="text-stone-600">{err}</p>
        <Link href="/shop" className="mt-6 inline-block font-medium text-sky-700 hover:underline">
          Continue shopping
        </Link>
      </div>
    );
  }

  if (!order) {
    return <p className="text-center text-stone-500">Loading order…</p>;
  }

  const fmt = (n: number) => formatMinorFromPaise(n, order.currency);
  const unpaidCancelled =
    order.status === "CANCELLED" && order.paymentStatus !== "CAPTURED";

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div className="rounded-2xl border border-stone-200 bg-white p-8 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-widest text-amber-800">Sarveda</p>
        <h1 className="mt-2 font-serif text-2xl font-semibold text-stone-900">Order cancelled</h1>
        <p className="mt-3 text-sm text-stone-600">
          {unpaidCancelled ? (
            <>
              Order <span className="font-mono font-medium">{order.orderNumber}</span> was cancelled
              because payment was not completed in time. If any amount was deducted, it will be
              refunded within 5–10 business days, depending on your bank or payment provider.
            </>
          ) : (
            <>
              Order <span className="font-mono font-medium">{order.orderNumber}</span> has been
              cancelled. If any amount was deducted, it will be refunded within 5–10 business days,
              depending on your bank or payment provider.
            </>
          )}
        </p>

        <div className="mt-6 rounded-xl border border-stone-100 bg-stone-50 p-4 text-sm">
          <p className="font-medium text-stone-900">Items from this order</p>
          <ul className="mt-3 divide-y divide-stone-100">
            {order.items.map((item) => (
              <li
                key={`${item.skuSnapshot}-${item.qtyOrdered}`}
                className="flex justify-between gap-3 py-2 first:pt-0"
              >
                <span className="text-stone-700">
                  {item.nameSnapshot} × {item.qtyOrdered}
                </span>
                <span className="shrink-0 font-medium text-stone-900">{fmt(item.lineTotalInPaise)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 border-t border-stone-200 pt-3 text-right font-semibold text-stone-900">
            Total {fmt(order.grandTotalInPaise)}
          </p>
        </div>

        {reorderMsg ? (
          <p className="mt-4 text-sm text-emerald-800" role="status">
            {reorderMsg}
          </p>
        ) : null}
        {reorderWarn ? (
          <p className="mt-2 text-sm text-amber-800" role="status">
            {reorderWarn}
          </p>
        ) : null}

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          {unpaidCancelled ? (
            <button
              type="button"
              disabled={reorderBusy}
              onClick={() => {
                setReorderBusy(true);
                setReorderMsg(null);
                setReorderWarn(null);
                router.push(checkoutReorderUrl(orderNumber, email));
                setReorderBusy(false);
              }}
              className="inline-flex min-h-[48px] flex-1 items-center justify-center rounded-xl bg-stone-900 px-4 text-sm font-semibold text-amber-400 hover:bg-stone-700 disabled:opacity-60"
            >
              {reorderBusy ? "Adding to cart…" : "Reorder same items"}
            </button>
          ) : null}
          <Link
            href="/shop"
            className="inline-flex min-h-[48px] flex-1 items-center justify-center rounded-xl border border-stone-300 bg-white px-4 text-sm font-semibold text-stone-800 hover:bg-stone-50"
          >
            Continue shopping
          </Link>
        </div>

        <p className="mt-4 text-xs text-stone-500">
          Coupons and shipping are recalculated at checkout. Need help?{" "}
          <a href="mailto:hello@sarveda.com" className="text-sky-700 hover:underline">
            Contact us
          </a>
          .
        </p>
      </div>

      <p className="text-center text-sm text-stone-500">
        <Link
          href={`/order/confirmed?${new URLSearchParams({ orderNumber, email }).toString()}`}
          className="text-sky-700 hover:underline"
        >
          View order details
        </Link>
      </p>
    </div>
  );
}

export default function OrderCancelledPage() {
  return (
    <main className="min-h-screen bg-stone-50 px-4 py-16">
      <Suspense fallback={<p className="text-center text-stone-500">Loading…</p>}>
        <CancelledInner />
      </Suspense>
    </main>
  );
}
