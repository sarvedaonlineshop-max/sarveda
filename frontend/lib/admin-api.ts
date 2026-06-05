import { getApiBase } from "@/lib/api";
import { AdminApiError, type ApiFieldError } from "@/lib/admin-errors";

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

  let json: {
    success?: boolean;
    data?: T;
    error?: string;
    code?: string;
    fields?: ApiFieldError[];
  } = {};
  try {
    json = (await res.json()) as typeof json;
  } catch {
    /* non-JSON body */
  }

  if (!res.ok || json.success === false) {
    throw new AdminApiError(json.error?.trim() || `Request failed (${res.status})`, {
      fields: json.fields,
      status: res.status,
      code: json.code
    });
  }

  if (json.data === undefined) {
    throw new AdminApiError("Empty response from server");
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
    currency: string;
    itemCount: number;
    linePreview: string[];
    createdAt: string;
  }>;
  pagination: { page: number; limit: number; total: number; totalPages: number };
};

export type CustomersListData = {
  items: Array<{
    id: string;
    email: string;
    name: string | null;
    phone: string | null;
    role: string;
    wooCommerceId: number | null;
    orderCount: number;
    createdAt: string;
  }>;
  pagination: { page: number; limit: number; total: number; totalPages: number };
};

export function fetchAdminCustomers(params: { q?: string; page?: number; limit?: number }) {
  const search = new URLSearchParams();
  if (params.q) search.set("q", params.q);
  if (params.page) search.set("page", String(params.page));
  if (params.limit) search.set("limit", String(params.limit));
  const qs = search.toString();
  return adminFetch<CustomersListData>(`/api/admin/customers${qs ? `?${qs}` : ""}`);
}

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

export function patchAdminOrderPreferredCourier(
  orderId: string,
  preferredCourier: "AUTO" | "DELHIVERY" | "SHIPROCKET" | "SHIPROCKET_INTERNATIONAL"
) {
  return adminFetch<{ preferredCourier: string }>(
    `/api/admin/orders/${encodeURIComponent(orderId)}/preferred-courier`,
    { method: "PATCH", body: JSON.stringify({ preferredCourier }) }
  );
}

export function patchAdminOrderItemWarehouses(
  orderId: string,
  items: Array<{ orderItemId: string; pickupLocationId: string | null }>
) {
  return adminFetch<{ updated: number }>(
    `/api/admin/orders/${encodeURIComponent(orderId)}/item-warehouses`,
    { method: "PATCH", body: JSON.stringify({ items }) }
  );
}

export function fetchAdminOrderShippingBreakdown(orderId: string) {
  return adminFetch<{
    breakdown: {
      zone: string;
      lines: Array<{
        productName: string;
        quantity: number;
        lineTotal: number;
        codSurcharge: number;
      }>;
      subtotalShipping: number;
      codExtra: number;
      totalWithCod: number;
    };
    orderShippingCharged: number;
  }>(`/api/admin/orders/${encodeURIComponent(orderId)}/shipping-breakdown`);
}

