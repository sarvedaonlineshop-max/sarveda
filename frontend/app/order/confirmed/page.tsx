"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";

import { clearCartAfterPayment } from "@/lib/clear-cart-after-payment";
import { trackPurchase } from "@/lib/analytics";
import { DEFAULT_DISPLAY_GST_RATE, extractGst } from "@/lib/gst";
import { formatMinorFromPaise } from "@/lib/money";
import type { OrderPublic } from "@/lib/orders-api";
import { fetchOrderPublic, orderCancelledPageUrl, orderInvoiceDownloadUrl } from "@/lib/orders-api";
import { PaymentSuccessMark } from "@/components/orders/PaymentSuccessMark";

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
  if (order.status === "CANCELLED" && order.paymentStatus !== "CAPTURED") return "Order cancelled";
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
  const router = useRouter();
  const search = useSearchParams();
  const orderNumber = search.get("orderNumber") ?? "";
  const email = search.get("email") ?? "";
  const codFromUrl = search.get("cod") === "1";
  const stripeReturn = search.get("stripe") === "1";
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
        if (
          stripeReturn &&
          !paid &&
          o.status !== "CANCELLED"
        ) {
          const q = new URLSearchParams({ orderNumber, email, outcome: "pending" });
          router.replace(`/payment-failed?${q.toString()}`);
          return;
        }
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
  }, [orderNumber, email, cartCleared, stripeReturn, router]);

  if (!orderNumber || !email) {
    return (
      <div className="mx-auto max-w-3xl rounded-2xl border border-brand-cream-dark bg-white p-8 text-center shadow-card">
        <p className="text-stone-600">Missing order details.</p>
        <Link href="/store" className="mt-6 inline-block font-medium text-brand-forest hover:underline">
          Continue shopping
        </Link>
      </div>
    );
  }

  if (!order && err) {
    return (
      <div className="mx-auto max-w-3xl rounded-2xl border border-brand-cream-dark bg-white p-8 text-center shadow-card">
        <p className="text-stone-600">{err}</p>
        <Link href="/store" className="mt-6 inline-block font-medium text-brand-forest hover:underline">
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
  const pendingPayment = order.status === "PENDING_PAYMENT" && !paid && !isCod;
  const cancelledUnpaid = order.status === "CANCELLED" && !paid && !isCod;
  const checkoutResumeHref = `/checkout?${new URLSearchParams({ orderNumber: order.orderNumber, email }).toString()}`;
  const reorderHref = orderCancelledPageUrl(order.orderNumber, email);
  const isIndia = order.currency === "INR" || addr?.country === "IN";
  const merchandiseAfterDiscount = Math.max(0, order.subtotalInPaise - (order.discountInPaise ?? 0));
  const { gstInPaise } = extractGst(merchandiseAfterDiscount, DEFAULT_DISPLAY_GST_RATE);

  return (
    <div className="mx-auto max-w-4xl">
      <nav className="text-sm text-brand-muted">
        <Link href="/profile" className="hover:text-brand-gold hover:underline">
          Your account
        </Link>
        <span className="mx-2">›</span>
        <span className="text-brand-ink">Order details</span>
      </nav>

      {paid || isCod ? (
        <div className="relative mt-6 overflow-hidden rounded-3xl border border-brand-gold/25 bg-gradient-to-br from-[#1c352a] via-[#2d5040] to-[#48705a] p-8 text-center shadow-lg">
          <span className="pointer-events-none absolute -left-10 top-6 h-32 w-32 rounded-full bg-brand-gold/20 blur-2xl" aria-hidden />
          <span className="pointer-events-none absolute -right-8 bottom-4 h-28 w-28 rounded-full bg-brand-gold-pale/25 blur-2xl" aria-hidden />
          <PaymentSuccessMark playSound soundKey={order.orderNumber} />
          <h1 className="mt-5 font-serif text-3xl font-semibold text-white sm:text-4xl">Thank you for your order</h1>
          <p className="mt-2 text-sm text-brand-gold-pale">
            {statusTitle(order, codFromUrl)} · Placed {formatPlacedDate(order.placedAt ?? order.createdAt)}
          </p>
          <span className="mt-4 inline-flex rounded-full border border-white/20 bg-white/10 px-4 py-1.5 font-mono text-xs font-semibold tracking-wide text-white">
            {order.orderNumber}
          </span>
        </div>
      ) : (
        <>
          <h1 className="mt-3 font-serif text-2xl font-semibold text-brand-ink">Order details</h1>
          <p className="mt-1 text-sm text-brand-muted">
            Order placed {formatPlacedDate(order.placedAt ?? order.createdAt)} · Order number{" "}
            <span className="font-mono font-medium text-brand-ink">{order.orderNumber}</span>
          </p>
        </>
      )}

      <div className="mt-6 overflow-hidden rounded-2xl border border-brand-cream-dark bg-white shadow-card">
        <div className="border-b border-brand-cream-dark px-5 py-4">
          <p className="font-semibold text-brand-ink">
            {paid || isCod ? "Order details" : statusTitle(order, codFromUrl)}
          </p>
          {isCod ? (
            <p className="mt-1 text-sm text-brand-muted">
              Pay in cash when your package arrives. Estimated delivery 5–8 business days after dispatch.
            </p>
          ) : paid ? (
            <p className="mt-1 text-sm text-brand-muted">
              Confirmation sent to <span className="font-medium">{order.email}</span>
            </p>
          ) : cancelledUnpaid ? (
            <p className="mt-1 text-sm text-amber-800">
              This order was cancelled because payment was not completed in time. You can place a fresh order with
              the same items.
            </p>
          ) : pendingPayment ? (
            <p className="mt-1 text-sm text-amber-800">
              Payment was not completed. Finish checkout to confirm this order — unpaid orders are cancelled
              automatically after 15 minutes.
            </p>
          ) : (
            <p className="mt-1 text-sm text-amber-800">We are confirming your payment. Refresh in a moment.</p>
          )}
        </div>

        <div className="grid gap-4 border-b border-brand-cream-dark p-5 sm:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-muted">Payment method</p>
            <p className="mt-2 text-sm font-medium text-brand-ink">
              {isCod ? "Cash on delivery" : order.paymentProvider ?? "Online payment"}
            </p>
          </div>
          {addr ? (
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-muted">Ship to</p>
              <p className="mt-2 whitespace-pre-line text-sm text-brand-ink">{formatAddress(addr)}</p>
              <p className="mt-2 text-sm text-brand-muted">Phone: {addr.phone}</p>
            </div>
          ) : null}
        </div>

        <div className="px-5 py-4">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-muted">Items</p>
          <ul className="mt-3 divide-y divide-brand-cream-dark/60">
            {order.items.map((i) => (
              <li
                key={`${i.nameSnapshot}-${i.qtyOrdered}`}
                className="flex flex-wrap items-start justify-between gap-3 py-3 first:pt-0"
              >
                <div className="min-w-0">
                  <p className="font-medium text-brand-ink">{i.nameSnapshot}</p>
                  <p className="mt-1 text-sm text-brand-muted">Qty {i.qtyOrdered}</p>
                </div>
                <p className="text-sm font-semibold text-brand-ink">{fmt(i.lineTotalInPaise)}</p>
              </li>
            ))}
          </ul>

          <dl className="mt-4 space-y-1 border-t border-brand-cream-dark pt-4 text-sm">
            <div className="flex justify-between text-brand-muted">
              <dt>Item(s) subtotal</dt>
              <dd>{fmt(order.subtotalInPaise)}</dd>
            </div>
            {(order.discountInPaise ?? 0) > 0 ? (
              <div className="flex justify-between text-brand-sage">
                <dt>
                  Coupon discount
                  {order.couponCode ? (
                    <span className="ml-1 font-mono text-xs">({order.couponCode})</span>
                  ) : null}
                </dt>
                <dd>−{fmt(order.discountInPaise)}</dd>
              </div>
            ) : null}
            <div className="flex justify-between text-brand-muted">
              <dt>Shipping</dt>
              <dd>{fmt(order.shippingInPaise)}</dd>
            </div>
            <div className="flex justify-between border-t border-brand-cream-dark pt-2 font-semibold text-brand-ink">
              <dt>{isCod ? "Grand total (COD)" : "Grand total"}</dt>
              <dd className="text-brand-forest">{fmt(order.grandTotalInPaise)}</dd>
            </div>
            {isIndia ? (
              <p className="pt-1 text-xs text-brand-muted">
                GST included: ₹{(gstInPaise / 100).toLocaleString("en-IN")} ({DEFAULT_DISPLAY_GST_RATE}%)
              </p>
            ) : null}
          </dl>
        </div>
      </div>

      {(order.shipments ?? []).length > 0 ? (
        <section className="mt-6 rounded-2xl border border-brand-cream-dark bg-white p-5 text-sm shadow-card">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-muted">Tracking</p>
          <ul className="mt-2 space-y-2 text-brand-muted">
            {order.shipments.map((s) => (
              <li key={s.id}>
                {s.courier}
                {s.awb ? (
                  <>
                    {" "}
                    · AWB {s.awb}{" "}
                    <Link href={`/track/${encodeURIComponent(s.awb)}`} className="font-medium text-brand-forest hover:underline">
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
        {pendingPayment ? (
          <Link
            href={checkoutResumeHref}
            className="inline-flex min-h-[40px] items-center justify-center rounded-full bg-brand-forest px-6 text-sm font-semibold text-brand-cream transition-colors hover:bg-brand-night"
          >
            Complete payment
          </Link>
        ) : null}
        {cancelledUnpaid ? (
          <Link
            href={reorderHref}
            className="inline-flex min-h-[40px] items-center justify-center rounded-full bg-brand-forest px-6 text-sm font-semibold text-brand-cream transition-colors hover:bg-brand-night"
          >
            Reorder same items
          </Link>
        ) : null}
        <Link
          href="/store"
          className="inline-flex min-h-[40px] items-center justify-center rounded-full bg-brand-forest px-6 text-sm font-semibold text-brand-cream transition-colors hover:bg-brand-night"
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
            className="inline-flex min-h-[40px] items-center justify-center rounded-full border border-brand-forest/25 px-6 text-sm font-medium text-brand-forest hover:bg-brand-forest/5 disabled:opacity-60"
          >
            {invoiceBusy ? "Preparing PDF…" : "Download GST invoice"}
          </button>
        ) : null}
        <Link
          href="/profile"
          className="inline-flex min-h-[40px] items-center justify-center rounded-full border border-brand-forest/25 px-6 text-sm font-medium text-brand-forest hover:bg-brand-forest/5"
        >
          Your orders
        </Link>
      </div>
    </div>
  );
}

export default function OrderConfirmedPage() {
  return (
    <main className="min-h-screen bg-brand-cream px-4 py-8 sm:px-6">
      <Suspense fallback={<p className="text-center text-stone-500">Loading…</p>}>
        <ConfirmedInner />
      </Suspense>
    </main>
  );
}
