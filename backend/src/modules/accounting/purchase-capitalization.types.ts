import type { InventoryClassification } from "./inventory-classification";

export type PurchaseCapitalizationEligibilityCode =
  | "OK"
  | "ALREADY_POSTED"
  | "RECEIPT_WAITING_FOR_BILL"
  | "MISSING_VENDOR_BILL"
  | "MISSING_AP_JOURNAL"
  | "CAPITALIZATION_DATA_GAP"
  | "COST_MISMATCH"
  | "QUANTITY_MISMATCH"
  | "OVER_RECEIPT_REVIEW_REQUIRED"
  | "NON_STOCK_LINE"
  | "NON_INVENTORY_VARIANT"
  | "GST_COST_BASIS_DATA_GAP"
  | "SOURCE_CHANGED_AFTER_POST"
  | "REVERSAL_REQUIRED"
  | "BILL_NOT_LINKED_TO_PO"
  | "AMBIGUOUS_BILL_MATCH"
  | "ERROR";

export type PurchaseCapitalizationClearingStatus =
  | "CLEARED"
  | "PARTIALLY_CAPITALIZED"
  | "WAITING_FOR_RECEIPT"
  | "WAITING_FOR_BILL"
  | "COST_MISMATCH"
  | "QUANTITY_MISMATCH"
  | "DATA_GAP"
  | "ERROR";

export type ReceiptLineCapitalizationSnapshot = {
  receiptId: string;
  receiptLineId: string;
  receiptDate: Date;
  purchaseOrderId: string;
  poNumber: string;
  poLineId: string;
  variantId: string;
  sku: string;
  productName: string;
  quantityReceived: number;
  poLineRateInPaise: number;
  poLineQuantity: number;
  poLineReceivedQty: number;
  vendorBillId: string;
  vendorBillLineId: string;
  billNumber: string;
  billDate: Date;
  billLineQuantity: number;
  billLineRateInPaise: number;
  billSourceFingerprint: string;
  netUnitCostInPaise: number;
  allocatedBaseInPaise: number;
  capitalizationValueInPaise: number;
  previouslyCapitalizedQty: number;
  classification: InventoryClassification;
};

export type PurchaseCapitalizationJournalProposal = {
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
  capitalizationValueInPaise: number;
  unitCostInPaise: number;
  quantityReceived: number;
  lines: Array<{
    accountCode: string;
    debitInPaise: number;
    creditInPaise: number;
    lineMemo: string;
  }>;
  layerProposal: {
    variantId: string;
    sourceFingerprint: string;
    quantityOriginal: number;
    quantityRemaining: number;
    unitCostInPaise: number;
    totalCostInPaise: number;
    effectiveAt: Date;
  };
  reconciliationMetadata: {
    receiptId: string;
    receiptLineId: string;
    purchaseOrderId: string;
    vendorBillId: string;
    vendorBillLineId: string;
    billSourceFingerprint: string;
    sku: string;
  };
};

export type PurchaseCapitalizationEligibility = {
  eligible: boolean;
  code: PurchaseCapitalizationEligibilityCode;
  reason: string;
};

export type PurchaseCapitalizationClearingRow = {
  vendorBillId: string;
  billNumber: string;
  purchaseOrderId: string | null;
  poNumber: string | null;
  variantId: string | null;
  sku: string | null;
  billedQuantity: number;
  billedValueInPaise: number;
  receivedQuantity: number;
  capitalizedQuantity: number;
  capitalizedValueInPaise: number;
  clearing1210BilledInPaise: number;
  clearing1210CapitalizedInPaise: number;
  clearing1210OutstandingInPaise: number;
  status: PurchaseCapitalizationClearingStatus;
  warnings: string[];
};
