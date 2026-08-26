import { INVENTORY_ACCOUNT_CODE } from "./inventory.constants";
import {
  COGS_REVERSAL_POLICY,
  INVENTORY_COGS_REVERSED_CALC_VERSION,
  INVENTORY_COGS_REVERSED_EVENT_TYPE,
  inventoryCogsReversedUniqueKey,
  inventoryCogsReversalSourceFingerprint
} from "./inventory-cogs-reversal.constants";
import type {
  ConsumptionReversalSegment,
  InventoryCogsReversalJournalProposal,
  InventoryCogsReversalProposal,
  InventoryCogsReversalSnapshot
} from "./inventory-cogs-reversal.types";

/**
 * Allocate restock qty against consumptions LIFO (most recently consumed first).
 * Fail-closed if insufficient remaining reversible qty (caller must check eligibility).
 */
export function buildCogsReversalProposalFromSnapshot(
  snapshot: InventoryCogsReversalSnapshot
): InventoryCogsReversalProposal {
  let needed = snapshot.restockQuantity;
  const segments: ConsumptionReversalSegment[] = [];

  for (const c of snapshot.consumptions) {
    if (needed <= 0) break;
    const available = c.remainingReversibleQty;
    if (available <= 0) continue;
    if (c.unitCostInPaise <= 0) {
      throw Object.assign(new Error(`Consumption ${c.id} has non-positive unit cost`), {
        statusCode: 409,
        code: "COST_LAYER_DATA_GAP"
      });
    }
    const qty = Math.min(needed, available);
    segments.push({
      consumptionId: c.id,
      costLayerId: c.costLayerId,
      quantityReversed: qty,
      unitCostInPaise: c.unitCostInPaise,
      totalCostInPaise: qty * c.unitCostInPaise,
      originalConsumedAt: c.consumedAt,
      originalQuantityConsumed: c.quantityConsumed,
      remainingOnConsumptionAfter: available - qty
    });
    needed -= qty;
  }

  if (needed > 0) {
    throw Object.assign(
      new Error(
        `Restock qty ${snapshot.restockQuantity} exceeds remaining reversible COGS qty ${snapshot.restockQuantity - needed}`
      ),
      { statusCode: 409, code: "RETURN_QTY_EXCEEDS_REVERSIBLE_COGS" }
    );
  }

  return {
    restockEventId: snapshot.restockEventId,
    orderId: snapshot.orderId,
    orderItemId: snapshot.orderItemId,
    variantId: snapshot.variantId,
    accountingDate: snapshot.restockCreatedAt,
    currency: snapshot.currency,
    quantityReversed: snapshot.restockQuantity,
    totalCostInPaise: segments.reduce((s, seg) => s + seg.totalCostInPaise, 0),
    policy: COGS_REVERSAL_POLICY,
    segments,
    warnings: []
  };
}

export function buildInventoryCogsReversalJournal(
  snapshot: InventoryCogsReversalSnapshot,
  proposal: InventoryCogsReversalProposal
): InventoryCogsReversalJournalProposal {
  const total = proposal.totalCostInPaise;
  const lines = [
    {
      accountCode: INVENTORY_ACCOUNT_CODE.INVENTORY_ASSET,
      debitInPaise: total,
      creditInPaise: 0,
      lineMemo: `Return restock inventory ${snapshot.orderNumber}`
    },
    {
      accountCode: INVENTORY_ACCOUNT_CODE.COST_OF_GOODS_SOLD,
      debitInPaise: 0,
      creditInPaise: total,
      lineMemo: `COGS reversal ${snapshot.orderNumber}`
    }
  ];

  const sourceFingerprint = inventoryCogsReversalSourceFingerprint({
    restockEventId: snapshot.restockEventId,
    orderId: snapshot.orderId,
    orderItemId: snapshot.orderItemId,
    quantity: snapshot.restockQuantity,
    disposition: snapshot.disposition,
    originalCogsEventId: snapshot.originalCogsEventId,
    consumptionIds: proposal.segments.map((s) => s.consumptionId),
    unitCosts: proposal.segments.map((s) => s.unitCostInPaise),
    quantities: proposal.segments.map((s) => s.quantityReversed)
  });

  return {
    calcVersion: INVENTORY_COGS_REVERSED_CALC_VERSION,
    eventType: INVENTORY_COGS_REVERSED_EVENT_TYPE,
    uniqueKey: inventoryCogsReversedUniqueKey(snapshot.restockEventId),
    accountingDate: snapshot.restockCreatedAt,
    currency: snapshot.currency,
    memo: `${INVENTORY_COGS_REVERSED_CALC_VERSION} ${snapshot.orderNumber} restock ${snapshot.restockEventId.slice(0, 8)}`,
    balanced: total > 0,
    imbalancePaise: 0,
    totalDebitPaise: total,
    totalCreditPaise: total,
    totalRestoredInPaise: total,
    lines,
    segments: proposal.segments,
    diagnostics: {
      segmentCount: proposal.segments.length,
      warnings: proposal.warnings
    },
    reconciliationMetadata: {
      restockEventId: snapshot.restockEventId,
      orderId: snapshot.orderId,
      orderNumber: snapshot.orderNumber,
      orderItemId: snapshot.orderItemId,
      variantId: snapshot.variantId,
      quantity: snapshot.restockQuantity,
      disposition: snapshot.disposition,
      policy: COGS_REVERSAL_POLICY,
      originalCogsEventId: snapshot.originalCogsEventId,
      originalCogsJournalEntryId: snapshot.originalCogsJournalEntryId,
      restockSourceFingerprint: snapshot.restockSourceFingerprint,
      sourceFingerprint,
      calcVersion: INVENTORY_COGS_REVERSED_CALC_VERSION,
      segments: proposal.segments.map((s) => ({
        consumptionId: s.consumptionId,
        quantityReversed: s.quantityReversed,
        unitCostInPaise: s.unitCostInPaise,
        totalCostInPaise: s.totalCostInPaise
      }))
    }
  };
}
