export const CANCEL_BEFORE_DELIVERY_REASONS = [
  { code: "mistake", label: "Order placed by mistake" },
  { code: "price_high", label: "Item price is too high / found cheaper elsewhere" },
  { code: "delivery_slow", label: "Delivery time is too long" },
  { code: "change_address", label: "Want to change delivery address" },
  { code: "wrong_item", label: "Ordered wrong item / wrong size or variant" },
  { code: "change_quantity", label: "Need to change quantity" },
  { code: "no_longer_needed", label: "No longer needed" },
  { code: "other", label: "Other" }
] as const;

export const REFUND_AFTER_DELIVERY_REASONS = [
  { code: "defective", label: "Item defective or doesn't work" },
  { code: "wrong_item_sent", label: "Wrong item was sent" },
  { code: "damaged_delivery", label: "Item damaged during delivery" },
  { code: "different_description", label: "Item different from description/images" },
  { code: "missing_parts", label: "Missing parts or accessories" },
  { code: "quality_issue", label: "Quality not as expected" },
  { code: "extra_item", label: "Received extra item I didn't order" },
  { code: "arrived_late", label: "Arrived too late" },
  { code: "changed_mind", label: "No longer needed / changed my mind" },
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
