"use client";

import Link from "next/link";
import { useState } from "react";

import { DEFAULT_DISPLAY_GST_RATE, extractGst } from "@/lib/gst";
import { formatMinorFromPaise } from "@/lib/money";
import { copyToClipboard, paymentProviderLabel } from "@/lib/order-display";
import type { OrderPublic } from "@/lib/orders-api";
import { orderCancelledPageUrl, orderInvoiceDownloadUrl } from "@/lib/orders-api";
import { delhiveryTrackUrl } from "@/lib/shipment-labels";

type Props = {
  order: OrderPublic;
  /** Checkout email from the URL (authorizes public fetch + invoice). */
  accessEmail: string;
};

function formatPlacedDate(value: string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric"
  });
}

function orderIsPaid(order: OrderPublic): boolean {
  if (order.paymentStatus === "CAPTURED" || order.status === "PAID") return true;
  if (order.isCod || order.paymentProvider === "COD") {
    return !["PENDING_PAYMENT", "CANCELLED", "REFUNDED"].includes(order.status);
  }
  return false;
}

type StatusKey = "paid" | "cancelled" | "refunded" | "pending" | "other";

function orderStatusMeta(order: OrderPublic): {
  key: StatusKey;
  label: string;
  emoji: string;
  pillClass: string;
  borderClass: string;
  headerClass: string;
} {
  if (order.status === "REFUNDED") {
    return {
      key: "refunded",
      label: "Refunded",
      emoji: "💸",
      pillClass: "bg-[#FAEEDA] text-[#633806]",
      borderClass: "border-l-[#D99A2B]",
      headerClass: "bg-[#FAEEDA]/50"
    };
  }
  if (order.status === "CANCELLED") {
    return {
      key: "cancelled",
      label: "Cancelled",
      emoji: "❌",
      pillClass: "bg-[#FCEBEB] text-[#791F1F]",
      borderClass: "border-l-[#C0453F]",
      headerClass: "bg-[#FCEBEB]/50"
    };
  }
  if (orderIsPaid(order)) {
    return {
      key: "paid",
      label: "Paid",
      emoji: "✅",
      pillClass: "bg-[#E1F5EE] text-[#085041]",
      borderClass: "border-l-[#1D9E75]",
      headerClass: "bg-[#E1F5EE]/50"
    };
  }
  if (order.status === "PENDING_PAYMENT") {
    return {
      key: "pending",
      label: "Payment pending",
      emoji: "⏳",
      pillClass: "bg-[#FAEEDA] text-[#633806]",
      borderClass: "border-l-[#D99A2B]",
      headerClass: "bg-[#FAEEDA]/50"
    };
  }
  return {
    key: "other",
    label: order.status.replaceAll("_", " "),
    emoji: "📦",
    pillClass: "bg-brand-cream-dark text-brand-muted",
    borderClass: "border-l-brand-cream-dark",
    headerClass: "bg-brand-cream/50"
  };
}

function deliveryProgress(order: OrderPublic): { emoji: string; text: string } | null {
  if (order.status === "DELIVERED") return { emoji: "🎉", text: "Your order was delivered." };
  if (order.status === "SHIPPED") return { emoji: "🚚", text: "Package is on the way." };
  if (order.status === "PROCESSING" || order.status === "PACKED") {
    return { emoji: "📦", text: "Package is being prepared." };
  }
  return { emoji: "🕓", text: "Item yet to be packed." };
}

function InfoRow({
  emoji,
  label,
  children
}: {
  emoji: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 px-5 py-3">
      <span
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-cream text-base"
        aria-hidden="true"
      >
        {emoji}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-muted">{label}</p>
        <div className="mt-0.5 text-sm text-brand-ink">{children}</div>
      </div>
    </div>
  );
}

