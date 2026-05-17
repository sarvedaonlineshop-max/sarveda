"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import { clearCartAfterPayment } from "@/lib/clear-cart-after-payment";
import { formatMinorFromPaise } from "@/lib/money";
import type { OrderPublic } from "@/lib/orders-api";
import { fetchOrderPublic, orderInvoiceDownloadUrl } from "@/lib/orders-api";

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

function formatPlacedDate(value: string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric"
  });
}

function statusTitle(order: OrderPublic, codFromUrl: boolean): string {
  const isCod = order.isCod || codFromUrl || order.paymentProvider === "COD";
  if (isCod) return "Order placed";
  if (order.paymentStatus === "CAPTURED" || order.status === "PAID") return "Payment received";
  if (order.status === "PENDING_PAYMENT") return "Payment pending";
  return order.status.replaceAll("_", " ");
}

function ConfirmedInner() {
  const search = useSearchParams();
  const orderNumber = search.get("orderNumber") ?? "";
  const email = search.get("email") ?? "";
  const codFromUrl = search.get("cod") === "1";
  const [order, setOrder] = useState<OrderPublic | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [cartCleared, setCartCleared] = useState(false);

  useEffect(() => {
    if (!orderNumber || !email) return;
    void (async () => {
      try {
        setErr(null);
        const o = await fetchOrderPublic(orderNumber, email);
        setOrder(o);
        if (
          !cartCleared &&
          (o.paymentStatus === "CAPTURED" || o.status === "PAID" || o.isCod)
        ) {
          setCartCleared(true);
          await clearCartAfterPayment();
        }
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Could not load order");
      }
    })();
  }, [orderNumber, email, cartCleared]);

  if (!orderNumber || !email) {
    return (
      <div className="mx-auto max-w-3xl rounded-lg border border-stone-200 bg-white p-8 text-center">
        <p className="text-stone-600">Missing order details.</p>
        <Link href="/shop" className="mt-6 inline-block font-medium text-sky-700 hover:underline">
          Continue shopping
        </Link>
      </div>
    );
  }

  if (!order && err) {
    return (
      <div className="mx-auto max-w-3xl rounded-lg border border-stone-200 bg-white p-8 text-center">
        <p className="text-stone-600">{err}</p>
        <Link href="/shop" className="mt-6 inline-block font-medium text-sky-700 hover:underline">
          Continue shopping
        </Link>
      </div>
    );
  }

  if (!order) {
    return <p className="text-center text-stone-500">Loading order details…</p>;
  }

  const isCod = order.isCod || codFromUrl || order.paymentProvider === "COD";
  const addr = order.shippingAddress;
  const fmt = (n: number) => formatMinorFromPaise(n, order.currency);
  const paid = order.paymentStatus === "CAPTURED" || order.status === "PAID";

  return (
    <div className="mx-auto max-w-4xl">
      <nav className="text-sm text-stone-500">
        <Link href="/profile" className="hover:text-sky-700 hover:underline">
          Your account
        </Link>
        <span className="mx-2">›</span>
        <span className="text-stone-800">Order details</span>
      </nav>

      <h1 className="mt-3 text-2xl font-semibold text-stone-900">Order details</h1>
      <p className="mt-1 text-sm text-stone-600">
        Order placed {formatPlacedDate(order.placedAt ?? order.createdAt)} · Order number{" "}
        <span className="font-mono font-medium text-stone-900">{order.orderNumber}</span>
      </p>

      <div className="mt-6 grid gap-4 border border-stone-200 bg-stone-50 p-4 lg:grid-cols-3">
        {addr ? (
          <div>
            <p className="text-xs font-semibold uppercase text-stone-500">Ship to</p>
            <p className="mt-2 whitespace-pre-line text-sm text-stone-800">{formatAddress(addr)}</p>
            <p className="mt-2 text-sm text-stone-600">Phone: {addr.phone}</p>
          </div>
        ) : null}
        <div>
          <p className="text-xs font-semibold uppercase text-stone-500">Payment method</p>
          <p className="mt-2 text-sm font-medium text-stone-900">
            {isCod ? "Cash on delivery" : order.paymentProvider ?? "Online payment"}
          </p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase text-stone-500">Order summary</p>
          <dl className="mt-2 space-y-1 text-sm">
            <div className="flex justify-between text-stone-600">
              <dt>Item(s) subtotal</dt>
              <dd>{fmt(order.subtotalInPaise)}</dd>
            </div>
            <div className="flex justify-between text-stone-600">
              <dt>Shipping</dt>
              <dd>{fmt(order.shippingInPaise)}</dd>
            </div>
            <div className="flex justify-between border-t border-stone-200 pt-2 font-semibold text-stone-900">
              <dt>{isCod ? "Grand total (COD)" : "Grand total"}</dt>
              <dd>{fmt(order.grandTotalInPaise)}</dd>
            </div>
          </dl>
        </div>
      </div>

      <div className="mt-6 overflow-hidden rounded-lg border border-stone-200 bg-white">
        <div className="border-b border-stone-200 px-4 py-3">
          <p className="font-semibold text-stone-900">{statusTitle(order, codFromUrl)}</p>
          {isCod ? (
            <p className="mt-1 text-sm text-stone-600">
              Pay in cash when your package arrives. Estimated delivery 5–8 business days after dispatch.
            </p>
          ) : paid ? (
            <p className="mt-1 text-sm text-stone-600">
              Confirmation sent to <span className="font-medium">{order.email}</span>
            </p>
          ) : (
            <p className="mt-1 text-sm text-amber-800">We are confirming your payment. Refresh in a moment.</p>
          )}
        </div>

        <ul className="divide-y divide-stone-100">
          {order.items.map((i) => (
            <li
              key={`${i.skuSnapshot}-${i.nameSnapshot}`}
              className="flex flex-wrap items-start justify-between gap-3 px-4 py-4"
            >
              <div className="min-w-0">
                <p className="font-medium text-stone-900">{i.nameSnapshot}</p>
                <p className="mt-1 text-xs text-stone-500">SKU {i.skuSnapshot}</p>
                <p className="mt-1 text-sm text-stone-600">Qty {i.qtyOrdered}</p>
              </div>
              <p className="text-sm font-semibold text-stone-900">{fmt(i.lineTotalInPaise)}</p>
            </li>
          ))}
        </ul>
      </div>

      {(order.shipments ?? []).length > 0 ? (
        <section className="mt-6 rounded-lg border border-stone-200 bg-white p-4 text-sm">
          <p className="font-semibold text-stone-900">Tracking</p>
          <ul className="mt-2 space-y-2 text-stone-600">
            {order.shipments.map((s) => (
              <li key={s.id}>
                {s.courier}
                {s.awb ? (
                  <>
                    {" "}
                    · AWB {s.awb}{" "}
                    <Link href={`/track/${encodeURIComponent(s.awb)}`} className="font-medium text-sky-700 underline">
                      Track package
                    </Link>
                  </>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="mt-8 flex flex-wrap gap-3">
        <Link
          href="/shop"
          className="inline-flex min-h-[40px] items-center justify-center rounded-full bg-amber-500 px-6 text-sm font-semibold text-stone-900 hover:bg-amber-400"
        >
          Continue shopping
        </Link>
        {!isCod && paid ? (
          <a
            href={orderInvoiceDownloadUrl(order.orderNumber, email)}
            className="inline-flex min-h-[40px] items-center justify-center rounded-full border border-stone-300 px-6 text-sm font-medium text-stone-800 hover:bg-stone-50"
          >
            Download invoice
          </a>
        ) : null}
        <Link
          href="/profile"
          className="inline-flex min-h-[40px] items-center justify-center rounded-full border border-stone-300 px-6 text-sm font-medium text-stone-800 hover:bg-stone-50"
        >
          Your orders
        </Link>
      </div>
    </div>
  );
}

export default function OrderConfirmedPage() {
  return (
    <main className="min-h-screen bg-white px-4 py-8 sm:px-6">
      <Suspense fallback={<p className="text-center text-stone-500">Loading…</p>}>
        <ConfirmedInner />
      </Suspense>
    </main>
  );
}
