/**
 * Admin display helpers — DB status stays CANCELLED for unpaid checkout tries.
 */

export function isUnpaidCheckoutAttempt(
  status: string,
  paymentStatus: string,
  paymentProvider?: string | null
): boolean {
  if (status !== "CANCELLED") return false;
  if (paymentProvider === "COD") return false;
  if (paymentStatus === "CAPTURED" || paymentStatus === "PARTIALLY_REFUNDED") return false;
  return true;
}

/** Label for admin badges — ATTEMPTED when payment never completed. */
export function adminOrderStatusLabel(
  status: string,
  paymentStatus: string,
  paymentProvider?: string | null
): string {
  if (isUnpaidCheckoutAttempt(status, paymentStatus, paymentProvider)) {
    return "ATTEMPTED";
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
