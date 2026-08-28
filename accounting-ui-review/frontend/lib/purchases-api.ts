import { getApiBase } from "@/lib/api";
import { AdminApiError } from "@/lib/admin-errors";

async function purchasesFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${getApiBase()}${path.startsWith("/") ? path : `/${path}`}`;
  const res = await fetch(url, {
    ...init,
    credentials: "include",
    headers: { Accept: "application/json", "Content-Type": "application/json", ...init?.headers }
  });
  const json = (await res.json()) as { success?: boolean; data?: T; error?: string; code?: string };
  if (!res.ok || json.success === false) {
    throw new AdminApiError(json.error?.trim() || `Request failed (${res.status})`, { status: res.status, code: json.code });
  }
  if (json.data === undefined) throw new AdminApiError("Empty response");
  return json.data;
}

export type Pagination = { page: number; limit: number; total: number; totalPages: number };

export type VendorRow = {
  id: string;
  name: string;
  displayName: string | null;
  email: string | null;
  phone: string | null;
  gstin: string | null;
  pan: string | null;
  paymentTerms: string | null;
  currency: string;
  billingLine1: string | null;
  billingLine2: string | null;
  billingCity: string | null;
  billingState: string | null;
  billingPostalCode: string | null;
  billingCountry: string;
  shippingLine1: string | null;
  shippingLine2: string | null;
  shippingCity: string | null;
  shippingState: string | null;
  shippingPostalCode: string | null;
  shippingCountry: string;
  notes: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type PoLine = {
  id: string;
  variantId: string | null;
  itemName: string;
  sku: string | null;
  hsnCode: string | null;
  quantity: number;
  receivedQty: number;
  rateInPaise: number;
  taxClass: string | null;
  taxInPaise: number;
  lineTotalInPaise: number;
  sortOrder: number;
};

export type PurchaseOrderRow = {
  id: string;
  poNumber: string;
  vendorId: string;
  status: "DRAFT" | "SENT" | "PARTIALLY_RECEIVED" | "RECEIVED" | "CANCELLED";
  referenceNumber: string | null;
  orderDate: string;
  expectedDeliveryDate: string | null;
  paymentTerms: string | null;
  shipmentPreference: string | null;
  reverseCharge: boolean;
  pickupLocationId: string | null;
  taxTreatment: string | null;
  notes: string | null;
  termsAndConditions: string | null;
  subtotalInPaise: number;
  discountPercent: number;
  discountInPaise: number;
  adjustmentInPaise: number;
  totalInPaise: number;
  vendor?: { id: string; name: string; email?: string | null; phone?: string | null; gstin?: string | null };
  pickupLocation?: { id: string; label: string } | null;
  lines?: PoLine[];
};

export type BillRow = {
  id: string;
  billNumber: string;
  vendorId: string;
  purchaseOrderId: string | null;
  status: "DRAFT" | "OPEN" | "PAID" | "VOID";
  referenceNumber: string | null;
  billDate: string;
  dueDate: string | null;
  paymentTerms: string | null;
  subject: string | null;
  notes: string | null;
  subtotalInPaise: number;
  totalInPaise: number;
  paidInPaise: number;
  vendor?: { id: string; name: string };
  purchaseOrder?: { id: string; poNumber: string } | null;
  lines?: Array<Omit<PoLine, "receivedQty" | "hsnCode"> & { hsnCode?: string | null }>;
};

export type ExpenseRow = {
  id: string;
  expenseAccount: string;
  vendorId: string | null;
  amountInPaise: number;
  currency: string;
  expenseDate: string;
  paidThrough: string | null;
  expenseType: string;
  invoiceNumber: string | null;
  referenceNumber: string | null;
  notes: string | null;
  status: "DRAFT" | "RECORDED";
  vendor?: { id: string; name: string } | null;
};

export type CatalogSearchItem = {
  variantId: string;
  sku: string;
  itemName: string;
  hsnCode: string | null;
  taxClass: string | null;
  rateInPaise: number;
};

export type LineDraft = {
  variantId?: string | null;
  itemName: string;
  sku?: string | null;
  hsnCode?: string | null;
  quantity: number;
  rateInPaise: number;
  taxClass?: string | null;
};

export function formatInrPaise(paise: number): string {
  return `₹${(paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function isPurchasesEnabled(): boolean {
  return process.env.NEXT_PUBLIC_PURCHASES_ENABLED === "1" || process.env.NEXT_PUBLIC_PURCHASES_ENABLED === "true";
}

export async function fetchPurchasesVendors(params?: { q?: string; page?: number; activeOnly?: boolean }) {
  const sp = new URLSearchParams();
  if (params?.q) sp.set("q", params.q);
  if (params?.page) sp.set("page", String(params.page));
  if (params?.activeOnly) sp.set("activeOnly", "1");
  return purchasesFetch<{ items: VendorRow[]; pagination: Pagination }>(`/api/admin/purchases/vendors?${sp}`);
}

export async function postPurchasesVendor(body: Partial<VendorRow> & { name: string }) {
  return purchasesFetch<{ item: VendorRow }>("/api/admin/purchases/vendors", { method: "POST", body: JSON.stringify(body) });
}

export async function patchPurchasesVendor(id: string, body: Partial<VendorRow>) {
  return purchasesFetch<{ item: VendorRow }>(`/api/admin/purchases/vendors/${id}`, { method: "PATCH", body: JSON.stringify(body) });
}

export async function fetchPurchaseOrders(params?: { q?: string; page?: number; status?: string }) {
  const sp = new URLSearchParams();
  if (params?.q) sp.set("q", params.q);
  if (params?.page) sp.set("page", String(params.page));
  if (params?.status) sp.set("status", params.status);
  return purchasesFetch<{ items: PurchaseOrderRow[]; pagination: Pagination }>(`/api/admin/purchases/purchase-orders?${sp}`);
}

export async function fetchPurchaseOrder(id: string) {
  return purchasesFetch<{ item: PurchaseOrderRow }>(`/api/admin/purchases/purchase-orders/${id}`);
}

export async function postPurchaseOrder(body: Record<string, unknown>) {
  return purchasesFetch<{ item: PurchaseOrderRow }>("/api/admin/purchases/purchase-orders", { method: "POST", body: JSON.stringify(body) });
}

export async function patchPurchaseOrder(id: string, body: Record<string, unknown>) {
  return purchasesFetch<{ item: PurchaseOrderRow }>(`/api/admin/purchases/purchase-orders/${id}`, { method: "PATCH", body: JSON.stringify(body) });
}

export async function receivePurchaseOrder(id: string, body: { notes?: string; lines: Array<{ poLineId: string; quantityReceived: number }> }) {
  return purchasesFetch<{ item: PurchaseOrderRow; poStatus: string; receiptId: string }>(
    `/api/admin/purchases/purchase-orders/${id}/receive`,
    { method: "POST", body: JSON.stringify(body) }
  );
}

export async function fetchBills(params?: { q?: string; page?: number; status?: string }) {
  const sp = new URLSearchParams();
  if (params?.q) sp.set("q", params.q);
  if (params?.page) sp.set("page", String(params.page));
  if (params?.status) sp.set("status", params.status);
  return purchasesFetch<{ items: BillRow[]; pagination: Pagination; summary: { outstandingInPaise: number; overdueInPaise: number } }>(
    `/api/admin/purchases/bills?${sp}`
  );
}

export async function postBill(body: Record<string, unknown>) {
  return purchasesFetch<{ item: BillRow }>("/api/admin/purchases/bills", { method: "POST", body: JSON.stringify(body) });
}

export async function patchBill(id: string, body: Record<string, unknown>) {
  return purchasesFetch<{ item: BillRow }>(`/api/admin/purchases/bills/${id}`, { method: "PATCH", body: JSON.stringify(body) });
}

export async function fetchExpenses(params?: { q?: string; page?: number }) {
  const sp = new URLSearchParams();
  if (params?.q) sp.set("q", params.q);
  if (params?.page) sp.set("page", String(params.page));
  return purchasesFetch<{ items: ExpenseRow[]; pagination: Pagination }>(`/api/admin/purchases/expenses?${sp}`);
}

export async function postExpense(body: Record<string, unknown>) {
  return purchasesFetch<{ item: ExpenseRow }>("/api/admin/purchases/expenses", { method: "POST", body: JSON.stringify(body) });
}

export async function searchPurchasesCatalog(q: string) {
  return purchasesFetch<{ items: CatalogSearchItem[] }>(`/api/admin/purchases/catalog-search?q=${encodeURIComponent(q)}`);
}
