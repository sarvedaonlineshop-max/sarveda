"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import type { OrderPublic } from "@/lib/orders-api";
import { fetchOrderPublic, orderInvoiceDownloadUrl } from "@/lib/orders-api";
import { formatINRFromPaise } from "@/lib/money";

function formatAddress(addr: NonNullable<OrderPublic["shippingAddress"]>): string {
  const lines = [
    addr.fullName,
    addr.line1,
    addr.line2,
    `${addr.city}, ${addr.state} ${addr.postalCode}`,
    addr.country
  ].filter(Boolean);
  return lines.join("\n");
}

function ConfirmedInner() {
  const search = useSearchParams();
  const orderNumber = search.get("orderNumber") ?? "";
  const email = search.get("email") ?? "";
  const codFromUrl = search.get("cod") === "1";
  const [order, setOrder] = useState<OrderPublic | null>(null);
  const [err, setErr] = useState<string | null>(null);

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

  if (!orderNumber || !email) {
    return (
      <div className="mx-auto max-w-lg rounded-2xl border border-stone-100 bg-white p-8 text-center shadow-sm">
        <p className="text-stone-600">Missing order details.</p>
        <Link href="/shop" className="mt-6 inline-block font-medium text-amber-800 hover:underline">
          Continue shopping
        </Link>
      </div>
    );
  }

  if (!order && err) {
    return (
      <div className="mx-auto max-w-lg rounded-2xl border border-stone-100 bg-white p-8 text-center shadow-sm">
        <p className="text-stone-600">{err}</p>
        <Link href="/shop" className="mt-6 inline-block font-medium text-amber-800 hover:underline">
          Continue shopping
        </Link>
      </div>
    );
  }

  if (!order) {
    return <p className="text-center text-stone-500">Loading your order…</p>;
  }

  const isCod = order.isCod || codFromUrl || order.paymentProvider === "COD";
  const addr = order.shippingAddress;

  return (
    <div className="mx-auto max-w-2xl">
      <div className="rounded-2xl border border-emerald-200 bg-gradient-to-b from-emerald-50/80 to-white p-6 shadow-sm md:p-8">
        <p className="text-center text-sm font-semibold uppercase tracking-widest text-emerald-700">
          {isCod ? "Order placed" : "Payment received"}
        </p>
        <h1 className="mt-2 text-center font-serif text-2xl font-semibold text-stone-900 md:text-3xl">
          Thank you for your order
        </h1>
        <p className="mt-3 text-center text-stone-600">
          Order <span className="font-mono font-semibold text-stone-900">{order.orderNumber}</span>
          {isCod
            ? " — pay in cash when your package arrives."
            : " — we have received your payment."}
        </p>

        {isCod ? (
          <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            <p className="font-semibold">Cash on delivery</p>
            <p className="mt-1 text-amber-900/90">
              Estimated delivery: <strong>5–8 business days</strong> for most Indian pincodes after dispatch.
              We will email you at {order.email} when your order ships.
            </p>
          </div>
        ) : (
          <p className="mt-4 text-center text-sm text-stone-500">
            Confirmation sent to <span className="font-medium text-stone-700">{order.email}</span>
          </p>
        )}
      </div>

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500">Order summary</h2>
          <ul className="mt-4 space-y-2 text-sm text-stone-700">
            {order.items.map((i) => (
              <li key={`${i.skuSnapshot}-${i.nameSnapshot}`} className="flex justify-between gap-2">
                <span className="line-clamp-2">
                  {i.nameSnapshot} × {i.qtyOrdered}
                </span>
                <span className="shrink-0 font-medium">{formatINRFromPaise(i.lineTotalInPaise)}</span>
              </li>
            ))}
          </ul>
          <dl className="mt-4 space-y-1 border-t border-stone-100 pt-3 text-sm">
            <div className="flex justify-between text-stone-600">
              <dt>Subtotal</dt>
              <dd>{formatINRFromPaise(order.subtotalInPaise)}</dd>
            </div>
            <div className="flex justify-between text-stone-600">
              <dt>Shipping</dt>
              <dd>{formatINRFromPaise(order.shippingInPaise)}</dd>
            </div>
            <div className="flex justify-between pt-1 text-base font-semibold text-stone-900">
              <dt>{isCod ? "Pay on delivery" : "Total paid"}</dt>
              <dd className="text-amber-800">{formatINRFromPaise(order.grandTotalInPaise)}</dd>
            </div>
          </dl>
        </section>

        {addr ? (
          <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500">Deliver to</h2>
            <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-stone-700">
              {formatAddress(addr)}
            </p>
            <p className="mt-3 text-sm text-stone-600">Phone: {addr.phone}</p>
          </section>
        ) : null}
      </div>

      {(order.shipments ?? []).length > 0 ? (
        <section className="mt-6 rounded-2xl border border-stone-200 bg-white p-5 text-sm text-stone-600 shadow-sm">
          <p className="font-semibold text-stone-800">Tracking</p>
          <ul className="mt-2 space-y-2">
            {order.shipments.map((s) => (
              <li key={s.id}>
                {s.courier}
                {s.awb ? (
                  <>
                    {" "}
                    · AWB {s.awb}{" "}
                    <Link href={`/track/${encodeURIComponent(s.awb)}`} className="font-semibold text-amber-800 underline">
                      Track
                    </Link>
                  </>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Link
          href="/shop"
          className="flex min-h-[48px] flex-1 items-center justify-center rounded-xl bg-stone-900 font-semibold text-amber-400 transition-colors hover:bg-amber-700 hover:text-white"
        >
          Continue shopping
        </Link>
        {!isCod && (order.paymentStatus === "CAPTURED" || order.status === "PAID") ? (
          <a
            href={orderInvoiceDownloadUrl(order.orderNumber, email)}
            className="flex min-h-[48px] flex-1 items-center justify-center rounded-xl border border-stone-300 font-semibold text-stone-800"
          >
            Download invoice
          </a>
        ) : null}
      </div>
    </div>
  );
}

export default function OrderConfirmedPage() {
  return (
    <main className="min-h-screen bg-stone-50 px-4 py-10 sm:px-6 md:py-14">
      <Suspense fallback={<p className="text-center text-stone-500">Loading…</p>}>
        <ConfirmedInner />
      </Suspense>
    </main>
  );
}
