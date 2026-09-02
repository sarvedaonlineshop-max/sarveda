import type {
  ReturnReplacementResolution,
  ReturnShippingRefundPolicy
} from "@prisma/client";

import { REFUND_AFTER_DELIVERY_REASONS } from "./order-service-request.constants";

/** Configurable via env; default 7 days matches existing policy + legal page. */
export function getReturnWindowDays(): number {
  const raw = process.env.RETURN_WINDOW_DAYS?.trim();
  const n = raw ? Number.parseInt(raw, 10) : 7;
  return Number.isFinite(n) && n > 0 ? n : 7;
}

export type ReturnReasonCode = (typeof REFUND_AFTER_DELIVERY_REASONS)[number]["code"];

export const RETURN_REASON_CODES = REFUND_AFTER_DELIVERY_REASONS.map((r) => r.code);

/** Stable reason codes aligned with customer UI (spec §1). */
export const RETURN_REASON_SPEC: Record<
  ReturnReasonCode,
  {
    label: string;
    allowedResolutions: ReturnReplacementResolution[];
    evidenceRequired: boolean;
    shippingRefundPolicy: ReturnShippingRefundPolicy;
    requiresPhysicalReturn: boolean;
  }
> = {
  defective: {
    label: "Item is defective or doesn't work",
    allowedResolutions: ["RETURN_FOR_REFUND", "REPLACEMENT", "PARTIAL_REFUND"],
    evidenceRequired: true,
    shippingRefundPolicy: "SHIPPING_REFUNDABLE",
    requiresPhysicalReturn: true
  },
  wrong_item_sent: {
    label: "Wrong item was sent",
    allowedResolutions: ["RETURN_FOR_REFUND", "REPLACEMENT"],
    evidenceRequired: true,
    shippingRefundPolicy: "SHIPPING_REFUNDABLE",
    requiresPhysicalReturn: true
  },
  damaged_delivery: {
    label: "Damaged during delivery",
    allowedResolutions: ["RETURN_FOR_REFUND", "REPLACEMENT", "PARTIAL_REFUND"],
    evidenceRequired: true,
    shippingRefundPolicy: "SHIPPING_REFUNDABLE",
    requiresPhysicalReturn: true
  },
  different_description: {
    label: "Different from the description or photos",
    allowedResolutions: ["RETURN_FOR_REFUND", "REPLACEMENT", "PARTIAL_REFUND"],
    evidenceRequired: true,
    shippingRefundPolicy: "SHIPPING_RETAINED",
    requiresPhysicalReturn: true
  },
  missing_parts: {
    label: "Missing parts or accessories",
    allowedResolutions: ["REPLACEMENT", "PARTIAL_REFUND", "KEEP_ITEM_PARTIAL_REFUND"],
    evidenceRequired: true,
    shippingRefundPolicy: "SHIPPING_RETAINED",
    requiresPhysicalReturn: false
  },
  replace_variant: {
    label: "Want to replace with a different size or colour",
    allowedResolutions: ["REPLACEMENT"],
    evidenceRequired: false,
    shippingRefundPolicy: "SHIPPING_RETAINED",
    requiresPhysicalReturn: true
  },
  quality_issue: {
    label: "Quality is not as expected",
    allowedResolutions: ["RETURN_FOR_REFUND", "PARTIAL_REFUND", "KEEP_ITEM_PARTIAL_REFUND"],
    evidenceRequired: false,
    shippingRefundPolicy: "SHIPPING_RETAINED",
    requiresPhysicalReturn: true
  },
  extra_item: {
    label: "Received an extra item I didn't order",
    allowedResolutions: ["RETURN_FOR_REFUND"],
    evidenceRequired: false,
    shippingRefundPolicy: "MANUAL_REVIEW",
    requiresPhysicalReturn: true
  },
  arrived_late: {
    label: "Arrived too late",
    allowedResolutions: ["RETURN_FOR_REFUND", "PARTIAL_REFUND", "KEEP_ITEM_PARTIAL_REFUND"],
    evidenceRequired: false,
    shippingRefundPolicy: "SHIPPING_RETAINED",
    requiresPhysicalReturn: true
  },
  changed_mind: {
    label: "Changed my mind / no longer needed",
    allowedResolutions: ["RETURN_FOR_REFUND"],
    evidenceRequired: false,
    shippingRefundPolicy: "SHIPPING_RETAINED",
    requiresPhysicalReturn: true
  },
  other: {
    label: "Other",
    allowedResolutions: ["RETURN_FOR_REFUND", "REPLACEMENT", "PARTIAL_REFUND"],
    evidenceRequired: false,
    shippingRefundPolicy: "MANUAL_REVIEW",
    requiresPhysicalReturn: true
  }
};

export function isReturnReasonCode(code: string): code is ReturnReasonCode {
  return code in RETURN_REASON_SPEC;
}

export function allowedResolutionsForReason(
  reasonCode: string
): ReturnReplacementResolution[] {
  if (!isReturnReasonCode(reasonCode)) return [];
  return RETURN_REASON_SPEC[reasonCode].allowedResolutions;
}

export function shippingPolicyForReason(reasonCode: string): ReturnShippingRefundPolicy {
  if (!isReturnReasonCode(reasonCode)) return "MANUAL_REVIEW";
  return RETURN_REASON_SPEC[reasonCode].shippingRefundPolicy;
}

export function evidenceRequiredForReason(reasonCode: string): boolean {
  if (!isReturnReasonCode(reasonCode)) return false;
  return RETURN_REASON_SPEC[reasonCode].evidenceRequired;
}

export function physicalReturnRequiredForReason(reasonCode: string): boolean {
  if (!isReturnReasonCode(reasonCode)) return true;
  return RETURN_REASON_SPEC[reasonCode].requiresPhysicalReturn;
}
