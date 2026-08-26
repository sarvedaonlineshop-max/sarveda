import { INVENTORY_ACCOUNT_CODE } from "./inventory.constants";
import {
  INVENTORY_COGS_RECOGNIZED_CALC_VERSION,
  INVENTORY_COGS_RECOGNIZED_EVENT_TYPE,
  inventoryCogsRecognizedUniqueKey,
  inventoryCogsSourceFingerprint
} from "./inventory-cogs.constants";
import type {
  InventoryCogsJournalProposal,
  InventoryCogsOrderSnapshot,
  InventoryCogsProposal
} from "./inventory-cogs.types";

export function buildInventoryCogsJournal(
  snapshot: InventoryCogsOrderSnapshot,
  proposal: InventoryCogsProposal
): InventoryCogsJournalProposal {
  const total = proposal.totalCostInPaise;
  const lines = [
    {
      accountCode: INVENTORY_ACCOUNT_CODE.COST_OF_GOODS_SOLD,
      debitInPaise: total,
      creditInPaise: 0,
      lineMemo: `COGS ${snapshot.orderNumber}`
    },
    {
      accountCode: INVENTORY_ACCOUNT_CODE.INVENTORY_ASSET,
      debitInPaise: 0,
      creditInPaise: total,
      lineMemo: `Inventory asset relief ${snapshot.orderNumber}`
    }
  ];
  const totalDebitPaise = total;
  const totalCreditPaise = total;
  const imbalancePaise = totalDebitPaise - totalCreditPaise;
  const layerIds = proposal.items.flatMap((i) => i.consumptions.map((c) => c.costLayerId));
  const quantities = proposal.items.flatMap((i) => i.consumptions.map((c) => c.quantityConsumed));
  const unitCosts = proposal.items.flatMap((i) => i.consumptions.map((c) => c.unitCostInPaise));

  return {
    calcVersion: INVENTORY_COGS_RECOGNIZED_CALC_VERSION,
    eventType: INVENTORY_COGS_RECOGNIZED_EVENT_TYPE,
    uniqueKey: inventoryCogsRecognizedUniqueKey(snapshot.orderId),
    accountingDate: snapshot.placedAt,
    currency: snapshot.currency,
    memo: `${INVENTORY_COGS_RECOGNIZED_CALC_VERSION} ${snapshot.orderNumber}`,
    balanced: imbalancePaise === 0 && total > 0,
    imbalancePaise,
    totalDebitPaise,
    totalCreditPaise,
    totalCogsInPaise: total,
    lines,
    perItemCost: proposal.items.map((item) => ({
      orderItemId: item.orderItemId,
      variantId: item.variantId,
      qtyOrdered: item.qtyOrdered,
      totalCostInPaise: item.totalCostInPaise
    })),
    perLayerConsumption: proposal.items.flatMap((i) => i.consumptions),
    diagnostics: {
      itemCount: proposal.items.length,
      layerCount: layerIds.length,
      warnings: proposal.warnings
    },
    reconciliationMetadata: {
      orderId: snapshot.orderId,
      orderNumber: snapshot.orderNumber,
      paidJournalEntryId: snapshot.paidJournalEntryId,
      sourceFingerprint: inventoryCogsSourceFingerprint({
        orderId: snapshot.orderId,
        orderItemIds: proposal.items.map((i) => i.orderItemId),
        variantIds: proposal.items.map((i) => i.variantId),
        layerIds,
        quantities,
        unitCosts
      }),
      orderSourceFingerprint: snapshot.sourceFingerprint,
      calcVersion: INVENTORY_COGS_RECOGNIZED_CALC_VERSION
    }
  };
}
