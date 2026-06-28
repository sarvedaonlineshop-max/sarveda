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
};

export async function fetchOrderPublic(orderNumber: string, email: string): Promise<OrderPublic> {
  const q = new URLSearchParams({ email: email.trim().toLowerCase() });
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
