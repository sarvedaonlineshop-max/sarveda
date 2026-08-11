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
    source?: "woo-dump";
    periodLabel?: string;
    mostSoldThisMonthTop5?: Array<{ sku: string; name: string; unitsSold: number }>;
    purchaseOrderNeededCount?: number;
    dropCandidatesCount?: number;
    leastSoldThisMonthCount?: number;
    tips: string[];
    /** @deprecated empty when using woo-dump */
    fastMovers: Array<{ productId: string; name: string; unitsSold: number }>;
    /** @deprecated empty when using woo-dump */
    slowMovers: Array<{ productId: string; name: string; unitsSold: number }>;
  };
};

export function fetchAdminDashboard() {
  return adminFetch<DashboardData>("/api/admin/dashboard");
}

export type WooDumpProductRow = {
  sku: string;
  productName: string;
  slug?: string;
  unitsSold: number;
  revenueInr: number;
  revenueInPaise: number;
  orderCount?: number;
  lineRows?: number;
};

export type AdminWooAnalyticsMeta = {
  source: string;
  dumpFile: string;
  generatedAt: string;
  availableRange: { minDate: string; maxDate: string };
  appliedRange: { from: string; to: string };
  note: string;
};

export type AdminWooAnalyticsOverview = {
  kpis: {
    orders: number;
    revenueInr: number;
    aovInr: number;
    units: number;
    refundAmountInr: number;
    refundCount: number;
    returnUnits: number;
    repeatCustomerCount: number;
    uniqueCustomers: number;
    newCustomers: number;
  };
  orderTrend: Array<{ month: string; orders: number; revenueInr: number }>;
  tips: string[];
};

export type AdminWooProductAnalytics = {
  meta: AdminWooAnalyticsMeta;
  overview: AdminWooAnalyticsOverview;
  tab: "products" | "orders" | "places" | "returns" | "refunds" | "customers";
  products?: {
    mostSold: WooDumpProductRow[];
    leastSold: WooDumpProductRow[];
    purchaseOrderNeeded: WooDumpProductRow[];
    dropCandidates: WooDumpProductRow[];
  };
  orders?: {
    byStatus: Record<string, number>;
    highestOrders: Array<{
      orderNumber: string;
      email: string;
      customerName: string;
      city: string;
      status: string;
      placedAt: string;
      totalInr: number;
      totalInPaise: number;
    }>;
    orderTrend: Array<{ month: string; orders: number; revenueInr: number }>;
  };
  places?: {
    topPlaces: Array<{
      city: string;
      state: string;
      country: string;
      orderCount: number;
      totalInr: number;
      totalInPaise: number;
    }>;
  };
  returns?: {
    returnedItems: WooDumpProductRow[];
    returnsByCustomer: Array<{ email: string; customerName: string; units: number; lines: number }>;
    returnTrend: Array<{ month: string; units: number; lines: number }>;
    returnItemTrend: Array<{
      productName: string;
      sku: string;
      months: Array<{ month: string; units: number }>;
    }>;
    note: string;
  };
  refunds?: {
    list: Array<{
      refundId: number;
      orderNumber: string;
      date: string;
      amountInr: number;
      reason: string;
      email: string;
      customerName: string;
    }>;
    refundTrend: Array<{ month: string; count: number; amountInr: number }>;
    refundsByCustomer: Array<{
      email: string;
      customerName: string;
      count: number;
      amountInr: number;
    }>;
    refundReasons: Array<{ reason: string; count: number }>;
  };
  customers?: {
    mostVisited: Array<{
      email: string;
      name: string;
      lastActive: string;
      city: string;
      registered: string;
    }>;
    mostBought: Array<{
      email: string;
      name: string;
      city: string;
      orderCount: number;
      totalSpendInr: number;
      lastOrderedAt: string;
    }>;
    repeatCustomers: Array<{
      email: string;
      name: string;
      city: string;
      orderCount: number;
      totalSpendInr: number;
      totalSpendInPaise: number;
      lastOrderedAt: string;
    }>;
    newCustomers: number;
    note: string;
  };
};

