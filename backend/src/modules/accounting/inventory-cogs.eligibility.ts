import { assertEntryDateInOpenPeriod } from "./accounting-period.service";
import { inventoryCogsRecognizedUniqueKey } from "./inventory-cogs.constants";
import { getPostingEvent } from "./posting-event.service";
import type {
  InventoryCogsEligibility,
  InventoryCogsOrderSnapshot,
  InventoryCogsProposal
} from "./inventory-cogs.types";

export async function assessInventoryCogsEligibility(
  snapshot: InventoryCogsOrderSnapshot,
  proposal?: InventoryCogsProposal | null
): Promise<InventoryCogsEligibility> {
  const existing = await getPostingEvent(
    "INVENTORY_COGS_RECOGNIZED",
    inventoryCogsRecognizedUniqueKey(snapshot.orderId)
  );

  if (existing?.status === "POSTED") {
    const payload = (existing.payloadJson ?? {}) as Record<string, unknown>;
    const prior =
      typeof payload.orderSourceFingerprint === "string"
        ? payload.orderSourceFingerprint
        : typeof payload.sourceFingerprint === "string"
          ? payload.sourceFingerprint
          : null;
    if (prior && prior !== snapshot.sourceFingerprint) {
      return {
        eligible: false,
        code: "SOURCE_CHANGED_AFTER_POST",
        reason: "Order items or quantities changed after COGS was posted"
      };
    }
    return { eligible: false, code: "ALREADY_POSTED", reason: "COGS already posted for order" };
  }

  if (snapshot.cutoverClassification === "PRE_CUTOVER") {
    return {
      eligible: false,
      code: "PRE_CUTOVER",
      reason: "Order is pre-cutover; historical COGS backfill is not supported"
    };
  }

  if (snapshot.lines.length === 0) {
    return {
      eligible: false,
      code: "ORDER_ITEMS_MISSING",
      reason: "Order has no OrderItem rows"
    };
  }

  if (!snapshot.nativeOrderPaidPosted) {
    return {
      eligible: false,
      code: "NO_NATIVE_ORDER_PAID",
      reason: "ORDER_PAID event has not been posted for this order"
    };
  }

  const physical = snapshot.lines.filter((l) => l.classification === "PHYSICAL_INVENTORY");
  if (physical.length === 0) {
    return {
      eligible: false,
      code: "NON_INVENTORY_ONLY",
      reason: "Order contains no physical inventory items"
    };
  }

  if (!proposal) {
    return { eligible: true, code: "OK", reason: "Eligible for FIFO COGS recognition" };
  }

  try {
    await assertEntryDateInOpenPeriod(snapshot.placedAt);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { eligible: false, code: "CLOSED_PERIOD", reason: message };
  }

  if (proposal.totalCostInPaise <= 0) {
    return {
      eligible: false,
      code: "COST_LAYER_DATA_GAP",
      reason: "COGS proposal has zero or invalid total cost"
    };
  }

  return { eligible: true, code: "OK", reason: "Eligible for FIFO COGS recognition" };
}
