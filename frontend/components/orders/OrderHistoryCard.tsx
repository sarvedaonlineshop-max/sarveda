"use client";

import Link from "next/link";

import { formatMinorFromPaise } from "@/lib/money";
import type { OrderSummary } from "@/lib/orders-api";
import { orderInvoiceDownloadUrl } from "@/lib/orders-api";

function formatPlacedDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric"
  });
}

function statusHeadline(order: OrderSummary): { title: string; sub?: string } {
  if (order.paymentStatus === "CAPTURED" || order.status === "PAID") {
    if (order.status === "SHIPPED") return { title: "Shipped", sub: "Your package is on the way." };
    if (order.status === "DELIVERED") return { title: "Delivered", sub: "Your order was delivered." };
    if (order.status === "PROCESSING" || order.status === "PACKED") {
      return { title: "Processing", sub: "We are preparing your order." };
    }
    return { title: "Order placed", sub: "Payment received." };
  }
  if (order.status === "CANCELLED") {
    return { title: "Cancelled", sub: "This order was cancelled." };
  }
  if (order.status === "PENDING_PAYMENT") {
    return { title: "Payment pending", sub: "Complete payment to confirm this order." };
  }
  return { title: order.status.replaceAll("_", " "), sub: undefined };
}

type Props = {
  order: OrderSummary;
  email: string;
  shipToName?: string;
};

export function OrderHistoryCard({ order, email, shipToName }: Props) {
  const paid = order.paymentStatus === "CAPTURED" || order.status === "PAID";
  const detailsHref = `/order/confirmed?orderNumber=${encodeURIComponent(order.orderNumber)}&email=${encodeURIComponent(email)}`;
  const { title, sub } = statusHeadline(order);
  const totalLabel = formatMinorFromPaise(order.grandTotalInPaise, order.currency);

  return (
    <article className="overflow-hidden rounded-lg border border-[rgba(196,176,232,0.25)] bg-white shadow-sm">
      <div className="grid gap-2 border-b border-[rgba(196,176,232,0.25)] bg-brand-violet-light px-4 py-3 text-xs text-brand-mid sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <p className="font-semibold uppercase tracking-wide text-brand-muted">Order placed</p>
          <p className="mt-0.5 font-medium text-brand-ink">
            {formatPlacedDate(order.placedAt ?? order.createdAt)}
          </p>
        </div>
        <div>
          <p className="font-semibold uppercase tracking-wide text-brand-muted">Total</p>
          <p className="mt-0.5 font-medium text-brand-ink">{totalLabel}</p>
        </div>
        <div>
          <p className="font-semibold uppercase tracking-wide text-brand-muted">Ship to</p>
          <p className="mt-0.5 font-medium text-brand-ink">{shipToName ?? "—"}</p>
        </div>
        <div className="sm:text-right">
          <p className="font-semibold uppercase tracking-wide text-brand-muted">Order #</p>
          <p className="mt-0.5 font-mono text-brand-ink">{order.orderNumber}</p>
          <p className="mt-1">
            <Link href={detailsHref} className="font-medium text-sky-700 hover:text-sky-900 hover:underline">
              View order details
            </Link>
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-base font-semibold text-brand-ink">{title}</p>
          {sub ? <p className="mt-1 text-sm text-brand-mid">{sub}</p> : null}
          <p className="mt-3 text-sm text-brand-ink">
            <Link href={detailsHref} className="text-sky-700 hover:underline">
              {order.headline}
            </Link>
          </p>
          <p className="mt-1 text-xs text-brand-muted">
            {order.itemCount} item{order.itemCount === 1 ? "" : "s"}
          </p>
        </div>
        <div className="flex shrink-0 flex-col gap-2 sm:w-52">
          <Link
            href={detailsHref}
            className="inline-flex min-h-[36px] items-center justify-center rounded-full border border-[rgba(196,176,232,0.35)] bg-brand-bg px-4 text-sm font-medium text-brand-ink hover:bg-brand-violet-light"
          >
            View order details
          </Link>
          {paid ? (
            <a
              href={orderInvoiceDownloadUrl(order.orderNumber, email)}
              className="inline-flex min-h-[36px] items-center justify-center rounded-full border border-[rgba(196,176,232,0.35)] bg-white px-4 text-sm font-medium text-brand-ink hover:bg-brand-violet-light"
            >
              Invoice
            </a>
          ) : null}
        </div>
      </div>
    </article>
  );
}
