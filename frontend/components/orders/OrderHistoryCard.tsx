"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { formatMinorFromPaise } from "@/lib/money";
import type { OrderSummary } from "@/lib/orders-api";
import { orderCancelledPageUrl, orderInvoiceDownloadUrl } from "@/lib/orders-api";
import { checkoutReorderUrl } from "@/lib/reorder-cancelled";
import { delhiveryTrackUrl } from "@/lib/shipment-labels";

function formatPlacedDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric"
  });
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

/** Exported so YourOrders can bucket orders into Paid / Cancelled / Refunded tabs. */
export function orderIsPaid(order: OrderSummary): boolean {
  if (order.paymentStatus === "CAPTURED" || order.status === "PAID") return true;
  if (order.isCod || order.paymentProvider === "COD") {
    return !["PENDING_PAYMENT", "CANCELLED", "REFUNDED"].includes(order.status);
  }
  return false;
}

type StatusKey = "paid" | "cancelled" | "refunded" | "pending" | "other";

/**
 * Payment-level status shown in the card header.
 * Literal hex values by design: semantic status layer, separate from brand palette.
 */
function orderStatusMeta(order: OrderSummary): {
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

/** Delivery progress line for paid orders without a live tracking link. */
function deliveryProgress(order: OrderSummary): { emoji: string; text: string } | null {
  if (order.status === "DELIVERED") return { emoji: "🎉", text: "Your order was delivered." };
  if (order.status === "SHIPPED") return { emoji: "🚚", text: "Package is on the way." };
  if (order.status === "PROCESSING" || order.status === "PACKED") {
    return { emoji: "📦", text: "Package is being prepared." };
  }
  return { emoji: "🕓", text: "Item yet to be packed." };
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
      <span className={strong ? "text-sm font-semibold text-brand-ink" : "text-sm text-brand-muted"}>
        {label}
      </span>
      <span className={strong ? "text-sm font-semibold text-brand-forest" : "text-sm text-brand-ink"}>
        {negative ? "− " : ""}
        {formatMinorFromPaise(Math.abs(amountInPaise), currency)}
      </span>
    </div>
  );
}