function CostLine({
  label,
  amountInPaise,
  currency,
  strong,
  negative
}: {
  label: string;
  amountInPaise: number;
  currency: string;
  strong?: boolean;
  negative?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1">
      <span className={`text-sm ${strong ? "font-semibold text-brand-ink" : "text-brand-muted"}`}>{label}</span>
      <span className={`shrink-0 text-sm ${strong ? "font-semibold text-brand-forest" : "text-brand-ink"}`}>
        {negative ? "−" : ""}
        {formatMinorFromPaise(Math.abs(amountInPaise), currency)}
      </span>
    </div>
  );
}

export function OrderPublicDetailCard({ order, accessEmail }: Props) {
  const [awbCopied, setAwbCopied] = useState(false);
  const email = (accessEmail || order.email || "").trim().toLowerCase();
  const paid = orderIsPaid(order);
  const pendingPayment = order.status === "PENDING_PAYMENT" && !paid;
  const cancelledUnpaid = order.status === "CANCELLED" && !paid;
  const status = orderStatusMeta(order);
  const totalLabel = formatMinorFromPaise(order.grandTotalInPaise, order.currency);
  const isCod = order.isCod || order.paymentProvider === "COD";
  const itemCount = order.items.reduce((n, i) => n + i.qtyOrdered, 0);
  const headline =
    order.items.length === 0
      ? "Order"
      : order.items.length === 1
        ? order.items[0]!.nameSnapshot
        : `${order.items[0]!.nameSnapshot} +${order.items.length - 1} more`;

  const shipment = order.shipments[0];
  const awb = shipment?.awb?.trim() || null;
  const courierTrackUrl =
    shipment?.trackingUrl?.trim() || (awb ? delhiveryTrackUrl(awb) : null) || (awb ? `/track/${encodeURIComponent(awb)}` : null);
  const canTrackCourier =
    paid &&
    !!courierTrackUrl &&
    ["PROCESSING", "PACKED", "SHIPPED", "DELIVERED"].includes(order.status);
  const deliveryPartner = shipment?.courier?.trim() || null;
  const progress = paid && !canTrackCourier ? deliveryProgress(order) : null;

  const addr = order.shippingAddress;
  const addressLines = addr
    ? [
        addr.fullName,
        addr.line1,
        addr.line2,
        `${addr.city}, ${addr.state} ${addr.postalCode}`,
        addr.country
      ].filter((line): line is string => !!line?.trim())
    : [];
  const hasAddressData = addressLines.length > 0;

  const isIndia = order.currency === "INR" || addr?.country === "IN";
  const merchandiseAfterDiscount = Math.max(0, order.subtotalInPaise - (order.discountInPaise ?? 0));
  const { gstInPaise } = extractGst(merchandiseAfterDiscount, DEFAULT_DISPLAY_GST_RATE);

  const payHref = `/checkout?${new URLSearchParams({ orderNumber: order.orderNumber, email }).toString()}`;
  const reorderHref = orderCancelledPageUrl(order.orderNumber, email);

  return (
    <article
      className={`overflow-hidden rounded-r-2xl border border-brand-cream-dark border-l-4 ${status.borderClass} bg-white shadow-card`}
    >
      <header
        className={`flex flex-wrap items-center justify-between gap-2 border-b border-brand-cream-dark px-5 py-3 ${status.headerClass}`}
      >
        <div className="min-w-0">
          <p className="text-sm text-brand-ink">
            <span aria-hidden="true">📦 </span>
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-muted">
              Order ID:
            </span>{" "}
            <span className="font-mono font-semibold">{order.orderNumber}</span>
          </p>
          <p className="mt-0.5 text-xs text-brand-muted">
            Placed on {formatPlacedDate(order.placedAt ?? order.createdAt)}
          </p>
        </div>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${status.pillClass}`}
        >
          <span aria-hidden="true">{status.emoji}</span>
          {status.label}
        </span>
      </header>

      <div className="divide-y divide-brand-cream-dark/60">
        <InfoRow emoji="🛍️" label="Items">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <span className="min-w-0 font-medium">{headline}</span>
            <span className="shrink-0 font-semibold text-brand-forest">{totalLabel}</span>
          </div>
          <p className="mt-0.5 text-xs text-brand-muted">
            {itemCount} item{itemCount === 1 ? "" : "s"} in this order
          </p>
        </InfoRow>

        <InfoRow emoji={isCod ? "💵" : "💳"} label="Payment mode">
          <div>
            <p>
              {isCod
                ? "Cash on delivery"
                : paid
                  ? `Paid online via ${paymentProviderLabel(order.paymentProvider)}`
                  : pendingPayment
                    ? "Payment not completed"
                    : paymentProviderLabel(order.paymentProvider)}
            </p>
          </div>
          {status.key === "refunded" ? (
            <span className="mt-1 block text-xs text-[#633806]">Amount refunded to source</span>
          ) : null}
        </InfoRow>

        {paid ? (
          <InfoRow emoji="🚚" label="Delivery">
            {canTrackCourier && courierTrackUrl ? (
              <div className="flex flex-wrap items-center gap-3">
                <a
                  href={courierTrackUrl}
                  target={courierTrackUrl.startsWith("http") ? "_blank" : undefined}
                  rel={courierTrackUrl.startsWith("http") ? "noopener noreferrer" : undefined}
                  className="inline-flex min-h-[36px] items-center justify-center gap-1.5 rounded-full bg-brand-forest px-4 text-sm font-medium text-brand-cream no-underline transition-colors hover:bg-brand-night"
                >
                  <span aria-hidden="true">🚚</span>
                  Track package
                </a>
                {deliveryPartner ? (
                  <span className="text-xs text-brand-muted">
                    via <span className="font-semibold text-brand-ink">{deliveryPartner}</span>
                    {awb ? (
                      <span className="mt-0.5 flex flex-wrap items-center gap-2">
                        <span className="font-mono text-[11px]">AWB {awb}</span>
                        <button
                          type="button"
                          onClick={() => {
                            void copyToClipboard(awb).then((ok) => {
                              if (ok) {
                                setAwbCopied(true);
                                setTimeout(() => setAwbCopied(false), 2000);
                              }
                            });
                          }}
                          className="rounded-full border border-brand-cream-dark bg-white px-2 py-0.5 text-[10px] font-semibold text-brand-forest hover:bg-brand-cream"
                        >
                          {awbCopied ? "Copied" : "Copy"}
                        </button>
                      </span>
                    ) : null}
                  </span>
                ) : awb ? (
                  <span className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-brand-muted">
                    <span className="font-mono text-[11px]">AWB {awb}</span>
                    <button
                      type="button"
                      onClick={() => {
                        void copyToClipboard(awb).then((ok) => {
                          if (ok) {
                            setAwbCopied(true);
                            setTimeout(() => setAwbCopied(false), 2000);
                          }
                        });
                      }}
                      className="rounded-full border border-brand-cream-dark bg-white px-2 py-0.5 text-[10px] font-semibold text-brand-forest hover:bg-brand-cream"
                    >
                      {awbCopied ? "Copied" : "Copy"}
                    </button>
                  </span>
                ) : null}
              </div>
            ) : progress ? (
              <span>
                <span aria-hidden="true">{progress.emoji} </span>
                {progress.text}
              </span>
            ) : null}
          </InfoRow>
        ) : null}

        <details className="group">
          <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-3 transition-colors hover:bg-brand-cream/40 [&::-webkit-details-marker]:hidden">
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-cream text-base"
              aria-hidden="true"
            >
              🧾
            </span>
            <span className="flex-1 text-sm font-medium text-brand-ink">Order details</span>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              className="shrink-0 text-brand-muted transition-transform duration-150 group-open:rotate-180"
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </summary>

          <div className="grid gap-4 px-5 pb-4 pt-1 sm:grid-cols-2">
            <div className="rounded-xl bg-brand-cream/50 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-muted">
                Cost breakdown
              </p>
              <div className="mt-2">
                {order.items.map((item, i) => (
                  <div key={`${item.skuSnapshot}-${i}`} className="flex items-baseline justify-between gap-4 py-1">
                    <span className="min-w-0 text-sm text-brand-ink">
                      {item.nameSnapshot}
                      <span className="ml-1.5 text-xs text-brand-muted">× {item.qtyOrdered}</span>
                    </span>
                    <span className="shrink-0 text-sm text-brand-ink">
                      {formatMinorFromPaise(item.lineTotalInPaise, order.currency)}
                    </span>
                  </div>
                ))}
                {order.items.length ? <div className="my-2 border-t border-brand-cream-dark/60" /> : null}
                <CostLine label="Item(s) subtotal" amountInPaise={order.subtotalInPaise} currency={order.currency} />
                <CostLine label="Shipping" amountInPaise={order.shippingInPaise} currency={order.currency} />
                {(order.discountInPaise ?? 0) > 0 ? (
                  <CostLine
                    label={order.couponCode ? `Discount (${order.couponCode})` : "Discount"}
                    amountInPaise={order.discountInPaise}
                    currency={order.currency}
                    negative
                  />
                ) : null}
                <div className="my-2 border-t border-brand-cream-dark/60" />
                <CostLine
                  label={isCod ? "Grand total (COD)" : "Grand total"}
                  amountInPaise={order.grandTotalInPaise}
                  currency={order.currency}
                  strong
                />
                {isIndia ? (
                  <p className="mt-1 text-xs text-brand-muted">
                    GST included: {formatMinorFromPaise(gstInPaise, order.currency)} ({DEFAULT_DISPLAY_GST_RATE}%)
                  </p>
                ) : null}
              </div>
            </div>

            <div className="rounded-xl bg-brand-cream/50 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-muted">
                <span aria-hidden="true">📍 </span>Delivery address
              </p>
              {hasAddressData ? (
                <div className="mt-2 text-sm text-brand-ink">
                  {addressLines.map((line, i) => (
                    <p key={i} className={i === 0 ? "font-medium" : "mt-0.5"}>
                      {line}
                    </p>
                  ))}
                  {addr?.phone ? (
                    <p className="mt-1.5 text-xs text-brand-muted">
                      <span aria-hidden="true">📞 </span>
                      {addr.phone}
                    </p>
                  ) : null}
                </div>
              ) : (
                <p className="mt-2 text-xs italic text-brand-muted">Address not available for this order.</p>
              )}
            </div>
          </div>
        </details>
      </div>

      <footer className="flex flex-wrap items-center gap-2 border-t border-brand-cream-dark bg-brand-cream/40 px-5 py-3">
        {pendingPayment && email ? (
          <Link
            href={payHref}
            className="inline-flex min-h-[36px] items-center justify-center gap-1.5 rounded-full bg-brand-forest px-4 text-sm font-medium text-brand-cream transition-colors hover:bg-brand-night"
          >
            <span aria-hidden="true">⚡</span>
            Complete payment
          </Link>
        ) : null}

        {cancelledUnpaid && email ? (
          <Link
            href={reorderHref}
            className="inline-flex min-h-[36px] items-center justify-center gap-1.5 rounded-full bg-brand-forest px-4 text-sm font-medium text-brand-cream transition-colors hover:bg-brand-night"
          >
            <span aria-hidden="true">🔄</span>
            Reorder items
          </Link>
        ) : null}

        {paid && email ? (
          <a
            href={orderInvoiceDownloadUrl(order.orderNumber, email)}
            className="inline-flex min-h-[36px] items-center justify-center gap-1.5 rounded-full border border-brand-forest/25 bg-white px-4 text-sm font-medium text-brand-forest hover:bg-brand-forest/5"
          >
            <span aria-hidden="true">📄</span>
            Invoice
          </a>
        ) : null}

        <Link
          href={`/contact?orderNumber=${encodeURIComponent(order.orderNumber)}`}
          className="inline-flex min-h-[36px] items-center justify-center gap-1.5 rounded-full bg-[#FAEEDA] px-4 text-sm font-semibold text-[#633806] transition-colors hover:bg-[#FAC775]/60"
        >
          <span aria-hidden="true">💬</span>
          Need help?
        </Link>
      </footer>
    </article>
  );
}
