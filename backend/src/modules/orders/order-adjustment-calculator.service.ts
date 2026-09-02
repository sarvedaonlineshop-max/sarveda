import type { OrderServiceRequestIntent } from "@prisma/client";

import type {
  AdjustmentPayload,
  CommercialClassification,
  CommercialDeltaBreakdown
} from "./order-adjustment.types";

export function reasonCodeToIntent(reasonCode: string): OrderServiceRequestIntent | null {
  switch (reasonCode) {
    case "change_address":
      return "CHANGE_ADDRESS";
    case "wrong_item":
      return "CHANGE_ITEM_VARIANT";
    case "change_quantity":
      return "CHANGE_QUANTITY";
    default:
      return null;
  }
}

/**
 * Pure commercial delta — no DB, no side effects.
 */
export function calculateAdjustmentCommercialDelta(input: {
  order: {
    subtotalInPaise: number;
    discountInPaise: number;
    shippingInPaise: number;
    taxInPaise: number;
    grandTotalInPaise: number;
    zohoInvoiceId?: string | null;
  };
  items: Array<{ id: string; lineTotalInPaise: number; unitPriceInPaise: number; qtyOrdered: number }>;
  payload: AdjustmentPayload;
  requestedVariant?: {
    id: string;
    saleInPaise: number;
    status: string;
  } | null;
}): CommercialDeltaBreakdown {
  const warnings: string[] = [];
  const oldMerchandisePaise = input.order.subtotalInPaise - input.order.discountInPaise;
  let newMerchandisePaise = oldMerchandisePaise;
  const oldShippingPaise = input.order.shippingInPaise;
  let newShippingPaise = oldShippingPaise;

  const line = input.items.find((i) => i.id === input.payload.before.line?.orderItemId);

  if (input.payload.intent === "CHANGE_ADDRESS") {
    const before = input.payload.before.shippingAddress;
    const after = input.payload.requested.shippingAddress;
    if (before && after) {
      const postalChanged =
        before.postalCode.trim() !== after.postalCode.trim() ||
        before.country.trim().toUpperCase() !== after.country.trim().toUpperCase();
      if (postalChanged) {
        warnings.push("Postal code or country changed — shipping charge may differ");
        return buildResult({
          oldMerchandisePaise,
          newMerchandisePaise,
          oldShippingPaise,
          newShippingPaise: oldShippingPaise,
          oldGrandTotalPaise: input.order.grandTotalInPaise,
          newGrandTotalPaise: input.order.grandTotalInPaise,
          classification: "COMMERCIAL_REVIEW_REQUIRED",
          warnings,
          canExecuteAutomatically: false
        });
      }
    }
  }

  if (input.payload.intent === "CHANGE_ITEM_VARIANT" && line && input.requestedVariant) {
    const qty = input.payload.before.line?.qtyOrdered ?? line.qtyOrdered;
    newMerchandisePaise =
      oldMerchandisePaise - line.lineTotalInPaise + input.requestedVariant.saleInPaise * qty;
  }

  if (input.payload.intent === "CHANGE_QUANTITY" && line) {
    const newQty = input.payload.requested.qtyOrdered ?? line.qtyOrdered;
    newMerchandisePaise =
      oldMerchandisePaise - line.lineTotalInPaise + line.unitPriceInPaise * newQty;
  }

  const oldGrandTotalPaise = input.order.grandTotalInPaise;
  const newGrandTotalPaise =
    newMerchandisePaise + newShippingPaise + input.order.taxInPaise;
  const deltaPaise = newGrandTotalPaise - oldGrandTotalPaise;

  let classification: CommercialClassification = "NO_PAYMENT_CHANGE";
  if (deltaPaise > 0) classification = "ADDITIONAL_PAYMENT_REQUIRED";
  else if (deltaPaise < 0) classification = "REFUND_REQUIRED";

  let canExecuteAutomatically = classification === "NO_PAYMENT_CHANGE";

  if (input.order.zohoInvoiceId && input.payload.intent !== "CHANGE_ADDRESS") {
    warnings.push("Zoho invoice exists — item/quantity changes require accounting review");
    classification = "ACCOUNTING_REVIEW_REQUIRED";
    canExecuteAutomatically = false;
  }

  if (classification === "REFUND_REQUIRED") {
    warnings.push("Partial refund requires Phase 1E accounting — no automatic gateway refund");
    canExecuteAutomatically = false;
  }

  if (classification === "ADDITIONAL_PAYMENT_REQUIRED") {
    warnings.push("Additional payment collection not automated in Phase 1D");
    canExecuteAutomatically = false;
  }

  return buildResult({
    oldMerchandisePaise,
    newMerchandisePaise,
    oldShippingPaise,
    newShippingPaise,
    oldGrandTotalPaise,
    newGrandTotalPaise,
    deltaPaise,
    classification,
    warnings,
    canExecuteAutomatically
  });
}

function buildResult(opts: {
  oldMerchandisePaise: number;
  newMerchandisePaise: number;
  oldShippingPaise: number;
  newShippingPaise: number;
  oldGrandTotalPaise: number;
  newGrandTotalPaise: number;
  deltaPaise?: number;
  classification: CommercialClassification;
  warnings: string[];
  canExecuteAutomatically: boolean;
}): CommercialDeltaBreakdown {
  const deltaPaise = opts.deltaPaise ?? opts.newGrandTotalPaise - opts.oldGrandTotalPaise;
  return {
    oldMerchandisePaise: opts.oldMerchandisePaise,
    newMerchandisePaise: opts.newMerchandisePaise,
    oldShippingPaise: opts.oldShippingPaise,
    newShippingPaise: opts.newShippingPaise,
    oldGrandTotalPaise: opts.oldGrandTotalPaise,
    newGrandTotalPaise: opts.newGrandTotalPaise,
    deltaPaise,
    classification: opts.classification,
    warnings: opts.warnings,
    canExecuteAutomatically: opts.canExecuteAutomatically
  };
}