export function fetchAdminWooAnalytics(params?: {
  from?: string;
  to?: string;
  tab?: AdminWooProductAnalytics["tab"];
}) {
  const q = new URLSearchParams();
  if (params?.from) q.set("from", params.from);
  if (params?.to) q.set("to", params.to);
  if (params?.tab) q.set("tab", params.tab);
  const qs = q.toString();
  return adminFetch<AdminWooProductAnalytics>(
    `/api/admin/analytics/woo-products${qs ? `?${qs}` : ""}`
  );
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

export type AdminReportType =
  | "sales"
  | "products"
  | "customers"
  | "vendors"
  | "razorpay"
  | "paypal"
  | "stripe"
  | "gateways";

export type AdminReportPeriod = "daily" | "weekly" | "monthly" | "financial_year";

export type AdminReportsAnalytics = {
  label: string;
  totals: { orders: number; units: number };
  topItemsSource?: "woo-dump" | "database";
  topItems: Array<{
    sku: string;
    productName: string;
    slug: string;
    unitsSold: number;
    revenueInPaise: number;
    revenueInr: number;
  }>;
  repeatCustomers: Array<{
    email: string;
    name: string;
    city: string;
    orderCount: number;
    totalSpendInPaise: number;
    totalSpendInr: number;
    lastOrderedAt: string;
  }>;
  topPlaces: Array<{
    city: string;
    state: string;
    country: string;
    orderCount: number;
    totalInPaise: number;
    totalInr: number;
  }>;
  highestOrders: Array<{
    id: string;
    orderNumber: string;
    email: string;
    customerName: string;
    city: string;
    status: string;
    placedAt: string;
    totalInPaise: number;
    totalInr: number;
  }>;
};

export async function downloadAdminReportExcel(type: AdminReportType, period: AdminReportPeriod) {
  const q = new URLSearchParams({ type, period });
  const url = `${getApiBase()}/api/admin/reports/export?${q.toString()}`;
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
  const cd = res.headers.get("Content-Disposition") ?? "";
  const match = /filename="([^"]+)"/i.exec(cd);
  const filename = match?.[1] ?? `sarveda-${type}-${period}.xlsx`;
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(href);
}

export function fetchAdminReportAnalytics() {
  return adminFetch<AdminReportsAnalytics>(`/api/admin/reports/analytics`);
}

export type AdminSessionRow = {
  id: string;
  loginAt: string;
  logoutAt: string | null;
  ip: string | null;
  userAgent: string | null;
};

export type AdminMeSessionsData = {
  user: { id: string; name: string | null; email: string; role: string };
  sessions: AdminSessionRow[];
};

export function fetchAdminMeSessions() {
  return adminFetch<AdminMeSessionsData>("/api/admin/me/sessions");
}

export type AdminActivityItem = {
  id: string;
  actorUserId: string;
  actorEmail: string;
  actorName: string | null;
  action: string;
  resource: string;
  summary: string;
  method: string | null;
  path: string | null;
  entityId: string | null;
  metadata: unknown;
  ip: string | null;
  createdAt: string;
};

