import type { OrderStatus, PaymentProvider, PaymentStatus } from "@prisma/client";

import type { SupplyType } from "../../utils/gst-state";

export type OrderPaidLineSnapshot = {
  orderItemId: string;
  productId?: string | null;
  variantId?: string | null;
  skuSnapshot: string;
  nameSnapshot: string;
  qtyOrdered: number;
  unitPriceInPaise: number;
  lineTotalInPaise: number;
  taxClass: string | null;
  hsnCode?: string | null;
};

export type OrderPaidSnapshot = {
  orderId: string;
  orderNumber: string;
  placedAt: Date;
  currency: string;
  status: OrderStatus;
  subtotalInPaise: number;
  discountInPaise: number;
  shippingInPaise: number;
  grandTotalInPaise: number;
  shippingCountry: string;
  shippingState: string;
  payment: {
    id: string;
    provider: PaymentProvider;
    status: PaymentStatus;
    amountInPaise: number;
  };
  lines: OrderPaidLineSnapshot[];
  zohoInvoiceId?: string | null;
  zohoInvoiceNo?: string | null;
  /** Native customer GSTIN — not captured yet (always null in Phase 5B). */
  buyerGstin?: string | null;
};

export type ProposedJournalLine = {
  accountCode: string;
  accountName: string;
  debitInPaise: number;
  creditInPaise: number;
  lineMemo?: string;
  amountSource: string;
};

export type OrderPaidTaxLineSnapshot = {
  orderItemId: string;
  productId: string | null;
  variantId: string | null;
  sku: string;
  grossInclusiveInPaise: number;
  allocatedDiscountInPaise: number;
  /** @deprecated alias — use allocatedDiscountInPaise */
  discountPaise: number;
  netInclusiveInPaise: number;
  taxableValueInPaise: number;
  gstRate: number;
  /** @deprecated alias — use gstRate */
  gstRatePercent: number;
  taxClassRaw: string | null;
  taxClassDefaulted: boolean;
  totalTaxInPaise: number;
  cgstInPaise: number;
  sgstInPaise: number;
  igstInPaise: number;
  hsnSac: string | null;
  hsnSacResolved: string;
  hsnSource: "PRODUCT" | "DEFAULT";
  preTaxablePaise: number;
  postTaxablePaise: number;
  /** @deprecated alias — use taxableValueInPaise */
  postTaxPaise: number;
};

export type OrderPaidTaxDiagnostics = {
  isGstApplicable: boolean;
  interState: boolean;
  supplyType: SupplyType | "NON_GST" | "DATA_GAP";
  sellerStateRaw: string | null;
  sellerStateCode: string | null;
  placeOfSupplyRaw: string | null;
  placeOfSupplyCode: string | null;
  sellerGstin: string | null;
  buyerGstin: string | null;
  buyerGstinMissing: boolean;
  placeOfSupplyError: string | null;
  preDiscountTaxablePaise: number;
  postDiscountTaxablePaise: number;
  discountTaxableContraPaise: number;
  outputCgstPaise: number;
  outputSgstPaise: number;
  outputIgstPaise: number;
  outputGstTotalPaise: number;
  netProductRevenuePaise: number;
  shippingPaise: number;
  shippingGstPolicy: "SHIPPING_GST_DATA_GAP";
  shippingGstWarning: boolean;
  warnings: string[];
  taxSnapshotVersion: "ORDER_PAID_TAX_SNAPSHOT_V1";
  lineAllocations: OrderPaidTaxLineSnapshot[];
  pdfBasis?: {
    taxablePaise: number;
    gstTotalPaise: number;
    cgstPaise: number;
    sgstPaise: number;
    igstPaise: number;
  };
  pdfJournalTaxDivergencePaise: number;
  zohoParity?: {
    nativeMerchandiseNetPaise: number;
    zohoMerchandiseNetPaise: number;
    merchandiseVariancePaise: number;
  };
};

export type OrderPaidJournalProposal = {
  calcVersion: string;
  eventType: string;
  uniqueKey: string;
  accountingDate: Date;
  reference: string;
  memo: string;
  currency: string;
  provider: PaymentProvider;
  postingEventKey: string;
  lines: ProposedJournalLine[];
  totalDebitPaise: number;
  totalCreditPaise: number;
  imbalancePaise: number;
  balanced: boolean;
  diagnostics: OrderPaidTaxDiagnostics;
  reconciliationMetadata: Record<string, unknown>;
  /** When set, posting must fail closed (commerce unaffected). */
  taxPostingBlock?: {
    code: string;
    reason: string;
  } | null;
};
