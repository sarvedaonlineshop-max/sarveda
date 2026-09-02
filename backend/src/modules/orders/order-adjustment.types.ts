import type { OrderServiceRequestIntent } from "@prisma/client";

export type CommercialClassification =
  | "NO_PAYMENT_CHANGE"
  | "ADDITIONAL_PAYMENT_REQUIRED"
  | "REFUND_REQUIRED"
  | "COMMERCIAL_REVIEW_REQUIRED"
  | "ACCOUNTING_REVIEW_REQUIRED";

export type AddressSnapshot = {
  fullName: string;
  phone: string;
  line1: string;
  line2: string | null;
  city: string;
  state: string;
  postalCode: string;
  country: string;
};

export type LineItemSnapshot = {
  orderItemId: string;
  variantId: string;
  skuSnapshot: string;
  nameSnapshot: string;
  qtyOrdered: number;
  unitPriceInPaise: number;
  lineTotalInPaise: number;
};

export type AdjustmentPayload = {
  intent: OrderServiceRequestIntent;
  before: {
    shippingAddress?: AddressSnapshot;
    line?: LineItemSnapshot;
  };
  requested: {
    shippingAddress?: AddressSnapshot;
    variantId?: string;
    qtyOrdered?: number;
  };
  submittedAt: string;
};

export type CommercialDeltaBreakdown = {
  oldMerchandisePaise: number;
  newMerchandisePaise: number;
  oldShippingPaise: number;
  newShippingPaise: number;
  oldGrandTotalPaise: number;
  newGrandTotalPaise: number;
  deltaPaise: number;
  classification: CommercialClassification;
  warnings: string[];
  canExecuteAutomatically: boolean;
};

export type AdjustmentExecutionPreview = CommercialDeltaBreakdown & {
  eligible: boolean;
  blockCode?: string;
  blockMessage?: string;
  inventoryWarnings: string[];
};
