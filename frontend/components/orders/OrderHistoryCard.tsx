"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { formatMinorFromPaise } from "@/lib/money";
import type { OrderSummary } from "@/lib/orders-api";
import { orderCancelledPageUrl, orderInvoiceDownloadUrl } from "@/lib/orders-api";
import { reorderCancelledAndCheckout } from "@/lib/reorder-cancelled";

function formatPlacedDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric"
  });
}

function statusHeadline(order: OrderSummary): { title: string; sub?: string } {
  const isCod = order.isCod || order.paymentProvider === "COD";
  if (order.paymentStatus === "CAPTURED" || order.status === "PAID" || (isCod && order.status !== "CANCELLED")) {
    if (order.status === "SHIPPED") return { title: "Shipped", sub: "Your package is on the way." };
    if (order.status === "DELIVERED") return { title: "Delivered", sub: "Your order was delivered." };
    if (order.status === "PROCESSING" || order.status === "PACKED") {
      return { title: "Processing", sub: "We are preparing your order." };
    }
    if (isCod) return { title: "Order placed", sub: "Pay in cash when your package arrives." };
    return { title: "Order placed", sub: "Payment received." };
  }
  if (order.status === "CANCELLED") {
    return { title: "Cancelled", sub: "This order was cancelled." };
  }
  if (order.status === "PENDING_PAYMENT") {
    return { title: "Payment pending", sub: "Complete payment to confirm this order." };
  }
  if (order.status === "CANCELLED" && order.paymentStatus !== "CAPTURED") {
    return { title: "Cancelled", sub: "Payment was not completed — you can reorder the same items." };
  }
  return { title: order.status.replaceAll("_", " "), sub: undefined };
}

type Props = {
  order: OrderSummary;
  /** Logged-in account email when order.email is missing from API. */
  accountEmail?: string;
  shipToName?: string;
};

function checkoutResumeHref(orderNumber: string, email: string): string {
  return `/checkout?${new URLSearchParams({ orderNumber, email }).toString()}`;
}

function orderAccessEmail(order: OrderSummary, accountEmail?: string): string {
  const raw = order.email?.trim() || accountEmail?.trim() || "";
  return raw.toLowerCase();
}

function shipToLabel(order: OrderSummary, accountEmail?: string, shipToName?: string): string {
  if (shipToName?.trim()) return shipToName.trim();
  const email = orderAccessEmail(order, accountEmail);
  if (!email) return "—";
  return email.split("@")[0] ?? "—";
}

function orderIsPaid(order: OrderSummary): boolean {
  if (order.paymentStatus === "CAPTURED" || order.status === "PAID") return true;
  if (order.isCod || order.paymentProvider === "COD") {
    return !["PENDING_PAYMENT", "CANCELLED", "REFUNDED"].includes(order.status);
  }
  return false;
}