export function adminCreateShipmentForOrder(
  orderId: string,
  body?: {
    pickupLocationId?: string;
    shiprocketPickupName?: string;
    preferredCourier?: "AUTO" | "DELHIVERY" | "SHIPROCKET" | "SHIPROCKET_INTERNATIONAL";
  }
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

export type ZohoProductSyncResult = {
  ok: boolean;
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
};

export function postAdminProduct(body: Record<string, unknown>) {
  return adminFetch<{
    product: Record<string, unknown>;
    zohoSync?: ZohoProductSyncResult;
  }>(`/api/admin/products`, {
    method: "POST",
    body: JSON.stringify(body)
  });
}

export function putAdminProduct(id: string, body: Record<string, unknown>) {
  return adminFetch<{
    product: Record<string, unknown>;
    zohoSync?: ZohoProductSyncResult;
  }>(`/api/admin/products/${id}`, {
    method: "PUT",
    body: JSON.stringify(body)
  });
}

export function deleteAdminProduct(id: string) {
  return adminFetch<{ message: string }>(`/api/admin/products/${id}`, {
    method: "DELETE"
  });
}

export type SeoSuggestResult = {
  seoTitle: string;
  seoDescription: string;
  seoKeyword: string;
  source: "ai" | "local";
};

export function suggestProductSeo(body: {
  name: string;
  slug?: string;
  shortDescription?: string;
  description?: string;
  categoryNames?: string[];
}) {
  return adminFetch<SeoSuggestResult>("/api/admin/products/seo-suggest", {
    method: "POST",
    body: JSON.stringify(body)
  });
}

export function suggestCourseSeo(body: {
  name: string;
  slug?: string;
  shortDescription?: string;
  description?: string;
  teachers?: string[];
  duration?: string;
}) {
  return adminFetch<SeoSuggestResult>("/api/admin/courses/seo-suggest", {
    method: "POST",
    body: JSON.stringify(body)
  });
}

export function suggestMentorSeo(body: {
  name: string;
  slug?: string;
  description?: string;
  expertise?: string;
}) {
  return adminFetch<SeoSuggestResult>("/api/admin/mentors/seo-suggest", {
    method: "POST",
    body: JSON.stringify(body)
  });
}

export async function uploadAdminMedia(body: {
  filename: string;
  contentType: string;
  base64: string;
  folder?: "products" | "audio" | "courses" | "mentors" | "vaidyas";
}) {
  const payload = JSON.stringify(body);
  const paths = ["/api/admin/media/upload", "/api/admin/products/upload-image"];
  let lastErr: AdminApiError | null = null;
  for (const path of paths) {
    try {
      return await adminFetch<{ url: string; key: string }>(path, {
        method: "POST",
        body: payload
      });
    } catch (e) {
      lastErr = e instanceof AdminApiError ? e : new AdminApiError(String(e));
      if (lastErr.status !== 404 && lastErr.code !== "NOT_FOUND") throw lastErr;
    }
  }
  throw (
    lastErr ??
    new AdminApiError(
      "Image upload API not found on server. Deploy latest backend on EC2 (git pull + pm2 restart)."
    )
  );
}

export type CatalogGapsReport = {
  summary: {
    activeProducts: number;
    activeVariants: number;
    pricingGapCount: number;
    shippingGapCount: number;
    productsWithoutImage: number;
    payment: {
      razorpay: boolean;
      cod: boolean;
      stripe: boolean;
      paypal: boolean;
    };
  };
  pricingGaps: Array<{
    productId: string;
    productName: string;
    productSlug: string;
    variantId: string;
    sku: string;
    issue: string;
    zone?: string;
  }>;
  shippingGaps: Array<{
    productId: string;
    productName: string;
    productSlug: string;
    variantId: string;
    sku: string;
    issue: string;
    zone?: string;
  }>;
  productsWithoutPrimaryImage: Array<{ productId: string; name: string; slug: string }>;
};

export function fetchCatalogGaps(signal?: AbortSignal) {
  return adminFetch<CatalogGapsReport>(`/api/admin/catalog/gaps`, { signal });
}

export type InventoryCategoryRef = {
  slug: string;
  name: string;
  position: number;
};

export type InventoryRow = {
  inventoryId: string;
  variantId: string;
  sku: string;
  productId: string;
  productName: string;
  productSlug: string;
  productStatus: string;
  variantLabel: string | null;
  categories: InventoryCategoryRef[];
  primaryCategorySlug: string | null;
  primaryCategoryName: string;
  onHand: number;
  reserved: number;
  available: number;
  lowStockThreshold: number;
  low: boolean;
  inZohoBooks: boolean | null;
};

export type InventoryListData = {
  items: InventoryRow[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
  meta: {
    lastZohoStockSyncAt: string | null;
    zohoSkuAuditAvailable: boolean;
    productCount: number;
  };
};

export type ZohoStockSyncHistoryEntry = {
  id: string;
  at: string;
  scope: "full" | "product" | "unmatched";
  productId?: string;
  productName?: string;
  synced: number;
  errors: number;
  skipped: number;
};

export function fetchZohoStockSyncHistory(limit = 20) {
  return adminFetch<{ entries: ZohoStockSyncHistoryEntry[] }>(
    `/api/zoho/sync/history?limit=${limit}`
  );
}

export function fetchAdminInventory(params?: { page?: number; limit?: number; all?: boolean }) {
  const q = new URLSearchParams();
  if (params?.all) q.set("all", "1");
  else {
    if (params?.page) q.set("page", String(params.page));
    if (params?.limit) q.set("limit", String(params.limit));
  }
  const qs = q.toString();
  return adminFetch<InventoryListData>(`/api/admin/inventory${qs ? `?${qs}` : ""}`);
}

export function patchAdminInventoryVariant(
  variantId: string,
  patch: { onHand?: number; lowStockThreshold?: number }
) {
  return adminFetch<{ inventory: InventoryRow | null }>(
    `/api/admin/inventory/${variantId}`,
    {
      method: "PATCH",
      body: JSON.stringify(patch)
    }
  );
}

export function bulkPatchAdminInventory(
  updates: Array<{ variantId: string; onHand?: number; lowStockThreshold?: number }>
) {
  return adminFetch<{ updated: number; requested: number }>(`/api/admin/inventory/bulk`, {
    method: "POST",
    body: JSON.stringify({ updates })
  });
}

export function importAdminInventoryCsv(rows: Array<{ sku: string; onHand: number }>) {
  return adminFetch<{ updated: number; notFound: number; total: number }>(
    `/api/admin/inventory/import`,
    {
      method: "POST",
      body: JSON.stringify({ rows })
    }
  );
}

export type ZohoStockSyncResult = {
  synced: number;
  errors: number;
  skipped: number;
};

export function syncStockFromZohoAdmin(opts?: {
  productId?: string;
  productName?: string;
  unmatchedOnly?: boolean;
}) {
  return adminFetch<ZohoStockSyncResult>("/api/zoho/sync/stock", {
    method: "POST",
    body: JSON.stringify(opts ?? {})
  });
}

export type ReconciliationRow = {
  orderId: string;
  orderNumber: string;
  orderStatus: string;
  paymentStatus: string;
  provider: string | null;
  mismatch: boolean;
};

export function fetchPaymentsReconciliation(days = 30) {
  return adminFetch<{
    days: number;
    total: number;
    mismatchCount: number;
    mismatches: ReconciliationRow[];
    recent: ReconciliationRow[];
  }>(`/api/admin/payments/reconciliation?days=${days}`);
}

export const ADMIN_CONTENT_TYPES = [
  "pages",
  "courses",
  "events",
  "blog",
  "vaidyas",
  "mentors",
  "retreats",
  "offers",
  "testimonials"
] as const;

export type AdminContentType = (typeof ADMIN_CONTENT_TYPES)[number];

export const ADMIN_CONTENT_LABELS: Record<AdminContentType, string> = {
  pages: "Pages",
  courses: "Courses",
  events: "Events",
  blog: "Blog",
  vaidyas: "Vaidyas",
  mentors: "Mentors",
  retreats: "Retreats",
  offers: "Offers",
  testimonials: "Testimonials"
};

export type AdminContentRow = {
  id: string;
  slug: string;
  title: string;
  status: string;
  updatedAt: string;
};

export type AdminContentListData = {
  items: AdminContentRow[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
};

export function fetchAdminContentList(
  type: AdminContentType,
  params?: { page?: number; limit?: number; q?: string },
  signal?: AbortSignal
) {
  const q = new URLSearchParams();
  if (params?.page) q.set("page", String(params.page));
  if (params?.limit) q.set("limit", String(params.limit));
  if (params?.q) q.set("q", params.q);
  const qs = q.toString();
  return adminFetch<AdminContentListData>(
    `/api/admin/content/${encodeURIComponent(type)}${qs ? `?${qs}` : ""}`,
    { signal }
  );
}

export function fetchAdminContent(type: AdminContentType, id: string, signal?: AbortSignal) {
  return adminFetch<{ item: Record<string, unknown> }>(
    `/api/admin/content/${encodeURIComponent(type)}/${encodeURIComponent(id)}`,
    { signal }
  ).then((d) => d.item);
}

/** Alias for fetchAdminContent (single item GET). */
export const getAdminContent = fetchAdminContent;

export function createAdminContent(type: AdminContentType, body: Record<string, unknown>) {
  return adminFetch<{ item: Record<string, unknown> }>(
    `/api/admin/content/${encodeURIComponent(type)}`,
    { method: "POST", body: JSON.stringify(body) }
  ).then((d) => d.item);
}

export function updateAdminContent(
  type: AdminContentType,
  id: string,
  body: Record<string, unknown>
) {
  return adminFetch<{ item: Record<string, unknown> }>(
    `/api/admin/content/${encodeURIComponent(type)}/${encodeURIComponent(id)}`,
    { method: "PATCH", body: JSON.stringify(body) }
  ).then((d) => d.item);
}

export function deleteAdminContent(type: AdminContentType, id: string) {
  return adminFetch<{ message: string }>(
    `/api/admin/content/${encodeURIComponent(type)}/${encodeURIComponent(id)}`,
    { method: "DELETE" }
  );
}
