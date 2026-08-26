import type { InventoryClassification } from "./inventory-classification";

export type OpeningImportRow = {
  sku: string;
  variantId?: string;
  openingQty: number;
  unitCostInPaise: number;
  totalValueInPaise?: number;
  effectiveDate?: string;
  notes?: string;
  rowNumber: number;
};

export type OpeningImportRowError = {
  rowNumber: number;
  sku: string;
  code: string;
  message: string;
};

export type OpeningImportPreview = {
  effectiveDate: string;
  valuationSource: string;
  sourceDocumentRef?: string;
  preparedBy?: string;
  reviewedBy?: string;
  allowQuantityMismatch: boolean;
  sourcePayloadHash: string;
  sourceFileName?: string;
  rows: OpeningImportValidatedRow[];
  errors: OpeningImportRowError[];
  totals: {
    quantity: number;
    valueInPaise: number;
    physicalSkuCount: number;
    excludedSkuCount: number;
  };
  canSaveDraft: boolean;
  canPost: boolean;
};

export type OpeningImportValidatedRow = {
  rowNumber: number;
  sku: string;
  variantId: string;
  productName: string;
  classification: InventoryClassification;
  openingQuantity: number;
  unitCostInPaise: number;
  totalCostInPaise: number;
  operationalOnHand: number;
  quantityMismatch: boolean;
  excluded: boolean;
  notes?: string;
};

export type InventoryReconStatus =
  | "MATCHED"
  | "OPENING_REQUIRED"
  | "OPENING_POSTED"
  | "COGS_UNPOSTED"
  | "INSUFFICIENT_COST_LAYERS"
  | "COST_DATA_GAP"
  | "PRE_CUTOVER"
  | "ORDER_ITEMS_MISSING"
  | "QUANTITY_MISMATCH"
  | "VALUE_DATA_GAP"
  | "CLASSIFICATION_REQUIRED"
  | "NON_INVENTORY_EXCLUDED"
  | "NEGATIVE_STOCK"
  | "SOURCE_CHANGED_AFTER_POST"
  | "RETURN_COGS_UNPOSTED"
  | "RESTOCK_WITHOUT_SOURCE_COGS"
  | "RETURN_QTY_EXCEEDS_REVERSIBLE_COGS"
  | "DAMAGED_NO_RESTOCK_VALUE"
  | "NON_RESTOCKABLE"
  | "DATA_GAP"
  | "ERROR";

export type InventoryReconRow = {
  variantId: string;
  sku: string;
  productName: string;
  classification: InventoryClassification;
  operationalOnHand: number;
  nativeLayerQuantity: number;
  quantityVariance: number;
  openingUnitCostInPaise: number | null;
  nativeInventoryValueInPaise: number;
  layerCount: number;
  uncostedQuantity: number;
  openingStatus: InventoryReconStatus;
  warnings: string[];
};

export type InventoryReconV2Row = InventoryReconRow & {
  openingLayerQty: number;
  purchaseReceiptLayerQty: number;
  clearing1210OutstandingInPaise: number | null;
};

export type InventoryReconV3Row = InventoryReconV2Row & {
  consumedQty: number;
  cogsPostedInPaise: number;
  cogsMissingQty: number;
};

export type InventoryReconV4Row = InventoryReconV3Row & {
  returnRestockLayerQty: number;
  originalConsumedQty: number;
  reversedConsumedQty: number;
  netConsumedQty: number;
  returnRestockValueInPaise: number;
  netCogsInPaise: number;
};

export type OpeningJournalProposal = {
  batchId: string;
  batchNumber: string;
  effectiveDate: Date;
  memo: string;
  totalQuantity: number;
  totalValueInPaise: number;
  lines: Array<{
    accountCode: string;
    debitInPaise: number;
    creditInPaise: number;
    lineMemo: string;
  }>;
  variantBreakdown: Array<{
    sku: string;
    quantity: number;
    unitCostInPaise: number;
    totalCostInPaise: number;
  }>;
};