export function OrderHistoryCard({ order, accountEmail, shipToName }: Props) {
  const router = useRouter();
  const email = orderAccessEmail(order, accountEmail);
  const paid = orderIsPaid(order);
  const pendingPayment = order.status === "PENDING_PAYMENT" && !paid;
  const cancelledUnpaid = order.status === "CANCELLED" && !paid;
  const payHref = checkoutResumeHref(order.orderNumber, email);
  const cancelledDetailsHref = orderCancelledPageUrl(order.orderNumber, email);
  const status = orderStatusMeta(order);
  const totalLabel = formatMinorFromPaise(order.grandTotalInPaise, order.currency);
  const isCod = order.isCod || order.paymentProvider === "COD";
  const courierTrackUrl =
    order.trackingUrl?.trim() ||
    (order.awb?.trim() ? delhiveryTrackUrl(order.awb.trim()) : null);
  const canTrackCourier =
    paid &&
    !!courierTrackUrl &&
    ["PROCESSING", "PACKED", "SHIPPED", "DELIVERED"].includes(order.status);
  const deliveryPartner = order.deliveryPartner?.trim() || null;
  const progress = paid && !canTrackCourier ? deliveryProgress(order) : null;

  const breakdown = order.costBreakdown ?? null;
  const address = order.shippingAddress ?? null;
  const lineItems = order.lineItems ?? null;
  const hasBreakdownData =
    !!lineItems?.length ||
    breakdown?.itemsSubtotalInPaise != null ||
    breakdown?.shippingInPaise != null ||
    breakdown?.gstIncludedInPaise != null;
  const hasAddressData = !!(address?.line1 || address?.city || address?.pincode || address?.phone);

  const addressLines = address
    ? [
        address.name,
        address.line1,
        address.line2,
        [address.city, address.state, address.pincode].filter(Boolean).join(", "),
        address.country
      ].filter((line): line is string => !!line?.trim())
    : [];

  return (
    <article
      className={`overflow-hidden rounded-r-2xl border border-brand-cream-dark border-l-4 ${status.borderClass} bg-white shadow-card transition-all duration-150 hover:-translate-y-0.5 hover:shadow-lg motion-reduce:transition-none motion-reduce:hover:translate-y-0`}
    >
      {/* ── Header: order ID + payment status ── */}
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

      {/* ── Meaningful info rows ── */}
      <div className="divide-y divide-brand-cream-dark/60">
        <InfoRow emoji="🛍️" label="Items">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <span className="min-w-0 font-medium">{order.headline}</span>
            <span className="shrink-0 font-semibold text-brand-forest">{totalLabel}</span>
          </div>
          <p className="mt-0.5 text-xs text-brand-muted">
            {order.itemCount} item{order.itemCount === 1 ? "" : "s"} in this order
          </p>
        </InfoRow>

        <InfoRow emoji={isCod ? "💵" : "💳"} label="Payment mode">
          {isCod ? "Cash on delivery" : "Paid online"}
          {status.key === "refunded" ? (
            <span className="ml-2 text-xs text-[#633806]">— amount refunded to source</span>
          ) : null}
        </InfoRow>

        {paid ? (
          <InfoRow emoji="🚚" label="Delivery">
            {canTrackCourier ? (
              <div className="flex flex-wrap items-center gap-3">
                <a
                  href={courierTrackUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-[36px] items-center justify-center gap-1.5 rounded-full bg-brand-forest px-4 text-sm font-medium text-brand-cream no-underline transition-colors hover:bg-brand-night"
                >
                  <span aria-hidden="true">🚚</span>
                  Track package
                </a>
                {deliveryPartner ? (
                  <span className="text-xs text-brand-muted">
                    via <span className="font-semibold text-brand-ink">{deliveryPartner}</span>
                    {order.awb ? <span className="block font-mono text-[11px]">AWB {order.awb}</span> : null}
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

        {/* ── Collapsible: cost split + full address ── */}
        <details className="group">
          <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-3 transition-colors hover:bg-brand-cream/40 [&::-webkit-details-marker]:hidden">
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-cream text-base"
              aria-hidden="true"
            >
              🧾
            </span>
            <span className="flex-1 text-sm font-medium text-brand-ink">
              Cost split &amp; delivery address
            </span>
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
            {/* Cost breakdown */}
            <div className="rounded-xl bg-brand-cream/50 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-muted">
                Cost breakdown
              </p>
              {hasBreakdownData ? (
                <div className="mt-2">
                  {lineItems?.length
                    ? lineItems.map((item, i) => (
                        <div key={i} className="flex items-baseline justify-between gap-4 py-1">
                          <span className="min-w-0 text-sm text-brand-ink">
                            {item.title}
                            <span className="ml-1.5 text-xs text-brand-muted">× {item.quantity}</span>
                          </span>
                          <span className="shrink-0 text-sm text-brand-ink">
                            {formatMinorFromPaise(item.lineTotalInPaise, order.currency)}
                          </span>
                        </div>
                      ))
                    : null}
                  {lineItems?.length ? <div className="my-2 border-t border-brand-cream-dark/60" /> : null}
                  {breakdown?.itemsSubtotalInPaise != null ? (
                    <CostLine label="Item(s) subtotal" amountInPaise={breakdown.itemsSubtotalInPaise} currency={order.currency} />
                  ) : null}
                  {breakdown?.shippingInPaise != null ? (
                    <CostLine label="Shipping" amountInPaise={breakdown.shippingInPaise} currency={order.currency} />
                  ) : null}
                  {breakdown?.discountInPaise != null && breakdown.discountInPaise !== 0 ? (
                    <CostLine label="Discount" amountInPaise={breakdown.discountInPaise} currency={order.currency} negative />
                  ) : null}
                  <div className="my-2 border-t border-brand-cream-dark/60" />
                  <CostLine
                    label={isCod ? "Grand total (COD)" : "Grand total"}
                    amountInPaise={order.grandTotalInPaise}
                    currency={order.currency}
                    strong
                  />
                  {breakdown?.gstIncludedInPaise != null ? (
                    <p className="mt-1 text-xs text-brand-muted">
                      GST included: {formatMinorFromPaise(breakdown.gstIncludedInPaise, order.currency)}
                      {breakdown.gstRateLabel ? ` (${breakdown.gstRateLabel})` : ""}
                    </p>
                  ) : null}
                </div>
              ) : (
                <div className="mt-2">
                  <CostLine
                    label={isCod ? "Grand total (COD)" : "Grand total"}
                    amountInPaise={order.grandTotalInPaise}
                    currency={order.currency}
                    strong
                  />
                  <p className="mt-1 text-xs italic text-brand-muted">
                    Detailed split-up coming soon.
                  </p>
                </div>
              )}
            </div>

            {/* Full address */}
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
                  {address?.phone ? (
                    <p className="mt-1.5 text-xs text-brand-muted">
                      <span aria-hidden="true">📞 </span>
                      {address.phone}
                    </p>
                  ) : null}
                </div>
              ) : (
                <div className="mt-2 text-sm">
                  <p className="font-medium text-brand-ink">{shipToLabel(order, accountEmail, shipToName)}</p>
                  <p className="mt-0.5 text-xs italic text-brand-muted">Full address details coming soon.</p>
                </div>
              )}
            </div>
          </div>
        </details>
      </div>

      {/* ── Actions ── */}
      <footer className="flex flex-wrap items-center gap-2 border-t border-brand-cream-dark bg-brand-cream/40 px-5 py-3">
        {pendingPayment ? (
          <Link
            href={payHref}
            className="inline-flex min-h-[36px] items-center justify-center gap-1.5 rounded-full bg-brand-forest px-4 text-sm font-medium text-brand-cream transition-colors hover:bg-brand-night"
          >
            <span aria-hidden="true">⚡</span>
            Complete payment
          </Link>
        ) : null}

        {cancelledUnpaid ? (
          <button
            type="button"
            disabled={!email}
            onClick={() => {
              if (!email) return;
              router.push(checkoutReorderUrl(order.orderNumber, email));
            }}
            className="inline-flex min-h-[36px] items-center justify-center gap-1.5 rounded-full bg-brand-forest px-4 text-sm font-medium text-brand-cream transition-colors hover:bg-brand-night disabled:opacity-60"
          >
            <span aria-hidden="true">🔄</span>
            Reorder items
          </button>
        ) : null}

        {paid ? (
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

        {order.status === "CANCELLED" ? (
          <Link
            href={cancelledDetailsHref}
            className="inline-flex min-h-[36px] items-center justify-center gap-1 rounded-full px-3 text-sm text-[#993C1D] hover:text-[#712B13] hover:underline"
          >
            Why cancelled?
          </Link>
        ) : null}
      </footer>
    </article>
  );
}
