import type { InventoryClassification } from "./inventory-classification";
import type { COGS_REVERSAL_POLICY } from "./inventory-cogs-reversal.constants";

export type InventoryCogsReversalEligibilityCode =
  | "OK"
  | "ALREADY_POSTED"
  | "NO_ACCOUNTING_RESTOCK_REQUIRED"
  | "PRE_CUTOVER"
  | "PRE_CUTOVER_ACCOUNTING_HISTORY_REQUIRED"
  | "MANUAL_ACCOUNTING_REVIEW_REQUIRED"
  | "ORDER_ITEM_MISSING"
  | "NON_INVENTORY"
  | "NO_NATIVE_COGS"
  | "NO_CONSUMPTIONS"
  | "RETURN_QTY_EXCEEDS_REVERSIBLE_COGS"
  | "INVALID_RESTOCK_QTY"
  | "COST_LAYER_DATA_GAP"
  | "SOURCE_CHANGED_AFTER_POST"
  | "REVERSAL_REQUIRED"
  | "CLOSED_PERIOD"
  | "ERROR";

export type InventoryCogsReversalEligibility = {
  eligible: boolean;
  code: InventoryCogsReversalEligibilityCode;
  reason: string;
};

export type ConsumptionReversalSegment = {
  consumptionId: string;
  costLayerId: string;
  quantityReversed: number;
  unitCostInPaise: number;
  totalCostInPaise: number;
  originalConsumedAt: Date;
  originalQuantityConsumed: number;
  remainingOnConsumptionAfter: number;
};

export type InventoryCogsReversalSnapshot = {
  restockEventId: string;
  orderId: string;
  orderNumber: string;
  orderItemId: string;
  variantId: string;
  skuSnapshot: string;
  disposition: "SELLABLE" | "DAMAGED" | "NON_RESTOCKABLE";
  restockQuantity: number;
  inventoryIncremented: boolean;
  restockCreatedAt: Date;
  classification: InventoryClassification;
  currency: string;
  /** Cutover class of the restock event date (forward posting boundary). */
  cutoverClassification: "PRE_CUTOVER" | "POST_CUTOVER" | "NO_CUTOVER_CONFIGURED";
  /** Cutover class of the original order placement (history availability). */
  orderCutoverClassification: "PRE_CUTOVER" | "POST_CUTOVER" | "NO_CUTOVER_CONFIGURED";
  nativeCogsPosted: boolean;
  originalCogsEventId: string | null;
  originalCogsJournalEntryId: string | null;
  originalConsumedQty: number;
  alreadyReversedQty: number;
  remainingReversibleQty: number;
  consumptions: Array<{
    id: string;
    costLayerId: string;
    quantityConsumed: number;
    unitCostInPaise: number;
    totalCostInPaise: number;
    consumedAt: Date;
    alreadyReversedQty: number;
    remainingReversibleQty: number;
  }>;
  restockSourceFingerprint: string;
};

export type InventoryCogsReversalProposal = {
  restockEventId: string;
  orderId: string;
  orderItemId: string;
  variantId: string;
  accountingDate: Date;
  currency: string;
  quantityReversed: number;
  totalCostInPaise: number;
  policy: typeof COGS_REVERSAL_POLICY;
  segments: ConsumptionReversalSegment[];
  warnings: string[];
};

export type InventoryCogsReversalJournalProposal = {
  calcVersion: string;
  eventType: string;
  uniqueKey: string;
  accountingDate: Date;
  currency: string;
  memo: string;
  balanced: boolean;
  imbalancePaise: number;
  totalDebitPaise: number;
  totalCreditPaise: number;
  totalRestoredInPaise: number;
  lines: Array<{
    accountCode: string;
    debitInPaise: number;
    creditInPaise: number;
    lineMemo: string;
  }>;
  segments: ConsumptionReversalSegment[];
  diagnostics: {
    segmentCount: number;
    warnings: string[];
  };
  reconciliationMetadata: Record<string, unknown>;
};
