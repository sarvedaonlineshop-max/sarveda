import type { InventoryClassification } from "./inventory-classification";

export type InventoryCogsEligibilityCode =
  | "OK"
  | "ALREADY_POSTED"
  | "PRE_CUTOVER"
  | "ORDER_ITEMS_MISSING"
  | "NO_NATIVE_ORDER_PAID"
  | "NON_INVENTORY_ONLY"
  | "INSUFFICIENT_COST_LAYERS"
  | "COST_LAYER_DATA_GAP"
  | "LAYER_INVARIANT_VIOLATION"
  | "SOURCE_CHANGED_AFTER_POST"
  | "REVERSAL_REQUIRED"
  | "CLOSED_PERIOD"
  | "ERROR";

export type InventoryCogsEligibility = {
  eligible: boolean;
  code: InventoryCogsEligibilityCode;
  reason: string;
};

export type InventoryCogsOrderItemSnapshot = {
  orderItemId: string;
  variantId: string | null;
  skuSnapshot: string;
  nameSnapshot: string;
  qtyOrdered: number;
  unitPriceInPaise: number;
  lineTotalInPaise: number;
  classification: InventoryClassification;
  productType: string | null;
};

export type InventoryCogsOrderSnapshot = {
  orderId: string;
  orderNumber: string;
  placedAt: Date;
  currency: string;
  lines: InventoryCogsOrderItemSnapshot[];
  sourceFingerprint: string;
  nativeOrderPaidPosted: boolean;
  paidJournalEntryId: string | null;
  cutoverClassification: "PRE_CUTOVER" | "POST_CUTOVER" | "NO_CUTOVER_CONFIGURED";
};

export type InventoryCogsLayerConsumptionProposal = {
  costLayerId: string;
  variantId: string;
  orderItemId: string;
  quantityConsumed: number;
  unitCostInPaise: number;
  totalCostInPaise: number;
  layerSourceType: string;
  layerEffectiveAt: Date;
};

export type InventoryCogsItemProposal = {
  orderItemId: string;
  variantId: string;
  skuSnapshot: string;
  qtyOrdered: number;
  totalCostInPaise: number;
  consumptions: InventoryCogsLayerConsumptionProposal[];
};

export type InventoryCogsProposal = {
  orderId: string;
  orderNumber: string;
  accountingDate: Date;
  currency: string;
  items: InventoryCogsItemProposal[];
  totalCostInPaise: number;
  warnings: string[];
};

export type InventoryCogsJournalProposal = {
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
  totalCogsInPaise: number;
  lines: Array<{
    accountCode: string;
    debitInPaise: number;
    creditInPaise: number;
    lineMemo: string;
  }>;
  perItemCost: Array<{
    orderItemId: string;
    variantId: string;
    qtyOrdered: number;
    totalCostInPaise: number;
  }>;
  perLayerConsumption: InventoryCogsLayerConsumptionProposal[];
  diagnostics: {
    itemCount: number;
    layerCount: number;
    warnings: string[];
  };
  reconciliationMetadata: Record<string, unknown>;
};
