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

/** Label for admin badges — Abandoned when payment never completed. */
export function adminOrderStatusLabel(
  status: string,
  paymentStatus: string,
  paymentProvider?: string | null
): string {
  if (isUnpaidCheckoutAttempt(status, paymentStatus, paymentProvider)) {
    return "ABANDONED";
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
