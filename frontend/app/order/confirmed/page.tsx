"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import { checkoutSummaryBoxClass } from "@/lib/checkout-ui";
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

type StepState = "done" | "active" | "todo";

function trackingSteps(order: OrderPublic, paid: boolean, isCod: boolean): { label: string; state: StepState }[] {
  const shipped = ["SHIPPED", "DELIVERED"].includes(order.status);
  const processing = ["PROCESSING", "PACKED", "SHIPPED", "DELIVERED", "PAID"].includes(order.status);

  return [
    { label: "Order placed", state: "done" },
    {
      label: isCod ? "Cash on delivery" : "Payment",
      state: paid || isCod ? "done" : order.status === "PENDING_PAYMENT" ? "active" : "todo"
    },
    {
      label: "Processing",
      state: order.status === "DELIVERED" ? "done" : processing ? (shipped ? "done" : "active") : "todo"
    },
    { label: "Delivered", state: order.status === "DELIVERED" ? "done" : "todo" }
  ];
}

function OrderTrackingSteps({ steps }: { steps: { label: string; state: StepState }[] }) {
  return (
    <ol className="mx-auto mt-10 flex max-w-lg items-start justify-between gap-2">
      {steps.map((step, index) => (
        <li key={step.label} className="relative flex flex-1 flex-col items-center">
          {index < steps.length - 1 ? (
            <span
              className="absolute left-[calc(50%+16px)] top-4 hidden h-0.5 w-[calc(100%-32px)] sm:block"
              style={{
                background: step.state === "done" ? "#2E7D52" : "rgba(196,176,232,0.35)"
              }}
              aria-hidden
            />
          ) : null}
          <span
            className={`relative z-10 flex h-8 w-8 items-center justify-center rounded-full text-xs font-medium ${
              step.state === "done"
                ? "bg-brand-green text-white"
                : step.state === "active"
                  ? "bg-brand-violet text-white"
                  : "bg-brand-violet-light text-brand-mid"
            }`}
          >
            {step.state === "done" ? "✓" : index + 1}
          </span>
          <span
            className={`mt-2 text-center text-[10px] uppercase tracking-[0.08em] ${
              step.state === "active"
                ? "text-brand-lavender"
                : step.state === "done"
                  ? "text-brand-green"
                  : "text-[rgba(196,176,232,0.45)]"
            }`}
          >
            {step.label}
          </span>
        </li>
      ))}
    </ol>
  );
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
        if (!cartCleared && (o.paymentStatus === "CAPTURED" || o.status === "PAID" || o.isCod)) {
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
      <div className={`mx-auto max-w-3xl text-center ${checkoutSummaryBoxClass}`}>
        <p className="text-brand-mid">Missing order details.</p>
        <Link
          href="/shop"
          className="mt-6 inline-flex min-h-[48px] items-center justify-center rounded-xl bg-brand-violet px-6 text-sm font-semibold text-white hover:bg-brand-violet-mid"
        >
          Continue shopping
        </Link>
      </div>
    );
  }

  if (!order && err) {
    return (
      <div className={`mx-auto max-w-3xl text-center ${checkoutSummaryBoxClass}`}>
        <p className="text-brand-mid">{err}</p>
        <Link
          href="/shop"
          className="mt-6 inline-flex min-h-[48px] items-center justify-center rounded-xl bg-brand-violet px-6 text-sm font-semibold text-white hover:bg-brand-violet-mid"
        >
          Continue shopping
        </Link>
      </div>
    );
  }

  if (!order) {
    return <p className="text-center font-light text-brand-lavender">Loading order details…</p>;
  }

  const isCod = order.isCod || codFromUrl || order.paymentProvider === "COD";
  const addr = order.shippingAddress;
  const fmt = (n: number) => formatMinorFromPaise(n, order.currency);
  const paid = order.paymentStatus === "CAPTURED" || order.status === "PAID";
  const steps = trackingSteps(order, paid, isCod);
  const headline = statusTitle(order, codFromUrl);

  return (
    <div className="overflow-hidden">
      <section
        className="px-4 py-12 text-center sm:px-6 md:py-16"
        style={{ background: "linear-gradient(160deg, #22134A 0%, #3A2070 100%)" }}
      >
        <div
          className="mx-auto flex h-[72px] w-[72px] items-center justify-center rounded-full bg-brand-green text-3xl text-white"
          aria-hidden
        >
          ✓
        </div>
        <h1 className="display-text mt-6 text-5xl font-light text-brand-violet-pale md:text-[48px]">
          {headline === "Payment received" || headline === "Order placed" ? (
            <>
              Thank you for your <span className="italic text-brand-lavender">order</span>
            </>
          ) : (
            <>
              Order <span className="italic text-brand-lavender">update</span>
            </>
          )}
        </h1>
        <p
          className="mx-auto mt-4 inline-block rounded-sm border px-4 py-2 font-mono text-sm"
          style={{ borderColor: "rgba(196,176,232,0.2)", color: "#C4B0E8" }}
        >
          {order.orderNumber}
        </p>
        <p className="mt-3 text-sm font-light text-[rgba(196,176,232,0.55)]">
          Placed {formatPlacedDate(order.placedAt ?? order.createdAt)} · Confirmation to {order.email}
        </p>
        <OrderTrackingSteps steps={steps} />
      </section>

      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
        {isCod ? (
          <p className="mb-6 text-center text-sm font-light text-brand-mid">
            Pay in cash when your package arrives. Estimated delivery 5–8 business days after dispatch.
          </p>
        ) : paid ? null : (
          <p className="mb-6 text-center text-sm text-brand-coral">
            We are confirming your payment. Refresh in a moment if this page does not update.
          </p>
        )}

        <div className={`${checkoutSummaryBoxClass} mb-6`}>
          <h2 className="display-text text-[22px] font-normal text-brand-ink">Order items</h2>
          <ul className="mt-4 divide-y divide-[rgba(196,176,232,0.22)]">
            {order.items.map((i) => (
              <li
                key={`${i.skuSnapshot}-${i.nameSnapshot}`}
                className="flex flex-wrap items-start justify-between gap-3 py-4 first:pt-0 last:pb-0"
              >
                <div className="min-w-0">
                  <p className="display-text text-lg font-normal text-brand-ink">{i.nameSnapshot}</p>
                  <p className="mt-1 text-xs font-light text-brand-muted">SKU {i.skuSnapshot}</p>
                  <p className="mt-1 text-sm font-light text-brand-mid">Qty {i.qtyOrdered}</p>
                </div>
                <p className="price-text text-base font-medium text-brand-violet">{fmt(i.lineTotalInPaise)}</p>
              </li>
            ))}
          </ul>
          <dl className="mt-6 space-y-2 border-t border-[rgba(196,176,232,0.22)] pt-4 text-[13px]">
            <div className="flex justify-between gap-4">
              <dt className="font-light text-brand-mid">Subtotal</dt>
              <dd className="price-text font-medium text-brand-ink">{fmt(order.subtotalInPaise)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="font-light text-brand-mid">Shipping</dt>
              <dd className="price-text font-medium text-brand-ink">{fmt(order.shippingInPaise)}</dd>
            </div>
            <div className="flex justify-between gap-4 pt-2">
              <dt className="font-light text-brand-mid">Total paid</dt>
              <dd className="price-text text-[26px] font-semibold text-brand-ink">
                {fmt(order.grandTotalInPaise)}
              </dd>
            </div>
          </dl>
        </div>

        {addr ? (
          <div className={`mb-6 grid gap-4 lg:grid-cols-2 ${checkoutSummaryBoxClass}`}>
            <div>
              <p className="text-[10px] font-normal uppercase tracking-[0.12em] text-brand-violet">Ship to</p>
              <p className="mt-2 whitespace-pre-line text-sm font-light leading-relaxed text-brand-mid">
                {formatAddress(addr)}
              </p>
              <p className="mt-2 text-sm font-light text-brand-muted">Phone: {addr.phone}</p>
            </div>
            <div>
              <p className="text-[10px] font-normal uppercase tracking-[0.12em] text-brand-violet">Payment</p>
              <p className="mt-2 text-sm font-medium text-brand-ink">
                {isCod ? "Cash on delivery" : order.paymentProvider ?? "Online payment"}
              </p>
            </div>
          </div>
        ) : null}

        {(order.shipments ?? []).length > 0 ? (
          <section className={`mb-6 ${checkoutSummaryBoxClass}`}>
            <p className="text-[10px] font-normal uppercase tracking-[0.12em] text-brand-violet">Tracking</p>
            <ul className="mt-3 space-y-2 text-sm font-light text-brand-mid">
              {order.shipments.map((s) => (
                <li key={s.id}>
                  {s.courier}
                  {s.awb ? (
                    <>
                      {" "}
                      · AWB {s.awb}{" "}
                      <Link
                        href={`/track/${encodeURIComponent(s.awb)}`}
                        className="font-medium text-brand-violet underline hover:text-brand-violet-mid"
                      >
                        Track package
                      </Link>
                    </>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <div className="flex flex-wrap justify-center gap-3">
          <Link
            href="/shop"
            className="inline-flex min-h-[48px] items-center justify-center rounded-xl bg-brand-violet px-8 text-sm font-semibold uppercase tracking-wide text-white hover:bg-brand-violet-mid"
          >
            Continue shopping
          </Link>
          {(order.shipments ?? []).some((s) => s.awb) ? (
            <Link
              href={`/track/${encodeURIComponent(order.shipments![0]!.awb!)}`}
              className="inline-flex min-h-[48px] items-center justify-center rounded-xl bg-brand-violet-light px-8 text-sm font-semibold uppercase tracking-wide text-brand-violet-deep hover:opacity-90"
            >
              Track order
            </Link>
          ) : (
            <Link
              href="/profile"
              className="inline-flex min-h-[48px] items-center justify-center rounded-xl bg-brand-violet-light px-8 text-sm font-semibold uppercase tracking-wide text-brand-violet-deep hover:opacity-90"
            >
              Your orders
            </Link>
          )}
          {!isCod && paid ? (
            <a
              href={orderInvoiceDownloadUrl(order.orderNumber, email)}
              className="inline-flex min-h-[48px] items-center justify-center rounded-xl border border-[rgba(196,176,232,0.3)] px-8 text-sm font-medium text-brand-mid hover:bg-brand-bg"
            >
              Download invoice
            </a>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default function OrderConfirmedPage() {
  return (
    <main className="min-h-screen bg-brand-bg">
      <Suspense fallback={<p className="py-16 text-center font-light text-brand-mid">Loading…</p>}>
        <ConfirmedInner />
      </Suspense>
    </main>
  );
}
