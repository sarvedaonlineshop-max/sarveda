import { getApiBase } from "@/lib/api";

async function adminFetch<T>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const url = `${getApiBase()}${path.startsWith("/") ? path : `/${path}`}`;
  const res = await fetch(url, {
    ...init,
    credentials: "include",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...init?.headers
    }
  });

  const json = (await res.json()) as { success?: boolean; data?: T; error?: string };

  if (!res.ok || !json.success || json.data === undefined) {
    throw new Error(json.error || `Admin request failed: ${res.status}`);
  }

  return json.data as T;
}

export type DashboardData = {
  totalRevenueInPaise: number;
  revenueInPaise: {
    today: number;
    last7Days: number;
    thisMonth: number;
  };
  ordersCount: { today: number; thisWeek: number; thisMonth: number };
  productsByStatus: { active: number; draft: number; archived: number };
  recentOrders: Array<{
    id: string;
    orderNumber: string;
    email: string;
    status: string;
    grandTotalInPaise: number;
    createdAt: string;
  }>;
  lowStockAlerts: Array<{
    variantId: string;
    sku: string;
    onHand: number;
    reserved: number;
    lowStockThreshold: number;
    productName: string;
    productSlug: string;
  }>;
  revenueByDayLast7: Array<{ date: string; revenueInPaise: number }>;
  revenueByDayLast30: Array<{ date: string; revenueInPaise: number }>;
  revenueByMonthLast12: Array<{ month: string; revenueInPaise: number }>;
  insights: {
    fastMovers: Array<{ productId: string; name: string; unitsSold: number }>;
    slowMovers: Array<{ productId: string; name: string; unitsSold: number }>;
    tips: string[];
  };
};

export function fetchAdminDashboard() {
  return adminFetch<DashboardData>("/api/admin/dashboard");
}

export async function downloadAdminOrdersPdf(range: "today" | "week" | "month" | "year") {
  const url = `${getApiBase()}/api/admin/orders/export/pdf?range=${encodeURIComponent(range)}`;
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) {
    let msg = `Export failed (${res.status})`;
    try {
      const j = (await res.json()) as { error?: string };
      if (j.error) msg = j.error;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  const blob = await res.blob();
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = `sarveda-orders-${range}.pdf`;
  a.click();
  URL.revokeObjectURL(href);
}

export type OrdersListData = {
  items: Array<{
    id: string;
    orderNumber: string;
    email: string;
    customerName: string | null;
    status: string;
    paymentStatus: string;
    grandTotalInPaise: number;
    itemCount: number;
    linePreview: string[];
    createdAt: string;
  }>;
  pagination: { page: number; limit: number; total: number; totalPages: number };
};

export function fetchAdminOrders(
  params: { bucket?: string; page?: number; limit?: number },
  signal?: AbortSignal
) {
  const q = new URLSearchParams();
  if (params.bucket) q.set("bucket", params.bucket);
  if (params.page) q.set("page", String(params.page));
  if (params.limit) q.set("limit", String(params.limit));
  const qs = q.toString();
  return adminFetch<OrdersListData>(`/api/admin/orders${qs ? `?${qs}` : ""}`, { signal });
}

export type OrderDetail = Record<string, unknown>;

export function fetchAdminOrderDetail(id: string, signal?: AbortSignal) {
  return adminFetch<{ order: OrderDetail }>(`/api/admin/orders/${id}`, { signal }).then((d) => d.order);
}

export function patchAdminOrderStatus(id: string, status: string) {
  return adminFetch<{ order: OrderDetail }>(`/api/admin/orders/${id}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status })
  }).then((d) => d.order);
}

export function patchAdminOrderAddress(
  orderId: string,
  body: {
    type: "SHIPPING" | "BILLING";
    fullName?: string;
    phone?: string;
    line1?: string;
    line2?: string | null;
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
  }
) {
  return adminFetch<{ order: OrderDetail }>(`/api/admin/orders/${encodeURIComponent(orderId)}/addresses`, {
    method: "PATCH",
    body: JSON.stringify(body)
  }).then((d) => d.order);
}

export type ReconcileRazorpayResult = {
  updated: boolean;
  reason?: string;
  paymentsChecked?: number;
  orderStatus?: string;
  paymentStatus?: string;
  orderNumber?: string;
  razorpayPaymentId?: string;
};

export function reconcileAdminOrderRazorpay(orderId: string) {
  return adminFetch<ReconcileRazorpayResult>(
    `/api/admin/orders/${encodeURIComponent(orderId)}/reconcile-razorpay`,
    { method: "POST", body: "{}" }
  );
}

export function adminSyncOrderShipments(orderId: string) {
  return adminFetch<{
    results: Array<{ awb: string; ok: boolean; error?: string; code?: string; data?: unknown }>;
    shipments: unknown[];
    orderStatus: string;
    fulfillmentStatus: string;
  }>(`/api/shipping/admin/orders/${encodeURIComponent(orderId)}/sync-tracking`, {
    method: "POST",
    body: "{}"
  });
}

export function adminCreateShipmentForOrder(
  orderId: string,
  body?: { pickupLocationId?: string; shiprocketPickupName?: string }
) {
  return adminFetch<{ courier: string; waybill: string; trackingUrl: string }>(
    `/api/shipping/create-shipment/${encodeURIComponent(orderId)}`,
    { method: "POST", body: JSON.stringify(body ?? {}) }
  );
}

export function adminCancelWaybill(waybill: string, options?: { localOnly?: boolean }) {
  return adminFetch<{
    cancelled: boolean;
    waybill: string;
    orderId: string;
    localOnly?: boolean;
    carrierAlreadyCancelled?: boolean;
    carrierCancelled?: boolean;
  }>(`/api/shipping/admin/cancel-waybill`, {
    method: "POST",
    body: JSON.stringify({ waybill, ...(options?.localOnly ? { localOnly: true } : {}) })
  });
}

export function adminTrackShipmentByWaybill(waybill: string) {
  return adminFetch<{
    waybill: string;
    courier: string;
    shipmentStatus: string;
    orderStatus: string;
    fulfillmentStatus: string;
  }>(`/api/shipping/track/${encodeURIComponent(waybill)}`);
}

export type AdminPickupLocationRow = {
  id: string;
  label: string;
  shiprocketPickupName: string;
  line1: string | null;
  line2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  notes: string | null;
  isPrimary: boolean;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export function fetchAdminPickupLocations(params?: { activeOnly?: boolean }) {
  const q = new URLSearchParams();
  if (params?.activeOnly) q.set("activeOnly", "true");
  const qs = q.toString();
  return adminFetch<{ items: AdminPickupLocationRow[] }>(
    `/api/admin/pickup-locations${qs ? `?${qs}` : ""}`
  ).then((d) => d.items);
}

export function postAdminPickupLocation(body: {
  label: string;
  shiprocketPickupName: string;
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  notes?: string;
  isPrimary?: boolean;
  sortOrder?: number;
}) {
  return adminFetch<{ item: AdminPickupLocationRow }>("/api/admin/pickup-locations", {
    method: "POST",
    body: JSON.stringify(body)
  }).then((d) => d.item);
}

export function patchAdminPickupLocation(
  id: string,
  body: Partial<{
    label: string;
    shiprocketPickupName: string;
    line1: string | null;
    line2: string | null;
    city: string | null;
    state: string | null;
    postalCode: string | null;
    notes: string | null;
    isPrimary: boolean;
    sortOrder: number;
    isActive: boolean;
  }>
) {
  return adminFetch<{ item: AdminPickupLocationRow }>(`/api/admin/pickup-locations/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body)
  }).then((d) => d.item);
}

