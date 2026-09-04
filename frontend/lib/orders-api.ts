import { getApiBase } from "./api";
import type { CartApiResponse } from "./cart-api";
import { notifyCartChanged, writeSession } from "./cart-api";

export type OrderShipmentPublic = {
  id: string;
  courier: string;
  awb: string | null;
  trackingUrl: string | null;
  status: string;
  deliveredAt: string | null;
  rtoAt: string | null;
  updatedAt: string;
};

export type OrderLineItem = {
  id: string;
  title: string;
  quantity: number;
  lineTotalInPaise: number;
  skuSnapshot?: string;
};

export type OrderCostBreakdown = {
  itemsSubtotalInPaise?: number | null;
  shippingInPaise?: number | null;
  discountInPaise?: number | null;
  /** GST amount already included in the grand total. */
  gstIncludedInPaise?: number | null;
  /** e.g. "18%" — label only, no math done client-side. */
  gstRateLabel?: string | null;
};

export type OrderShippingAddress = {
  name?: string | null;
  line1?: string | null;
  line2?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
  country?: string | null;
  phone?: string | null;
};

export type OrderPublic = {
  orderNumber: string;
  status: string;
  paymentStatus: string;
  paymentProvider?: string | null;
  isCod?: boolean;
  subtotalInPaise: number;
  discountInPaise: number;
  shippingInPaise: number;
  grandTotalInPaise: number;
  couponCode?: string | null;
  currency: string;
  email: string;
  createdAt: string;
  placedAt?: string | null;
  invoiceNo?: string | null;
  items: Array<{
    nameSnapshot: string;
    skuSnapshot: string;
    qtyOrdered: number;
    unitPriceInPaise: number;
    lineTotalInPaise: number;
  }>;
  shippingAddress: {
    fullName: string;
    phone: string;
    line1: string;
    line2: string | null;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  } | undefined;
  shipments: OrderShipmentPublic[];
  shippingLastError: string | null;
  shippingLastErrorAt: string | null;
};

export type OrderSummary = {
  orderNumber: string;
  /** Checkout email — present once backend is updated; fall back to account email in UI. */
  email?: string;
  status: string;
  paymentStatus: string;
  paymentProvider?: string | null;
  isCod?: boolean;
  grandTotalInPaise: number;
  currency: string;
  createdAt: string;
  placedAt: string | null;
  itemCount: number;
  headline: string;
  invoiceNo: string | null;
  deliveryPartner?: string | null;
  awb?: string | null;
  trackingUrl?: string | null;
  shipmentStatus?: string | null;
  lineItems?: OrderLineItem[] | null;
  costBreakdown?: OrderCostBreakdown | null;
  shippingAddress?: OrderShippingAddress | null;
  serviceRequest?: {
    id: string;
    type: "CANCEL_BEFORE_DELIVERY" | "REFUND_AFTER_DELIVERY" | "ADJUST_BEFORE_DELIVERY";
    status: "PENDING_APPROVAL" | "APPROVED" | "REJECTED" | "NEEDS_DISCUSSION" | "CONVERTED_TO_CANCELLATION";
    reasonLabel: string;
    message: string | null;
    createdAt: string;
    returnPhysicalStatus?: string | null;
    resolutionStatus?: string | null;
    refundTotalInPaise?: number | null;
    customerStatus?: { label: string; detail?: string } | null;
  } | null;
  canCancelRequest?: boolean;
  cancelBlockReason?: string | null;
  canAdjustRequest?: boolean;
  adjustBlockReason?: string | null;
  rtoCustomerStatus?: { inRto: boolean; label: string; detail?: string } | null;
  canRefundRequest?: boolean;
  returnWindowEndsAt?: string | null;
  returnWindowExpired?: boolean;
  paymentReference?: string | null;
  cancellationInfo?: {
    title: string;
    description: string;
    category: string;
    occurredAt: string;
    rawReason: string | null;
    customerReasons?: Array<{ itemName: string; reasonLabel: string; message?: string | null }>;
  } | null;
};

