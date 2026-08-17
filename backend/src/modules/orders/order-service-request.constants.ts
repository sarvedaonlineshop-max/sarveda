export const CANCEL_BEFORE_DELIVERY_REASONS = [
  { code: "mistake", label: "Placed the order by mistake" },
  { code: "price_high", label: "Found it cheaper somewhere else" },
  { code: "delivery_slow", label: "Delivery is taking too long" },
  { code: "change_address", label: "Need to change the delivery address" },
  { code: "wrong_item", label: "Ordered the wrong item, size, or colour" },
  { code: "change_quantity", label: "Need to change the quantity" },
  { code: "no_longer_needed", label: "No longer needed" },
  { code: "other", label: "Other" }
] as const;

export const REFUND_AFTER_DELIVERY_REASONS = [
  { code: "defective", label: "Item is defective or doesn't work" },
  { code: "wrong_item_sent", label: "Wrong item was sent" },
  { code: "damaged_delivery", label: "Damaged during delivery" },
  { code: "different_description", label: "Different from the description or photos" },
  { code: "missing_parts", label: "Missing parts or accessories" },
  { code: "replace_variant", label: "Want to replace with a different size or colour" },
  { code: "quality_issue", label: "Quality is not as expected" },
  { code: "extra_item", label: "Received an extra item I didn't order" },
  { code: "arrived_late", label: "Arrived too late" },
  { code: "changed_mind", label: "Changed my mind / no longer needed" },
  { code: "other", label: "Other" }
] as const;

export type CancelReasonCode = (typeof CANCEL_BEFORE_DELIVERY_REASONS)[number]["code"];
export type RefundReasonCode = (typeof REFUND_AFTER_DELIVERY_REASONS)[number]["code"];

export function cancelReasonLabel(code: string): string | undefined {
  return CANCEL_BEFORE_DELIVERY_REASONS.find((r) => r.code === code)?.label;
}

export function refundReasonLabel(code: string): string | undefined {
  return REFUND_AFTER_DELIVERY_REASONS.find((r) => r.code === code)?.label;
}

export const ADMIN_CARE_EMAIL = process.env.ADMIN_CARE_EMAIL?.trim() || "care@sarveda.com";

/** Return / replace is allowed for this many days after the order is marked delivered. */
export const RETURN_WINDOW_DAYS = 7;
