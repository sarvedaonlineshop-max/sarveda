import { prisma } from "../../config/db";

import { getPostingEvent } from "./posting-event.service";
import {
  INVENTORY_PURCHASE_CAPITALIZED_EVENT_TYPE,
  inventoryPurchaseCapitalizedUniqueKey
} from "./purchase-capitalization.constants";
import type {
  PurchaseCapitalizationEligibility,
  ReceiptLineCapitalizationSnapshot
} from "./purchase-capitalization.types";
import {
  isVendorBillPostedForCapitalization,
  loadReceiptLineCapitalizationSnapshot,
  loadReceiptLineContext,
  resolveBillMatchForReceiptLine
} from "./purchase-capitalization-snapshot.service";

export async function assessPurchaseCapitalizationEligibility(
  snapshot: ReceiptLineCapitalizationSnapshot
): Promise<PurchaseCapitalizationEligibility> {
  const uniqueKey = inventoryPurchaseCapitalizedUniqueKey(snapshot.receiptId, snapshot.receiptLineId);
  const existing = await getPostingEvent(INVENTORY_PURCHASE_CAPITALIZED_EVENT_TYPE, uniqueKey);

  if (existing?.status === "POSTED") {
    const storedFp = (existing.payloadJson as Record<string, unknown> | null)?.billSourceFingerprint;
    if (storedFp && storedFp !== snapshot.billSourceFingerprint) {
      return {
        eligible: false,
        code: "SOURCE_CHANGED_AFTER_POST",
        reason: "Vendor bill financials changed after capitalization was posted — reversal required"
      };
    }
    return {
      eligible: false,
      code: "ALREADY_POSTED",
      reason: "Receipt line already capitalized"
    };
  }

  const billPosted = await isVendorBillPostedForCapitalization(snapshot.vendorBillId);
  if (!billPosted) {
    return {
      eligible: false,
      code: "RECEIPT_WAITING_FOR_BILL",
      reason: "Receipt exists but matching vendor bill is not posted to AP/1210 yet"
    };
  }

  if (snapshot.classification !== "PHYSICAL_INVENTORY") {
    return {
      eligible: false,
      code: "NON_INVENTORY_VARIANT",
      reason: `Variant classified as ${snapshot.classification} — cannot capitalize to 1200`
    };
  }

  if (snapshot.poLineRateInPaise !== snapshot.billLineRateInPaise) {
    return {
      eligible: false,
      code: "COST_MISMATCH",
      reason: `PO rate ${snapshot.poLineRateInPaise} paise differs from bill rate ${snapshot.billLineRateInPaise} paise`
    };
  }

  if (snapshot.billLineQuantity > snapshot.poLineQuantity) {
    return {
      eligible: false,
      code: "QUANTITY_MISMATCH",
      reason: "Bill line quantity exceeds PO line quantity"
    };
  }

  const cumulativeAfter =
    snapshot.previouslyCapitalizedQty + snapshot.quantityReceived;
  if (cumulativeAfter > snapshot.billLineQuantity) {
    return {
      eligible: false,
      code: "OVER_RECEIPT_REVIEW_REQUIRED",
      reason: `Capitalizing ${snapshot.quantityReceived} would exceed billed qty ${snapshot.billLineQuantity} (already capitalized ${snapshot.previouslyCapitalizedQty})`
    };
  }

  if (snapshot.capitalizationValueInPaise <= 0) {
    return {
      eligible: false,
      code: "CAPITALIZATION_DATA_GAP",
      reason: "Computed capitalization value is zero or negative"
    };
  }

  return { eligible: true, code: "OK", reason: "Eligible for INVENTORY_PURCHASE_CAPITALIZED_V1" };
}

export async function previewReceiptLineCapitalization(receiptLineId: string) {
  const ctx = await loadReceiptLineContext(receiptLineId);
  if (!ctx?.poLine?.variantId) {
    return {
      snapshot: null,
      eligibility: {
        eligible: false,
        code: "CAPITALIZATION_DATA_GAP" as const,
        reason: "Receipt line not found or not a stock variant line"
      }
    };
  }

  const billResolved = await resolveBillMatchForReceiptLine({
    purchaseOrderId: ctx.receipt.purchaseOrderId,
    variantId: ctx.poLine.variantId,
    quantityReceived: ctx.quantityReceived
  });

  if (!billResolved.match) {
    const code =
      billResolved.code === "AMBIGUOUS_BILL_MATCH"
        ? ("CAPITALIZATION_DATA_GAP" as const)
        : ("RECEIPT_WAITING_FOR_BILL" as const);
    return {
      snapshot: null,
      eligibility: {
        eligible: false,
        code,
        reason:
          billResolved.code === "AMBIGUOUS_BILL_MATCH"
            ? "Multiple vendor bills match this receipt variant"
            : "Receipt exists but no matching vendor bill is available yet"
      }
    };
  }

  const snapshot = await loadReceiptLineCapitalizationSnapshot({ receiptLineId });
  if (!snapshot) {
    return {
      snapshot: null,
      eligibility: {
        eligible: false,
        code: "CAPITALIZATION_DATA_GAP" as const,
        reason: "Could not build capitalization snapshot"
      }
    };
  }

  const eligibility = await assessPurchaseCapitalizationEligibility(snapshot);
  return { snapshot, eligibility };
}

export async function loadReceiptLineCapitalizationOrThrow(receiptLineId: string) {
  try {
    const snapshot = await loadReceiptLineCapitalizationSnapshot({ receiptLineId });
    if (!snapshot) {
      throw Object.assign(new Error("Receipt line not capitalizable"), {
        code: "CAPITALIZATION_DATA_GAP",
        statusCode: 409
      });
    }
    return snapshot;
  } catch (err) {
    if (err instanceof Error && "code" in err) throw err;
    throw err;
  }
}

/** Check if receipt line already has a cost layer (idempotency helper). */
export async function receiptLineAlreadyCapitalized(receiptId: string, receiptLineId: string): Promise<boolean> {
  const layer = await prisma.accountingInventoryCostLayer.findFirst({
    where: {
      sourceType: "PURCHASE_RECEIPT",
      sourceId: receiptId,
      sourceLineId: receiptLineId
    }
  });
  return Boolean(layer);
}
