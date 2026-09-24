const CARRIER_ACTION_STATUSES = new Set([
  "PAID",
  "PROCESSING",
  "PACKED",
  "SHIPPED",
  "DELIVERED"
]);

/** Order-page carrier buttons: captured pay, or COD that stays PENDING until cash collection. */
export function carrierActionsEnabled(order: {
  status: string;
  paymentStatus: string;
  payments?: Array<{ provider?: string | null }>;
}): boolean {
  if (["CANCELLED", "REFUNDED", "PENDING_PAYMENT"].includes(order.status)) return false;
  if (!CARRIER_ACTION_STATUSES.has(order.status)) return false;
  if (order.paymentStatus === "CAPTURED" || order.paymentStatus === "PARTIALLY_REFUNDED") {
    return true;
  }
  return (
    order.paymentStatus === "PENDING" &&
    (order.payments ?? []).some((p) => p.provider === "COD")
  );
}
