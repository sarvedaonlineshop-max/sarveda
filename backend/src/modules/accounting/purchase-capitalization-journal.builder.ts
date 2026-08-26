import { INVENTORY_ACCOUNT_CODE } from "./inventory.constants";
import {
  INVENTORY_PURCHASE_CAPITALIZED_CALC_VERSION,
  INVENTORY_PURCHASE_CAPITALIZED_EVENT_TYPE,
  INVENTORY_PURCHASE_CAPITALIZED_MAX_IMBALANCE_PAISE,
  inventoryPurchaseCapitalizedUniqueKey,
  purchaseReceiptLayerFingerprint
} from "./purchase-capitalization.constants";
import type {
  PurchaseCapitalizationJournalProposal,
  ReceiptLineCapitalizationSnapshot
} from "./purchase-capitalization.types";

/**
 * Pure INVENTORY_PURCHASE_CAPITALIZED_V1 journal builder.
 * Dr 1200 Inventory Asset / Cr 1210 Inventory Purchases Clearing — stock cost only, no GST/AP.
 */
export function buildInventoryPurchaseCapitalizationJournal(
  snapshot: ReceiptLineCapitalizationSnapshot
): PurchaseCapitalizationJournalProposal {
  const value = snapshot.capitalizationValueInPaise;
  const unitCost = snapshot.netUnitCostInPaise;
  const uniqueKey = inventoryPurchaseCapitalizedUniqueKey(snapshot.receiptId, snapshot.receiptLineId);
  const sourceFingerprint = purchaseReceiptLayerFingerprint(
    snapshot.receiptLineId,
    snapshot.vendorBillLineId,
    snapshot.billSourceFingerprint
  );

  const lines = [
    {
      accountCode: INVENTORY_ACCOUNT_CODE.INVENTORY_ASSET,
      debitInPaise: value,
      creditInPaise: 0,
      lineMemo: `Capitalize receipt ${snapshot.sku} qty ${snapshot.quantityReceived}`
    },
    {
      accountCode: INVENTORY_ACCOUNT_CODE.INVENTORY_PURCHASES_CLEARING,
      debitInPaise: 0,
      creditInPaise: value,
      lineMemo: `Clear 1210 for ${snapshot.billNumber} receipt`
    }
  ];

  const totalDebitPaise = value;
  const totalCreditPaise = value;
  const imbalancePaise = totalDebitPaise - totalCreditPaise;
  const balanced = Math.abs(imbalancePaise) <= INVENTORY_PURCHASE_CAPITALIZED_MAX_IMBALANCE_PAISE;

  return {
    calcVersion: INVENTORY_PURCHASE_CAPITALIZED_CALC_VERSION,
    eventType: INVENTORY_PURCHASE_CAPITALIZED_EVENT_TYPE,
    uniqueKey,
    accountingDate: snapshot.receiptDate,
    currency: "INR",
    memo: `${INVENTORY_PURCHASE_CAPITALIZED_CALC_VERSION} ${snapshot.sku} receipt ${snapshot.receiptId.slice(0, 8)}`,
    balanced,
    imbalancePaise,
    totalDebitPaise,
    totalCreditPaise,
    capitalizationValueInPaise: value,
    unitCostInPaise: unitCost,
    quantityReceived: snapshot.quantityReceived,
    lines,
    layerProposal: {
      variantId: snapshot.variantId,
      sourceFingerprint,
      quantityOriginal: snapshot.quantityReceived,
      quantityRemaining: snapshot.quantityReceived,
      unitCostInPaise: unitCost,
      totalCostInPaise: value,
      effectiveAt: snapshot.receiptDate
    },
    reconciliationMetadata: {
      receiptId: snapshot.receiptId,
      receiptLineId: snapshot.receiptLineId,
      purchaseOrderId: snapshot.purchaseOrderId,
      vendorBillId: snapshot.vendorBillId,
      vendorBillLineId: snapshot.vendorBillLineId,
      billSourceFingerprint: snapshot.billSourceFingerprint,
      sku: snapshot.sku
    }
  };
}