export async function fetchOrderPublic(
  orderNumber: string,
  emailOrContact: string,
  phone?: string
): Promise<OrderPublic> {
  const q = new URLSearchParams();
  const contact = emailOrContact.trim();
  if (phone?.trim()) {
    q.set("phone", phone.trim());
  } else if (contact.includes("@")) {
    q.set("email", contact.toLowerCase());
  } else {
    q.set("phone", contact);
  }
  const res = await fetch(
    `${getApiBase()}/api/orders/public/${encodeURIComponent(orderNumber)}?${q.toString()}`,
    { credentials: "include" }
  );
  const json = (await res.json()) as { success?: boolean; data?: { order: OrderPublic }; error?: string };
  if (!res.ok || !json.success || !json.data?.order) {
    throw new Error(json.error || "Could not load order");
  }
  return json.data.order;
}

export type RefreshShippingResponse = {
  syncResults: Array<{ awb: string; ok: boolean; error?: string; code?: string; data?: unknown }>;
  order: OrderPublic;
};

export async function refreshOrderShippingPublic(
  orderNumber: string,
  email: string
): Promise<RefreshShippingResponse> {
  const res = await fetch(
    `${getApiBase()}/api/orders/public/${encodeURIComponent(orderNumber)}/refresh-shipping`,
    {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ email: email.trim().toLowerCase() })
    }
  );
  const json = (await res.json()) as {
    success?: boolean;
    data?: RefreshShippingResponse;
    error?: string;
  };
  if (!res.ok || !json.success || !json.data) {
    throw new Error(json.error || "Could not refresh tracking");
  }
  return json.data;
}

export async function fetchMyOrders(): Promise<OrderSummary[]> {
  const res = await fetch(`${getApiBase()}/api/orders/me`, {
    credentials: "include",
    headers: { Accept: "application/json" }
  });
  const json = (await res.json()) as { success?: boolean; data?: { orders: OrderSummary[] }; error?: string };
  if (!res.ok || !json.success || !json.data?.orders) {
    throw new Error(json.error || "Could not load your orders");
  }
  return json.data.orders;
}

export function orderInvoiceDownloadUrl(orderNumber: string, email: string): string {
  const q = new URLSearchParams({ email: email.trim().toLowerCase() });
  return `${getApiBase()}/api/orders/public/${encodeURIComponent(orderNumber)}/invoice?${q.toString()}`;
}

export function orderCancelledPageUrl(orderNumber: string, email: string): string {
  const q = new URLSearchParams({ email: email.trim().toLowerCase(), orderNumber });
  return `/order/cancelled?${q.toString()}`;
}

export type ReorderResult = {
  restoredCount: number;
  skipped: Array<{ name: string; reason: string }>;
  itemCount: number;
  cart?: CartApiResponse;
};

export async function reorderCancelledOrder(orderNumber: string, email: string): Promise<ReorderResult> {
  const res = await fetch(
    `${getApiBase()}/api/orders/public/${encodeURIComponent(orderNumber)}/reorder`,
    {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ email: email.trim().toLowerCase() })
    }
  );
  const json = (await res.json()) as {
    success?: boolean;
    data?: CartApiResponse & {
      sessionId?: string;
      restoredCount?: number;
      skipped?: Array<{ name: string; reason: string }>;
    };
    error?: string;
    code?: string;
  };
  if (!res.ok || !json.success || !json.data) {
    throw new Error(json.error || "Could not restore items to cart");
  }
  if (json.data.sessionId && typeof window !== "undefined") {
    writeSession(json.data.sessionId);
  }
  notifyCartChanged(json.data);
  return {
    restoredCount: json.data.restoredCount ?? 0,
    skipped: json.data.skipped ?? [],
    itemCount: json.data.itemCount,
    cart: json.data
  };
}
