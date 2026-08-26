import type { VendorBillStatus } from "@prisma/client";

export type VendorBillLineClass = "STOCK" | "NON_STOCK";

export type VendorBillLineSnapshot = {
  id: string;
  variantId: string | null;
  itemName: string;
  sku: string | null;
  quantity: number;
  rateInPaise: number;
  taxClass: string | null;
  taxInPaise: number;
  lineTotalInPaise: number;
  sortOrder: number;
  classification: VendorBillLineClass;
  /** qty × rate (pre-discount exclusive base) */
  exclusiveBaseInPaise: number;
};

export type VendorBillSnapshot = {
  billId: string;
  billNumber: string;
  referenceNumber: string | null;
  billDate: Date;
  dueDate: Date | null;
  status: VendorBillStatus;
  purchaseOrderId: string | null;
  purchaseOrderNumber: string | null;
  vendorId: string;
  vendorName: string;
  vendorGstin: string | null;
  vendorBillingState: string | null;
  vendorBillingCountry: string;
  vendorCurrency: string;
  subtotalInPaise: number;
  discountInPaise: number;
  adjustmentInPaise: number;
  taxInPaise: number;
  totalInPaise: number;
  paidInPaise: number;
  reverseCharge: boolean;
  lines: VendorBillLineSnapshot[];
  /** SHA-256 of financial fingerprint for SOURCE_CHANGED_AFTER_POST detection */
  sourceFingerprint: string;
  updatedAt: Date;
};

export type VendorBillEligibility = {
  eligible: boolean;
  code: string;
  reason?: string;
  warnings: string[];
};

export type VendorBillJournalLineProposal = {
  accountCode: string;
  debitInPaise: number;
  creditInPaise: number;
  lineMemo: string;
  amountSource: string;
  billLineIds?: string[];
};

export type VendorBillGstDiagnostics = {
  jurisdiction: "INTRA_STATE" | "INTER_STATE" | "NONE" | "UNKNOWN";
  gstRecognized: boolean;
  cgstInPaise: number;
  sgstInPaise: number;
  igstInPaise: number;
  taxInPaise: number;
  itcStatus: string;
  dataGapCodes: string[];
};

export type VendorBillJournalProposal = {
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
  lines: VendorBillJournalLineProposal[];
  diagnostics: {
    stockClearingInPaise: number;
    expenseInPaise: number;
    apCreditInPaise: number;
    discountInPaise: number;
    adjustmentInPaise: number;
    adjustmentPolicy: "ALLOCATED_PRO_RATA" | "NONE";
    warnings: string[];
    gst: VendorBillGstDiagnostics;
    lineAllocations: Array<{
      billLineId: string;
      classification: VendorBillLineClass;
      allocatedBaseInPaise: number;
    }>;
  };
  reconciliationMetadata: Record<string, unknown>;
};