export type AdminActivityListData = {
  items: AdminActivityItem[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
};

export type AdminActivityDashboardData = {
  days: number;
  total: number;
  byAction: Array<{ action: string; count: number }>;
  byResource: Array<{ resource: string; count: number }>;
  byActor: Array<{ userId: string; email: string; name: string | null; count: number }>;
  recent: Array<{
    id: string;
    actorEmail: string;
    actorName: string | null;
    action: string;
    resource: string;
    summary: string;
    createdAt: string;
  }>;
  admins: Array<{ id: string; email: string; name: string | null; role: string }>;
};

export function fetchAdminActivityDashboard(days = 7) {
  return adminFetch<AdminActivityDashboardData>(
    `/api/admin/activity/dashboard?days=${encodeURIComponent(String(days))}`
  );
}

export function fetchAdminActivityList(params: {
  page?: number;
  limit?: number;
  actorUserId?: string;
  resource?: string;
  action?: string;
  q?: string;
}) {
  const q = new URLSearchParams();
  if (params.page) q.set("page", String(params.page));
  if (params.limit) q.set("limit", String(params.limit));
  if (params.actorUserId) q.set("actorUserId", params.actorUserId);
  if (params.resource) q.set("resource", params.resource);
  if (params.action) q.set("action", params.action);
  if (params.q?.trim()) q.set("q", params.q.trim());
  const qs = q.toString();
  return adminFetch<AdminActivityListData>(`/api/admin/activity${qs ? `?${qs}` : ""}`);
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

export type CourseEnrollmentRow = {
  id: string;
  status: string;
  enrolledAt: string;
  user: { id: string; email: string; name: string | null; phone: string | null };
  course: { id: string; slug: string; title: string };
  order: {
    id: string;
    orderNumber: string;
    grandTotalInPaise: number;
    currency: string;
    paymentStatus: string;
    orderStatus: string;
  } | null;
};

export type CourseEnrollmentsListData = {
  items: CourseEnrollmentRow[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
};

export type CourseEnrollmentFilterCourse = {
  id: string;
  slug: string;
  title: string;
  status: string;
  enrollmentCount: number;
};

export function fetchAdminCourseEnrollments(params: {
  q?: string;
  courseId?: string;
  status?: string;
  page?: number;
  limit?: number;
}) {
  const search = new URLSearchParams();
  if (params.q) search.set("q", params.q);
  if (params.courseId) search.set("courseId", params.courseId);
  if (params.status) search.set("status", params.status);
  if (params.page) search.set("page", String(params.page));
  if (params.limit) search.set("limit", String(params.limit));
  const qs = search.toString();
  return adminFetch<CourseEnrollmentsListData>(`/api/admin/enrollments${qs ? `?${qs}` : ""}`);
}

export function fetchAdminEnrollmentCourses() {
  return adminFetch<{ courses: CourseEnrollmentFilterCourse[] }>("/api/admin/enrollments/courses").then(
    (d) => d.courses
  );
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

export type DelhiveryShipBox = {
  lengthCm: number;
  breadthCm: number;
  heightCm: number;
  weightGrams: number;
  packageType: "PLASTIC_COVER" | "CARDBOARD_BOX";
};

export function adminCreateShipmentForOrder(
  orderId: string,
  body?: {
    pickupLocationId?: string;
    shiprocketPickupName?: string;
    preferredCourier?: "AUTO" | "DELHIVERY" | "SHIPROCKET" | "SHIPROCKET_INTERNATIONAL";
    channel?: string;
    paymentMode?: "Pre-paid" | "COD";
    lengthCm?: number;
    breadthCm?: number;
    heightCm?: number;
    weightGrams?: number;
    packageType?: "PLASTIC_COVER" | "CARDBOARD_BOX";
    shippingMode?: "S" | "E";
    delhiveryFreightInr?: number;
    chargeableGrams?: number;
    customerShippingInPaise?: number;
    boxes?: DelhiveryShipBox[];
  }
) {
  return adminFetch<{ courier: string; waybill: string; trackingUrl: string }>(
    `/api/shipping/create-shipment/${encodeURIComponent(orderId)}`,
    { method: "POST", body: JSON.stringify(body ?? {}) }
  );
}

export function adminEstimateDelhiveryCharge(body: {
  originPin: string;
  destPin: string;
  shippingMode: "S" | "E";
  paymentMode: "Pre-paid" | "COD";
  boxes: DelhiveryShipBox[];
}) {
  return adminFetch<{ chargeableGrams: number; totalAmount: number; raw: unknown }>(
    "/api/shipping/admin/delhivery-estimate",
    { method: "POST", body: JSON.stringify(body) }
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

export function adminSaveManualAwb(
  orderId: string,
  body: {
    awb: string;
    courier: "DELHIVERY" | "SHIPROCKET" | "FEDEX" | "INDIA_POST" | "OTHER";
    trackingUrl?: string;
  }
) {
  return adminFetch<{ courier: string; waybill: string; trackingUrl: string }>(
    `/api/shipping/admin/manual-awb/${encodeURIComponent(orderId)}`,
    { method: "POST", body: JSON.stringify(body) }
  );
}

export function adminCreateReverseShipment(
  orderId: string,
  body?: {
    pickupLocationId?: string;
    channel?: string;
    reason?: string;
    shippingMode?: "S" | "E";
    weightGrams?: number;
    lengthCm?: number;
    breadthCm?: number;
    heightCm?: number;
  }
) {
  return adminFetch<{ courier: string; waybill: string; trackingUrl: string }>(
    `/api/shipping/admin/reverse-shipment/${encodeURIComponent(orderId)}`,
    { method: "POST", body: JSON.stringify(body ?? {}) }
  );
}

export function delhiveryLabelUrl(waybill: string): string {
  return `/api/shipping/admin/label/${encodeURIComponent(waybill)}`;
}

export function isDelhiveryCourier(courier: string): boolean {
  return courier.trim().toLowerCase().includes("delhivery");
}

export type AdminPickupLocationRow = {
  id: string;
  label: string;
  shiprocketPickupName: string;
  delhiveryPickupName: string | null;
  contactPerson: string | null;
  phone: string | null;
  email: string | null;
  line1: string | null;
  line2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string;
  defaultPickupSlot: string | null;
  workingDays: string[] | null;
  returnSameAsPickup: boolean;
  returnLine1: string | null;
  returnLine2: string | null;
  returnCity: string | null;
  returnState: string | null;
  returnPostalCode: string | null;
  returnCountry: string | null;
  notes: string | null;
  isPrimary: boolean;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type AdminPickupLocationInput = {
  label: string;
  shiprocketPickupName: string;
  delhiveryPickupName?: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  defaultPickupSlot?: string;
  workingDays?: string[];
  returnSameAsPickup?: boolean;
  returnLine1?: string;
  returnLine2?: string;
  returnCity?: string;
  returnState?: string;
  returnPostalCode?: string;
  returnCountry?: string;
  notes?: string;
  isPrimary?: boolean;
  sortOrder?: number;
  isActive?: boolean;
};

export function fetchAdminPickupLocations(params?: {
  activeOnly?: boolean;
  q?: string;
  status?: "active" | "inactive" | "";
}) {
  const q = new URLSearchParams();
  if (params?.activeOnly) q.set("activeOnly", "true");
  if (params?.q) q.set("q", params.q);
  if (params?.status) q.set("status", params.status);
  const qs = q.toString();
  return adminFetch<{ items: AdminPickupLocationRow[] }>(
    `/api/admin/pickup-locations${qs ? `?${qs}` : ""}`
  ).then((d) => d.items);
}

export function fetchAdminPickupLocation(id: string) {
  return adminFetch<{ item: AdminPickupLocationRow }>(`/api/admin/pickup-locations/${id}`).then(
    (d) => d.item
  );
}

export function postAdminPickupLocation(body: AdminPickupLocationInput) {
  return adminFetch<{ item: AdminPickupLocationRow }>("/api/admin/pickup-locations", {
    method: "POST",
    body: JSON.stringify(body)
  }).then((d) => d.item);
}

export function patchAdminPickupLocation(id: string, body: Partial<AdminPickupLocationInput>) {
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
  return adminFetch<{ pdfUrl: string | null; invoiceNo: string | null; downloadUrl: string | null }>(
    `/api/admin/orders/${id}/invoice`,
    { signal }
  );
}

export function adminOrderInvoiceDownloadUrl(orderId: string): string {
  return `/api/admin/orders/${encodeURIComponent(orderId)}/invoice/download`;
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

/** Persist drag-reorder: global sortOrder when category is null/empty, else category position. */
export function reorderAdminProducts(body: {
  categorySlug: string | null;
  orderedIds: string[];
}) {
  return adminFetch<{ mode: string; count: number; categoryId?: string }>(
    "/api/admin/products/reorder",
    {
      method: "PUT",
      body: JSON.stringify(body)
    }
  );
}

export function fetchAdminProduct(id: string, signal?: AbortSignal) {
  return adminFetch<{ product: Record<string, unknown> }>(`/api/admin/products/${id}`, {
    signal
  }).then((d) => d.product);
}

/** Which of the given SKUs already exist (optionally excluding one product's variants). */
export function checkAdminSkus(
  skus: string[],
  opts?: { excludeProductId?: string; signal?: AbortSignal }
) {
  return adminFetch<{ taken: string[] }>("/api/admin/products/check-skus", {
    method: "POST",
    body: JSON.stringify({
      skus,
      excludeProductId: opts?.excludeProductId
    }),
    signal: opts?.signal
  });
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

/** Website-catalog style editable sheet (Name / Variant / SKU / Qty / Cost / prices / HSN). */
export type XlSheetRow = {
  productId: string;
  variantId: string;
  productName: string;
  variantName: string;
  sku: string;
  qty: number;
  costInPaise: number | null;
  mrpInPaise: number;
  saleInPaise: number;
  mrpUsdCents: number | null;
  saleUsdCents: number | null;
  mrpAedFils: number | null;
  saleAedFils: number | null;
  mrpGbpPence: number | null;
  saleGbpPence: number | null;
  hsnCode: string;
  productStatus: string;
  variantStatus: string;
};

export function fetchProductsXlSheet(signal?: AbortSignal) {
  return adminFetch<{ rows: XlSheetRow[]; total: number }>(`/api/admin/products/xl-sheet`, {
    signal
  });
}

export function saveProductsXlSheet(
  rows: Array<{
    productId: string;
    variantId: string;
    productName: string;
    variantName: string;
    sku: string;
    qty: number;
    costInPaise?: number | null;
    mrpInPaise: number;
    saleInPaise: number;
    mrpUsdCents?: number | null;
    saleUsdCents?: number | null;
    mrpAedFils?: number | null;
    saleAedFils?: number | null;
    mrpGbpPence?: number | null;
    saleGbpPence?: number | null;
    hsnCode?: string | null;
  }>
) {
  return adminFetch<{
    updatedProducts: number;
    updatedVariants: number;
    errors: Array<{ variantId: string; sku: string; error: string }>;
  }>(`/api/admin/products/xl-sheet`, {
    method: "PUT",
    body: JSON.stringify({ rows })
  });
}

export type InventoryCategoryRef = {
  slug: string;
  name: string;
  position: number;
};

export type ZohoSyncScenario = 1 | 2 | 3 | 4;

export type ZohoOnlyItem = {
  sku: string;
  itemId: string;
  name: string;
  stockOnHand: number;
};

export type ZohoSyncSummary = {
  synced: number;
  countMismatch: number;
  zohoOnly: number;
  sarvedaOnly: number;
  outOfSync: number;
};

export type InventoryRow = {
  inventoryId: string;
  variantId: string;
  sku: string;
  productId: string;
  productName: string;
  productSlug: string;
  productStatus: string;
  catalogHidden?: boolean;
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
  zohoStockOnHand: number | null;
  zohoSyncScenario: ZohoSyncScenario | null;
  recentMarketplaceSoldQty: number;
  recentMarketplaceReturnQty: number;
  marketplaceStockRisk: "ok" | "watch" | "high" | "out";
  marketplaceListings: Array<{
    id: string;
    channelId: string;
    code: "AMAZON" | "FLIPKART" | "ETSY" | "AMALA" | "FIRSTCRY" | "TATA_1MG" | "SARVEDA";
    displayName: string;
    isChannelActive: boolean;
    listingId: string | null;
    externalSku: string | null;
    sellerSku: string | null;
    status: "ACTIVE" | "PAUSED" | "DELISTED";
    isTracked: boolean;
    notes: string | null;
    lastSyncedAt: string | null;
  }>;
};

export type InventoryListData = {
  items: InventoryRow[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
  meta: {
    lastZohoStockSyncAt: string | null;
    zohoSkuAuditAvailable: boolean;
    productCount: number;
    zohoSyncSummary: ZohoSyncSummary;
    zohoOnlyItems: ZohoOnlyItem[];
  };
};

export type ZohoStockSyncHistoryEntry = {
  id: string;
  at: string;
  scope: "full" | "product" | "unmatched" | "audit" | "pull" | "push" | "push_items" | "inactive";
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

export type MarketplaceChannelCode =
  | "AMAZON"
  | "FLIPKART"
  | "ETSY"
  | "AMALA"
  | "FIRSTCRY"
  | "TATA_1MG"
  | "SARVEDA";

export type MarketplaceListingStatus = "ACTIVE" | "PAUSED" | "DELISTED";
export type MarketplaceOrderStatus =
  | "RECEIVED"
  | "CONFIRMED"
  | "DISPATCHED"
  | "DELIVERED"
  | "CANCELLED"
  | "RETURN_REQUESTED"
  | "RETURNED"
  | "REFUNDED";
export type MarketplaceReturnStatus = "REQUESTED" | "RECEIVED" | "REFUNDED" | "REJECTED";
export type MarketplaceDataSource = "MANUAL" | "CSV_IMPORT" | "EMAIL" | "API";

export type MarketplaceOverviewData = {
  channels: Array<{
    id: string;
    code: MarketplaceChannelCode;
    displayName: string;
    isActive: boolean;
    listingCount: number;
    activeListingCount: number;
    orderCount: number;
    dispatchPending: number;
    highRiskCount: number;
  }>;
  totals: {
    channels: number;
    listings: number;
    orders: number;
    returns: number;
  };
  recentOrders: MarketplaceOrderRow[];
  recentReturns: MarketplaceReturnRow[];
};

export type MarketplaceListingRow = {
  id: string;
  channel: {
    id: string;
    code: MarketplaceChannelCode;
    displayName: string;
    isActive: boolean;
  };
  variant: {
    id: string;
    sku: string;
    variantName: string;
    productId: string;
    productName: string;
    productSlug: string;
  };
  listingId: string | null;
  externalSku: string | null;
  sellerSku: string | null;
  status: MarketplaceListingStatus;
  isTracked: boolean;
  notes: string | null;
  lastSyncedAt: string | null;
  zohoOnHand: number;
  zohoReserved: number;
  available: number;
  priceInPaise: number | null;
  currency: string;
  recentSoldQty: number;
  recentReturnQty: number;
  stockRisk: "ok" | "watch" | "high" | "out";
  updatedAt: string;
};

export type MarketplaceOrderRow = {
  id: string;
  channel: { id: string; code: MarketplaceChannelCode; displayName: string };
  externalOrderId: string;
  orderDate: string;
  customerName: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  shipToCity: string | null;
  shipToState: string | null;
  shipToCountry: string | null;
  shipToPostalCode: string | null;
  status: MarketplaceOrderStatus;
  source: MarketplaceDataSource;
  notes: string | null;
  currency: string;
  rawPayload?: Record<string, unknown> | null;
  items: Array<{
    id: string;
    skuSnapshot: string;
    productNameSnapshot: string | null;
    variantName: string | null;
    quantity: number;
    unitPriceInPaise: number | null;
    lineTotalInPaise: number | null;
    variantId: string | null;
    variantSku: string | null;
    productName: string | null;
  }>;
  returns: Array<{
    id: string;
    quantity: number;
    status: MarketplaceReturnStatus;
    refundedAmountInPaise: number | null;
    restockedToZoho: boolean;
    createdAt: string;
  }>;
  totalItems: number;
  totalValueInPaise: number;
  createdAt: string;
  updatedAt: string;
};

export type MarketplaceReturnRow = {
  id: string;
  marketplaceOrderId: string;
  marketplaceOrderItemId: string | null;
  channel: { id: string; code: MarketplaceChannelCode; displayName: string };
  externalOrderId: string;
  sku: string | null;
  productName: string | null;
  variantName: string | null;
  quantity: number;
  reason: string | null;
  status: MarketplaceReturnStatus;
  receivedAt: string | null;
  returnDate: string;
  refundedAmountInPaise: number | null;
  currency: string;
  restockedToZoho: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type MarketplaceAnalyticsData = {
  totals: {
    orders: number;
    returns: number;
    unitsSold: number;
    refundValueInPaise: number;
  };
  byChannel: Array<{
    channelId: string;
    code: MarketplaceChannelCode;
    displayName: string;
    orders: number;
    unitsSold: number;
    orderValueInPaise: number;
    returns: number;
    returnQty: number;
    refundValueInPaise: number;
    pendingDispatch: number;
  }>;
  topSkus: Array<{
    sku: string;
    productName: string | null;
    unitsSold: number;
    orderValueInPaise: number;
  }>;
};

export type MarketplaceInboxEvent = {
  id: string;
  channel: { id: string; code: MarketplaceChannelCode; displayName: string };
  eventType: string;
  source: MarketplaceDataSource;
  dedupeKey: string | null;
  processedAt: string | null;
  createdAt: string;
  rawPayload: unknown;
};

export function fetchMarketplaceOverview() {
  return adminFetch<MarketplaceOverviewData>("/api/admin/marketplaces/overview");
}

export function fetchMarketplaceListings(params?: {
  channelCode?: MarketplaceChannelCode;
  status?: MarketplaceListingStatus;
  search?: string;
}) {
  const q = new URLSearchParams();
  if (params?.channelCode) q.set("channelCode", params.channelCode);
  if (params?.status) q.set("status", params.status);
  if (params?.search) q.set("search", params.search);
  const qs = q.toString();
  return adminFetch<{ items: MarketplaceListingRow[] }>(
    `/api/admin/marketplaces/listings${qs ? `?${qs}` : ""}`
  );
}

export function upsertMarketplaceListing(input: {
  channelCode: MarketplaceChannelCode;
  variantId?: string;
  sku?: string;
  listingId?: string | null;
  externalSku?: string | null;
  sellerSku?: string | null;
  status?: MarketplaceListingStatus;
  isTracked?: boolean;
  notes?: string | null;
}) {
  return adminFetch<MarketplaceListingRow>("/api/admin/marketplaces/listings", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function patchMarketplaceListing(
  listingId: string,
  input: {
    listingId?: string | null;
    externalSku?: string | null;
    sellerSku?: string | null;
    status?: MarketplaceListingStatus;
    isTracked?: boolean;
    notes?: string | null;
  }
) {
  return adminFetch<MarketplaceListingRow>(`/api/admin/marketplaces/listings/${encodeURIComponent(listingId)}`, {
    method: "PATCH",
    body: JSON.stringify(input)
  });
}

export function fetchMarketplaceOrders(params?: {
  channelCode?: MarketplaceChannelCode;
  status?: MarketplaceOrderStatus;
  search?: string;
  from?: string;
  to?: string;
}) {
  const q = new URLSearchParams();
  if (params?.channelCode) q.set("channelCode", params.channelCode);
  if (params?.status) q.set("status", params.status);
  if (params?.search) q.set("search", params.search);
  if (params?.from) q.set("from", params.from);
  if (params?.to) q.set("to", params.to);
  const qs = q.toString();
  return adminFetch<{ items: MarketplaceOrderRow[] }>(`/api/admin/marketplaces/orders${qs ? `?${qs}` : ""}`);
}

export function createMarketplaceOrder(input: {
  channelCode: MarketplaceChannelCode;
  externalOrderId: string;
  orderDate: string;
  customerName?: string | null;
  customerEmail?: string | null;
  customerPhone?: string | null;
  shipToCity?: string | null;
  shipToState?: string | null;
  shipToCountry?: string | null;
  shipToPostalCode?: string | null;
  status?: MarketplaceOrderStatus;
  source?: MarketplaceDataSource;
  notes?: string | null;
  rawPayload?: Record<string, unknown> | null;
  items: Array<{
    sku: string;
    quantity: number;
    unitPriceInPaise?: number | null;
    productName?: string | null;
  }>;
}) {
  return adminFetch<MarketplaceOrderRow>("/api/admin/marketplaces/orders", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function importMarketplaceOrdersCsv(input: { channelCode: MarketplaceChannelCode; csvText: string }) {
  return adminFetch<{
    parsedRows: number;
    importedOrders: number;
    duplicateOrders: number;
    unresolvedItems: number;
  }>("/api/admin/marketplaces/orders/import", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function fetchMarketplaceReturns(params?: {
  channelCode?: MarketplaceChannelCode;
  status?: MarketplaceReturnStatus;
  search?: string;
  from?: string;
  to?: string;
}) {
  const q = new URLSearchParams();
  if (params?.channelCode) q.set("channelCode", params.channelCode);
  if (params?.status) q.set("status", params.status);
  if (params?.search) q.set("search", params.search);
  if (params?.from) q.set("from", params.from);
  if (params?.to) q.set("to", params.to);
  const qs = q.toString();
  return adminFetch<{ items: MarketplaceReturnRow[] }>(`/api/admin/marketplaces/returns${qs ? `?${qs}` : ""}`);
}

export function createMarketplaceReturn(input: {
  marketplaceOrderId: string;
  marketplaceOrderItemId?: string | null;
  quantity: number;
  reason?: string | null;
  status?: MarketplaceReturnStatus;
  receivedAt?: string | null;
  refundedAmountInPaise?: number | null;
  restockedToZoho?: boolean;
  notes?: string | null;
  rawPayload?: Record<string, unknown> | null;
}) {
  return adminFetch<MarketplaceReturnRow>("/api/admin/marketplaces/returns", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function fetchMarketplaceAnalytics(params?: {
  channelCode?: MarketplaceChannelCode;
  from?: string;
  to?: string;
}) {
  const q = new URLSearchParams();
  if (params?.channelCode) q.set("channelCode", params.channelCode);
  if (params?.from) q.set("from", params.from);
  if (params?.to) q.set("to", params.to);
  const qs = q.toString();
  return adminFetch<MarketplaceAnalyticsData>(
    `/api/admin/marketplaces/analytics${qs ? `?${qs}` : ""}`
  );
}

export function fetchMarketplaceInbox(params?: { channelCode?: MarketplaceChannelCode; limit?: number }) {
  const q = new URLSearchParams();
  if (params?.channelCode) q.set("channelCode", params.channelCode);
  if (params?.limit) q.set("limit", String(params.limit));
  const qs = q.toString();
  return adminFetch<{ items: MarketplaceInboxEvent[] }>(
    `/api/admin/marketplaces/inbox${qs ? `?${qs}` : ""}`
  );
}

export function createMarketplaceEmailIngest(input: {
  channelCode: MarketplaceChannelCode;
  subject: string;
  bodyText: string;
  dedupeKey?: string | null;
  metadata?: Record<string, unknown> | null;
}) {
  return adminFetch<{
    id: string;
    channelCode: MarketplaceChannelCode;
    eventType: string;
    source: MarketplaceDataSource;
    dedupeKey: string | null;
    processedAt: string | null;
    createdAt: string;
  }>("/api/admin/marketplaces/email-ingest", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export type AmazonSpConnectionStatus = {
  configured: boolean;
  marketplaceId: string;
  region: string;
  autoSyncEnabled: boolean;
  syncRunning?: boolean;
  missing: string[];
};

export type AmazonOrdersSyncResult = {
  configured: boolean;
  createdAfter: string;
  createdBefore?: string | null;
  orderStatuses: string[] | null;
  fetched: number;
  created: number;
  updated: number;
  unresolvedItems: number;
  errors: number;
  messages: string[];
  monthsProcessed?: number;
};

export type AmazonSyncAllResult = {
  started?: boolean;
  message?: string;
  monthsBack?: number;
  maxPagesPerMonth?: number;
  orders?: AmazonOrdersSyncResult;
  listings?: {
    rows: number;
    created: number;
    updated: number;
    unresolved: number;
  };
  returns?: {
    rows: number;
    created: number;
    updated: number;
    unresolved: number;
  };
};

export function fetchAmazonSpConnection() {
  return adminFetch<AmazonSpConnectionStatus>("/api/admin/marketplaces/amazon/connection");
}

export function syncAmazonMarketplaceOrders(input?: {
  daysBack?: number;
  createdAfter?: string;
  createdBefore?: string;
  orderStatuses?: string[];
  includeShipped?: boolean;
  maxPages?: number;
}) {
  return adminFetch<AmazonOrdersSyncResult>("/api/admin/marketplaces/amazon/sync-orders", {
    method: "POST",
    body: JSON.stringify(input ?? {})
  });
}

export function syncAmazonMarketplaceAll(input?: {
  daysBack?: number;
  monthsBack?: number;
  createdAfter?: string;
  createdBefore?: string;
  orderStatuses?: string[];
  includeShipped?: boolean;
  maxPages?: number;
  maxPagesPerMonth?: number;
}) {
  return adminFetch<AmazonSyncAllResult>("/api/admin/marketplaces/amazon/sync-all", {
    method: "POST",
    body: JSON.stringify(input ?? {})
  });
}

// --- Flipkart ---

export type FlipkartConnectionStatus = {
  configured: boolean;
  autoSyncEnabled: boolean;
  missing: string[];
};

export function fetchFlipkartConnection() {
  return adminFetch<FlipkartConnectionStatus>("/api/admin/marketplaces/flipkart/connection");
}

export function syncFlipkartMarketplaceAll(input?: { daysBack?: number; maxPages?: number }) {
  return adminFetch<{ orders: unknown; returns: unknown }>("/api/admin/marketplaces/flipkart/sync-all", {
    method: "POST",
    body: JSON.stringify(input ?? {}),
  });
}

export type EtsyConnectionStatus = {
  configured: boolean;
  shopId: string;
  autoSyncEnabled: boolean;
  syncRunning?: boolean;
  missing: string[];
};

export function fetchEtsyConnection() {
  return adminFetch<EtsyConnectionStatus>("/api/admin/marketplaces/etsy/connection");
}

export function syncEtsyMarketplaceAll(input?: { monthsBack?: number; maxPagesPerMonth?: number }) {
  return adminFetch<{
    started: boolean;
    message: string;
    monthsBack?: number;
    maxPagesPerMonth?: number;
  }>("/api/admin/marketplaces/etsy/sync-all", {
    method: "POST",
    body: JSON.stringify(input ?? {})
  });
}

export type ZohoStockSyncResult = {
  synced: number;
  errors: number;
  skipped: number;
};

export type ZohoActionResult = {
  ok: number;
  errors: number;
  messages: string[];
};

export function refreshZohoAuditAdmin() {
  return adminFetch<{ zohoSkuCount: number; sarvedaSkuCount: number; summary: ZohoSyncSummary }>(
    "/api/zoho/sync/audit",
    { method: "POST", body: JSON.stringify({}) }
  );
}

export function pullStockFromZohoAdmin(skus: string[]) {
  return adminFetch<ZohoActionResult>("/api/zoho/sync/pull-stock", {
    method: "POST",
    body: JSON.stringify({ skus })
  });
}

export function pushStockToZohoAdmin(skus: string[]) {
  return adminFetch<ZohoActionResult>("/api/zoho/sync/push-stock", {
    method: "POST",
    body: JSON.stringify({ skus })
  });
}

export function pushItemsToZohoAdmin(variantIds: string[]) {
  return adminFetch<ZohoActionResult>("/api/zoho/sync/push-items", {
    method: "POST",
    body: JSON.stringify({ variantIds })
  });
}

export function ignoreZohoItemsAdmin(skus: string[]) {
  return adminFetch<ZohoActionResult>("/api/zoho/sync/ignore-zoho", {
    method: "POST",
    body: JSON.stringify({ skus })
  });
}

export function syncStockFromZohoAdmin(opts?: {
  productId?: string;
  productName?: string;
  unmatchedOnly?: boolean;
  /** Set false to actually overwrite Sarveda stock from Zoho (Zoho is master). */
  auditOnly?: boolean;
}) {
  return adminFetch<ZohoStockSyncResult & { summary?: ZohoSyncSummary }>("/api/zoho/sync/stock", {
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

export type EnquiryThreadListItem = {
  id: string;
  source: string;
  subjectCategory: string | null;
  customSubject: string | null;
  customerName: string;
  customerEmail: string;
  customerPhone: string | null;
  waPhone?: string | null;
  orderNumber: string | null;
  contextTitle: string | null;
  status: string;
  unreadByAdmin: boolean;
  lastMessageAt: string;
  createdAt: string;
  messages: Array<{ body: string; authorType: string; createdAt: string }>;
};

export type EnquiryAttachmentRow = {
  id: string;
  fileName: string;
  mimeType: string;
  s3Url: string;
  fileSizeBytes: number | null;
};

export type EnquiryMessageRow = {
  id: string;
  authorType: "CUSTOMER" | "ADMIN";
  authorName: string;
  authorEmail: string;
  body: string;
  createdAt: string;
  attachments: EnquiryAttachmentRow[];
  adminUser?: { id: string; name: string | null; email: string } | null;
  /** WhatsApp delivery status for outbound messages: sent | delivered | read | failed. */
  waStatus?: string | null;
};

export type EnquiryThreadDetail = Omit<EnquiryThreadListItem, "messages"> & {
  contextUrl: string | null;
  /** WhatsApp threads: customer number in E.164. */
  waPhone?: string | null;
  /** Last inbound customer message — WhatsApp replies allowed within 24h of this. */
  lastCustomerMessageAt?: string | null;
  messages: EnquiryMessageRow[];
};

export function fetchEnquiryUnreadCount() {
  return adminFetch<{ count: number }>("/api/admin/enquiries/unread-count").then((d) => d.count);
}

export function fetchAdminEnquiries(params?: {
  page?: number;
  limit?: number;
  unreadOnly?: boolean;
  source?: string;
  q?: string;
}) {
  const q = new URLSearchParams();
  if (params?.page) q.set("page", String(params.page));
  if (params?.limit) q.set("limit", String(params.limit));
  if (params?.unreadOnly) q.set("unreadOnly", "true");
  if (params?.source) q.set("source", params.source);
  if (params?.q?.trim()) q.set("q", params.q.trim());
  const qs = q.toString();
  return adminFetch<{
    items: EnquiryThreadListItem[];
    total: number;
    page: number;
    limit: number;
    unreadCount: number;
  }>(`/api/admin/enquiries${qs ? `?${qs}` : ""}`);
}

export function fetchAdminEnquiryThread(id: string) {
  return adminFetch<EnquiryThreadDetail>(`/api/admin/enquiries/${encodeURIComponent(id)}`);
}

export function getAdminEnquiryStreamUrl(id: string) {
  const q = new URLSearchParams({ threadId: id });
  return `${getApiBase()}/api/admin/enquiries/stream?${q.toString()}`;
}

export function setAdminEnquiryTyping(id: string, typing: boolean) {
  return adminFetch<unknown>(`/api/admin/enquiries/${encodeURIComponent(id)}/typing`, {
    method: "POST",
    body: JSON.stringify({ typing })
  });
}

export async function replyAdminEnquiryThread(
  id: string,
  message: string,
  attachments?: File[]
) {
  const form = new FormData();
  form.append("message", message);
  for (const file of attachments ?? []) {
    form.append("attachments", file);
  }
  const url = `${getApiBase()}/api/admin/enquiries/${encodeURIComponent(id)}/reply`;
  const res = await fetch(url, { method: "POST", credentials: "include", body: form });
  const json = (await res.json()) as { success?: boolean; data?: EnquiryMessageRow; error?: string };
  if (!res.ok || !json.success || !json.data) {
    throw new AdminApiError(json.error || `Reply failed (${res.status})`);
  }
  return json.data;
}

export function patchAdminEnquiryStatus(id: string, status: "OPEN" | "CLOSED") {
  return adminFetch<EnquiryThreadDetail>(`/api/admin/enquiries/${encodeURIComponent(id)}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status })
  });
}

export type StartWhatsAppChatResult = {
  threadId: string;
  created: boolean;
  waPhone: string;
  sessionWindowOpen: boolean;
  messageSent: boolean;
  outreachSent: boolean;
  warning: string | null;
};

export function startAdminWhatsAppChat(input: {
  countryDialCode: string;
  phone: string;
  customerName?: string;
  message: string;
}) {
  return adminFetch<StartWhatsAppChatResult>("/api/admin/enquiries/whatsapp/start", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

