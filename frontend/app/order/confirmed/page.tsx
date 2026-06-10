"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";

import { clearCartAfterPayment } from "@/lib/clear-cart-after-payment";
import { trackPurchase } from "@/lib/analytics";
import { DEFAULT_DISPLAY_GST_RATE, extractGst } from "@/lib/gst";
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
  if (order.paymentStatus === "CAPTURED" || order.status === "PAID") return "Payment Successful";
  if (order.status === "PENDING_PAYMENT") return "Payment pending";
  return order.status.replaceAll("_", " ");
}

async function downloadInvoicePdf(orderNumber: string, email: string) {
  const res = await fetch(orderInvoiceDownloadUrl(orderNumber, email), { credentials: "include" });
  if (!res.ok) {
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(json.error || "Could not download invoice");
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `invoice-${orderNumber}.pdf`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function ConfirmedInner() {
  const search = useSearchParams();
  const orderNumber = search.get("orderNumber") ?? "";
  const email = search.get("email") ?? "";
  const codFromUrl = search.get("cod") === "1";
  const [order, setOrder] = useState<OrderPublic | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [cartCleared, setCartCleared] = useState(false);
  const [invoiceBusy, setInvoiceBusy] = useState(false);
  const [invoiceErr, setInvoiceErr] = useState<string | null>(null);
  const purchaseTracked = useRef(false);

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
        const paid = o.paymentStatus === "CAPTURED" || o.status === "PAID" || o.isCod;
        if (paid && !purchaseTracked.current) {
          purchaseTracked.current = true;
          trackPurchase({
            orderId: o.orderNumber,
            value: o.grandTotalInPaise,
            currency: o.currency,
            items: o.items.map((i) => ({
              id: i.skuSnapshot,
              name: i.nameSnapshot,
              quantity: i.qtyOrdered,
              price: i.unitPriceInPaise
            }))
          });
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
  const isIndia = order.currency === "INR" || addr?.country === "IN";
  const merchandiseAfterDiscount = Math.max(0, order.subtotalInPaise - (order.discountInPaise ?? 0));
  const { gstInPaise } = extractGst(merchandiseAfterDiscount, DEFAULT_DISPLAY_GST_RATE);

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

      <div className="mt-6 overflow-hidden rounded-lg border border-stone-200 bg-stone-50">
        <div className="border-b border-stone-200 px-4 py-4">
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

        <div className="grid gap-4 border-b border-stone-200 p-4 sm:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase text-stone-500">Payment method</p>
            <p className="mt-2 text-sm font-medium text-stone-900">
              {isCod ? "Cash on delivery" : order.paymentProvider ?? "Online payment"}
            </p>
          </div>
          {addr ? (
            <div>
              <p className="text-xs font-semibold uppercase text-stone-500">Ship to</p>
              <p className="mt-2 whitespace-pre-line text-sm text-stone-800">{formatAddress(addr)}</p>
              <p className="mt-2 text-sm text-stone-600">Phone: {addr.phone}</p>
            </div>
          ) : null}
        </div>

        <div className="px-4 py-4">
          <p className="text-xs font-semibold uppercase text-stone-500">Items</p>
          <ul className="mt-3 divide-y divide-stone-100">
            {order.items.map((i) => (
              <li
                key={`${i.nameSnapshot}-${i.qtyOrdered}`}
                className="flex flex-wrap items-start justify-between gap-3 py-3 first:pt-0"
              >
                <div className="min-w-0">
                  <p className="font-medium text-stone-900">{i.nameSnapshot}</p>
                  <p className="mt-1 text-sm text-stone-600">Qty {i.qtyOrdered}</p>
                </div>
                <p className="text-sm font-semibold text-stone-900">{fmt(i.lineTotalInPaise)}</p>
              </li>
            ))}
          </ul>

          <dl className="mt-4 space-y-1 border-t border-stone-200 pt-4 text-sm">
            <div className="flex justify-between text-stone-600">
              <dt>Item(s) subtotal</dt>
              <dd>{fmt(order.subtotalInPaise)}</dd>
            </div>
            {(order.discountInPaise ?? 0) > 0 ? (
              <div className="flex justify-between text-emerald-800">
                <dt>
                  Coupon discount
                  {order.couponCode ? (
                    <span className="ml-1 font-mono text-xs">({order.couponCode})</span>
                  ) : null}
                </dt>
                <dd>−{fmt(order.discountInPaise)}</dd>
              </div>
            ) : null}
            <div className="flex justify-between text-stone-600">
              <dt>Shipping</dt>
              <dd>{fmt(order.shippingInPaise)}</dd>
            </div>
            <div className="flex justify-between border-t border-stone-200 pt-2 font-semibold text-stone-900">
              <dt>{isCod ? "Grand total (COD)" : "Grand total"}</dt>
              <dd>{fmt(order.grandTotalInPaise)}</dd>
            </div>
            {isIndia ? (
              <p className="pt-1 text-xs text-stone-500">
                GST included: ₹{(gstInPaise / 100).toLocaleString("en-IN")} ({DEFAULT_DISPLAY_GST_RATE}%)
              </p>
            ) : null}
          </dl>
        </div>
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

      {invoiceErr ? (
        <p className="mt-4 text-sm text-red-600" role="alert">
          {invoiceErr}
        </p>
      ) : null}

      <div className="mt-8 flex flex-wrap gap-3">
        <Link
          href="/shop"
          className="inline-flex min-h-[40px] items-center justify-center rounded-full bg-amber-500 px-6 text-sm font-semibold text-stone-900 hover:bg-amber-400"
        >
          Continue shopping
        </Link>
        {!isCod && paid ? (
          <button
            type="button"
            disabled={invoiceBusy}
            onClick={() => {
              setInvoiceBusy(true);
              setInvoiceErr(null);
              void downloadInvoicePdf(order.orderNumber, email)
                .catch((e) => {
                  setInvoiceErr(e instanceof Error ? e.message : "Could not download invoice");
                })
                .finally(() => setInvoiceBusy(false));
            }}
            className="inline-flex min-h-[40px] items-center justify-center rounded-full border border-stone-300 px-6 text-sm font-medium text-stone-800 hover:bg-stone-50 disabled:opacity-60"
          >
            {invoiceBusy ? "Preparing PDF…" : "Download GST invoice"}
          </button>
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
