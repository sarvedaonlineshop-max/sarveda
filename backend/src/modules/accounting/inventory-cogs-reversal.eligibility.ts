import { assertEntryDateInOpenPeriod } from "./accounting-period.service";
import { inventoryCogsReversedUniqueKey } from "./inventory-cogs-reversal.constants";
import { getPostingEvent } from "./posting-event.service";
import type {
  InventoryCogsReversalEligibility,
  InventoryCogsReversalProposal,
  InventoryCogsReversalSnapshot
} from "./inventory-cogs-reversal.types";

export async function assessInventoryCogsReversalEligibility(
  snapshot: InventoryCogsReversalSnapshot,
  proposal?: InventoryCogsReversalProposal | null
): Promise<InventoryCogsReversalEligibility> {
  const existing = await getPostingEvent(
    "INVENTORY_COGS_REVERSED",
    inventoryCogsReversedUniqueKey(snapshot.restockEventId)
  );

  if (existing?.status === "POSTED") {
    const payload = (existing.payloadJson ?? {}) as Record<string, unknown>;
    const prior =
      typeof payload.restockSourceFingerprint === "string"
        ? payload.restockSourceFingerprint
        : typeof payload.sourceFingerprint === "string"
          ? payload.sourceFingerprint
          : null;
    if (prior && prior !== snapshot.restockSourceFingerprint) {
      return {
        eligible: false,
        code: "SOURCE_CHANGED_AFTER_POST",
        reason: "Restock/COGS source changed after reversal was posted — reversal required"
      };
    }
    return {
      eligible: false,
      code: "ALREADY_POSTED",
      reason: "COGS reversal already posted for this restock event"
    };
  }

  if (snapshot.disposition === "DAMAGED" || snapshot.disposition === "NON_RESTOCKABLE") {
    return {
      eligible: false,
      code: "NO_ACCOUNTING_RESTOCK_REQUIRED",
      reason: `${snapshot.disposition} restock does not restore inventory asset / reverse COGS in Phase 3D4`
    };
  }

  if (snapshot.disposition !== "SELLABLE") {
    return {
      eligible: false,
      code: "NO_ACCOUNTING_RESTOCK_REQUIRED",
      reason: "Only SELLABLE restock events reverse COGS"
    };
  }

  if (snapshot.restockQuantity <= 0) {
    return {
      eligible: false,
      code: "INVALID_RESTOCK_QTY",
      reason: "Restock quantity must be positive"
    };
  }

  if (!snapshot.orderItemId) {
    return {
      eligible: false,
      code: "ORDER_ITEM_MISSING",
      reason: "Restock event has no OrderItem"
    };
  }

  if (snapshot.classification !== "PHYSICAL_INVENTORY") {
    return {
      eligible: false,
      code: "NON_INVENTORY",
      reason: "Variant is not physical inventory for COGS reversal"
    };
  }

  if (snapshot.cutoverClassification === "PRE_CUTOVER") {
    return {
      eligible: false,
      code: "PRE_CUTOVER",
      reason: "Pre-cutover restock COGS reversal is not supported"
    };
  }

  if (!snapshot.nativeCogsPosted) {
    if (snapshot.orderCutoverClassification === "PRE_CUTOVER") {
      return {
        eligible: false,
        code: "PRE_CUTOVER_ACCOUNTING_HISTORY_REQUIRED",
        reason:
          "Return/restock ops may continue, but original sale is pre-cutover with no native COGS — " +
          "do not invent FIFO/COGS reversal; manual accounting review required"
      };
    }
    return {
      eligible: false,
      code: "MANUAL_ACCOUNTING_REVIEW_REQUIRED",
      reason:
        "Original order has no posted native INVENTORY_COGS_RECOGNIZED — do not invent reversal"
    };
  }

  if (snapshot.consumptions.length === 0 || snapshot.originalConsumedQty <= 0) {
    return {
      eligible: false,
      code: "NO_CONSUMPTIONS",
      reason: "No AccountingInventoryCostConsumption rows for this OrderItem"
    };
  }

  if (snapshot.restockQuantity > snapshot.remainingReversibleQty) {
    return {
      eligible: false,
      code: "RETURN_QTY_EXCEEDS_REVERSIBLE_COGS",
      reason: `Restock qty ${snapshot.restockQuantity} exceeds remaining reversible COGS qty ${snapshot.remainingReversibleQty}`
    };
  }

  if (!proposal) {
    return { eligible: true, code: "OK", reason: "Eligible for COGS reversal" };
  }

  try {
    await assertEntryDateInOpenPeriod(snapshot.restockCreatedAt);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { eligible: false, code: "CLOSED_PERIOD", reason: message };
  }

  if (proposal.totalCostInPaise <= 0 || proposal.quantityReversed <= 0) {
    return {
      eligible: false,
      code: "COST_LAYER_DATA_GAP",
      reason: "Reversal proposal has zero or invalid restored cost"
    };
  }

  if (proposal.quantityReversed !== snapshot.restockQuantity) {
    return {
      eligible: false,
      code: "RETURN_QTY_EXCEEDS_REVERSIBLE_COGS",
      reason: "Could not allocate full restock quantity against historical consumptions"
    };
  }

  return { eligible: true, code: "OK", reason: "Eligible for COGS reversal" };
}