export function deleteAdminPickupLocation(id: string) {
  return adminFetch<{ item: AdminPickupLocationRow }>(`/api/admin/pickup-locations/${id}`, {
    method: "DELETE"
  }).then((d) => d.item);
}

export function fetchAdminOrderInvoice(id: string, signal?: AbortSignal) {
  return adminFetch<{ pdfUrl: string | null; invoiceNo: string | null }>(
    `/api/admin/orders/${id}/invoice`,
    { signal }
  );
}

export type AdminProductRow = {
  id: string;
  slug: string;
  name: string;
  status: string;
  productType: string;
  primaryImageUrl: string | null;
  fromPriceInPaise: number | null;
  totalOnHand: number;
  categories: Array<{ id: string; slug: string; name: string }>;
};

export type AdminProductListData = {
  items: AdminProductRow[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
};

export function fetchAdminProducts(
  params: {
    q?: string;
    category?: string;
    status?: string;
    page?: number;
    limit?: number;
  },
  signal?: AbortSignal
) {
  const q = new URLSearchParams();
  if (params.q) q.set("q", params.q);
  if (params.category) q.set("category", params.category);
  if (params.status) q.set("status", params.status);
  if (params.page) q.set("page", String(params.page));
  if (params.limit) q.set("limit", String(params.limit));
  return adminFetch<AdminProductListData>(`/api/admin/products?${q.toString()}`, { signal });
}

export function fetchAdminProduct(id: string, signal?: AbortSignal) {
  return adminFetch<{ product: Record<string, unknown> }>(`/api/admin/products/${id}`, {
    signal
  }).then((d) => d.product);
}

export function putAdminProduct(id: string, body: Record<string, unknown>) {
  return adminFetch<{ product: Record<string, unknown> }>(`/api/admin/products/${id}`, {
    method: "PUT",
    body: JSON.stringify(body)
  }).then((d) => d.product);
}

export type InventoryRow = {
  inventoryId: string;
  variantId: string;
  sku: string;
  productId: string;
  productName: string;
  productSlug: string;
  productStatus: string;
  variantLabel: string | null;
  onHand: number;
  reserved: number;
  available: number;
  lowStockThreshold: number;
  low: boolean;
};

export type InventoryListData = {
  items: InventoryRow[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
};

export function fetchAdminInventory(params?: { page?: number; limit?: number }) {
  const q = new URLSearchParams();
  if (params?.page) q.set("page", String(params.page));
  if (params?.limit) q.set("limit", String(params.limit));
  const qs = q.toString();
  return adminFetch<InventoryListData>(`/api/admin/inventory${qs ? `?${qs}` : ""}`);
}

export function patchAdminInventoryVariant(variantId: string, onHand: number) {
  return adminFetch<{ inventory: Record<string, unknown> }>(
    `/api/admin/inventory/${variantId}`,
    {
      method: "PATCH",
      body: JSON.stringify({ onHand })
    }
  );
}
