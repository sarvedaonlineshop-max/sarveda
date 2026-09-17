/**
 * Admin + storefront helpers for unpaid checkout attempts.
 * DB status stays CANCELLED / PENDING_PAYMENT; customers never see these as orders.
 */

/** Hide from My Orders: unpaid checkout, including in-flight PENDING_PAYMENT. */
export function isAbandonedCheckoutAttempt(
  status: string,
  paymentStatus: string,
  paymentProvider?: string | null,
  isCod?: boolean
): boolean {
  if (isCod || paymentProvider === "COD") return false;
  if (paymentStatus === "CAPTURED" || paymentStatus === "PARTIALLY_REFUNDED") return false;
  return status === "PENDING_PAYMENT" || status === "CANCELLED";
}

/** Timed-out / never-paid checkout stored as CANCELLED — admin shows Abandoned. */
export function isUnpaidCheckoutAttempt(
  status: string,
  paymentStatus: string,
  paymentProvider?: string | null
): boolean {
  if (status !== "CANCELLED") return false;
  return isAbandonedCheckoutAttempt(status, paymentStatus, paymentProvider);
}

/** COD cash collected after delivery — only then "PAID" is accurate. */
export function isCodPaymentCollected(
  status: string,
  paymentStatus: string,
  paymentProvider?: string | null
): boolean {
  if (paymentProvider !== "COD") return false;
  return status === "DELIVERED" && paymentStatus === "CAPTURED";
}

/** Label for admin badges — Abandoned when payment never completed. */
export function adminOrderStatusLabel(
  status: string,
  paymentStatus: string,
  paymentProvider?: string | null
): string {
  if (isUnpaidCheckoutAttempt(status, paymentStatus, paymentProvider)) {
    return "ABANDONED";
  }
  // COD: never show PAID until delivered + cash collected — desk uses Confirmed.
  if (
    paymentProvider === "COD" &&
    status === "PAID" &&
    !isCodPaymentCollected(status, paymentStatus, paymentProvider)
  ) {
    return "CONFIRMED";
  }
  return status;
}

export function formatAdminOrderStatusLabel(
  status: string,
  paymentStatus: string,
  paymentProvider?: string | null
): string {
  return adminOrderStatusLabel(status, paymentStatus, paymentProvider).replace(/_/g, " ");
}

/** Least-progressed first: a multi-parcel order is only as far along as its slowest box. */
const SHIPMENT_FLOW: string[] = ["CREATED", "PICKED", "INTRANSIT", "OUT_FOR_DELIVERY", "DELIVERED"];

const SHIPMENT_STAGE_LABEL: Record<string, string> = {
  CREATED: "LABEL CREATED",
  PICKED: "PICKED",
  INTRANSIT: "IN TRANSIT",
  OUT_FOR_DELIVERY: "OUT FOR DELIVERY",
  DELIVERED: "DELIVERED",
  RTO: "RTO"
};

/**
 * Desk badge for the orders list. `PROCESSING` covers everything from "payment in,
 * nothing packed" to "handed to the courier", so read the labels instead: no label
 * means the order is still waiting in Shipments → Ready to ship, and once labels
 * exist the carrier's own status is the truth.
 */
export function adminOrderStageLabel(
  status: string,
  paymentStatus: string,
  paymentProvider?: string | null,
  shipmentStatuses?: string[] | null
): string {
  const base = formatAdminOrderStatusLabel(status, paymentStatus, paymentProvider);
  if (!["PROCESSING", "PACKED", "SHIPPED", "DELIVERED"].includes(status)) return base;

  const labels = shipmentStatuses ?? [];
  if (labels.length === 0) {
    // No label to back the claim — show where the order actually sits on the desk.
    return status === "PROCESSING" || status === "SHIPPED" ? "READY TO SHIP" : base;
  }
  if (status === "DELIVERED") return "DELIVERED";
  if (labels.includes("RTO")) return "RTO";

  const lagging = labels
    .slice()
    .sort((a, b) => SHIPMENT_FLOW.indexOf(a) - SHIPMENT_FLOW.indexOf(b))[0];
  return SHIPMENT_STAGE_LABEL[lagging] ?? base;
}

/** Table column: razorpay / stripe / paypal / COD */
export function formatAdminPaymentMethod(provider?: string | null): string {
  if (!provider) return "—";
  const p = provider.toUpperCase();
  if (p === "COD") return "COD";
  if (p === "RAZORPAY") return "razorpay";
  if (p === "STRIPE") return "stripe";
  if (p === "PAYPAL") return "paypal";
  return provider.toLowerCase();
}