export function OrderHistoryCard({ order, accountEmail, shipToName }: Props) {
  const router = useRouter();
  const [reorderBusy, setReorderBusy] = useState(false);
  const [reorderErr, setReorderErr] = useState<string | null>(null);
  const email = orderAccessEmail(order, accountEmail);
  const paid = orderIsPaid(order);
  const pendingPayment = order.status === "PENDING_PAYMENT" && !paid;
  const cancelledUnpaid = order.status === "CANCELLED" && !paid;
  const detailsHref = `/order/confirmed?orderNumber=${encodeURIComponent(order.orderNumber)}&email=${encodeURIComponent(email)}`;
  const payHref = checkoutResumeHref(order.orderNumber, email);
  const cancelledDetailsHref = orderCancelledPageUrl(order.orderNumber, email);
  const { title, sub } = statusHeadline(order);
  const totalLabel = formatMinorFromPaise(order.grandTotalInPaise, order.currency);

  async function handleReorder() {
    if (!email) {
      setReorderErr("Order email missing — open order details from your confirmation email.");
      return;
    }
    setReorderBusy(true);
    setReorderErr(null);
    try {
      await reorderCancelledAndCheckout(order.orderNumber, email, router);
    } catch (err) {
      setReorderErr(err instanceof Error ? err.message : "Could not reorder");
      setReorderBusy(false);
    }
  }

  return (
    <article className="overflow-hidden rounded-lg border border-stone-200 bg-white shadow-sm">
      {/* ── Meta strip (removed duplicate "View order details" link) ── */}
      <div className="grid gap-2 border-b border-stone-200 bg-stone-100 px-4 py-3 text-xs text-stone-600 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <p className="font-semibold uppercase tracking-wide text-stone-500">Order placed</p>
          <p className="mt-0.5 font-medium text-stone-900">
            {formatPlacedDate(order.placedAt ?? order.createdAt)}
          </p>
        </div>
        <div>
          <p className="font-semibold uppercase tracking-wide text-stone-500">Total</p>
          <p className="mt-0.5 font-medium text-stone-900">{totalLabel}</p>
        </div>
        <div>
          <p className="font-semibold uppercase tracking-wide text-stone-500">Ship to</p>
          <p className="mt-0.5 font-medium text-stone-900">{shipToLabel(order, accountEmail, shipToName)}</p>
        </div>
        <div className="sm:text-right">
          <p className="font-semibold uppercase tracking-wide text-stone-500">Order #</p>
          <p className="mt-0.5 font-mono text-stone-900">{order.orderNumber}</p>
          {/* ↑ "View order details" link removed from here — it was duplicated below */}
        </div>
      </div>

      {/* ── Body ── */}
      <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-base font-semibold text-stone-900">{title}</p>
          {sub ? <p className="mt-1 text-sm text-stone-600">{sub}</p> : null}
          <p className="mt-3 text-sm text-stone-800">
            <Link href={detailsHref} className="text-sky-700 hover:underline">
              {order.headline}
            </Link>
          </p>
          <p className="mt-1 text-xs text-stone-500">
            {order.itemCount} item{order.itemCount === 1 ? "" : "s"}
          </p>
          {reorderErr ? (
            <p className="mt-2 text-xs text-red-600" role="alert">
              {reorderErr}
            </p>
          ) : null}
        </div>

        {/* ── Actions ── */}
        <div className="flex shrink-0 flex-col gap-2 sm:w-52">
          {pendingPayment ? (
            <>
              <Link
                href={payHref}
                className="inline-flex min-h-[36px] items-center justify-center gap-1.5 rounded-full bg-stone-900 px-4 text-sm font-medium text-amber-400 hover:bg-stone-700"
              >
                Complete payment
              </Link>
              <Link
                href={detailsHref}
                className="inline-flex min-h-[36px] items-center justify-center gap-1.5 rounded-full border border-stone-300 bg-white px-4 text-sm font-medium text-stone-800 hover:bg-stone-50"
              >
                View order details
              </Link>
            </>
          ) : cancelledUnpaid ? (
            <>
              <button
                type="button"
                disabled={reorderBusy}
                onClick={() => void handleReorder()}
                className="inline-flex min-h-[36px] items-center justify-center gap-1.5 rounded-full bg-stone-900 px-4 text-sm font-medium text-amber-400 hover:bg-stone-700 disabled:opacity-60"
              >
                {reorderBusy ? "Adding to cart…" : "Reorder items"}
              </button>
              <Link
                href={cancelledDetailsHref}
                className="inline-flex min-h-[36px] items-center justify-center gap-1.5 rounded-full border border-stone-300 bg-white px-4 text-sm font-medium text-stone-800 hover:bg-stone-50"
              >
                Why cancelled?
              </Link>
            </>
          ) : (
            <Link
              href={detailsHref}
              className="inline-flex min-h-[36px] items-center justify-center gap-1.5 rounded-full bg-stone-900 px-4 text-sm font-medium text-white hover:bg-stone-700"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>
                <circle cx="12" cy="9" r="2.5"/>
              </svg>
              Track order
            </Link>
          )}

          {/* Invoice (paid orders only) */}
          {paid ? (
            <a
              href={orderInvoiceDownloadUrl(order.orderNumber, email)}
              className="inline-flex min-h-[36px] items-center justify-center gap-1.5 rounded-full border border-stone-300 bg-white px-4 text-sm font-medium text-stone-800 hover:bg-stone-50"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="16" y1="13" x2="8" y2="13"/>
                <line x1="16" y1="17" x2="8" y2="17"/>
              </svg>
              Invoice
            </a>
          ) : null}

          {/* Need help? */}
          <Link
            href={`/contact?orderNumber=${encodeURIComponent(order.orderNumber)}`}
            className="inline-flex min-h-[36px] items-center justify-center gap-1.5 rounded-full px-4 text-sm text-stone-400 hover:text-stone-600"
          >
            Need help?
          </Link>
        </div>
      </div>
    </article>
  );
}
