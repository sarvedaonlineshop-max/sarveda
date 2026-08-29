import { getApiBase } from "./api";

async function accountingFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${getApiBase()}/api/admin/accounting${path}`, {
    credentials: "include",
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    }
  });
  const json = (await res.json()) as {
    success?: boolean;
    data?: T;
    error?: string;
    message?: string;
  };
  if (!res.ok || !json.success) {
    throw new Error(json.error || "Request failed");
  }
  return json.data as T;
}

export type QuoteAddress = {
  fullName: string;
  phone?: string | null;
  line1: string;
  line2?: string | null;
  city: string;
  state: string;
  postalCode: string;
  country: string;
};

export type QuoteLineDraft = {
  productId?: string | null;
  variantId?: string | null;
  productName: string;
  sku?: string | null;
  hsnCode?: string | null;
  quantity: number;
  unitPriceInPaise: number;
  discountInPaise?: number;
  taxClass?: string | null;
};

export type QuoteUpsertBody = {
  customerId?: string | null;
  customerName: string;
  email?: string | null;
  phone?: string | null;
  buyerGstin?: string | null;
  billingAddress: QuoteAddress;
  shippingAddress: QuoteAddress;
  shippingSameAsBilling?: boolean;
  currency?: string;
  shippingInPaise?: number;
  discountInPaise?: number;
  validUntil?: string | null;
  terms?: string | null;
  notes?: string | null;
  lines: QuoteLineDraft[];
};

export type QuotationRow = {
  id: string;
  quoteNumber: string;
  status: string;
  customerName: string;
  email: string | null;
  phone: string | null;
  grandTotalInPaise: number;
  currency: string;
  validUntil: string | null;
  createdAt: string;
  proformaIssuedAt?: string | null;
  expiry?: { label: string | null; derivedExpired: boolean };
};

export type QuotationDetail = QuotationRow & {
  buyerGstin: string | null;
  billingAddress: QuoteAddress;
  shippingAddress: QuoteAddress;
  subtotalInPaise: number;
  discountInPaise: number;
  shippingInPaise: number;
  taxInPaise: number;
  cgstInPaise: number;
  sgstInPaise: number;
  igstInPaise: number;
  taxPreviewMode: string | null;
  terms: string | null;
  notes: string | null;
  sentAt: string | null;
  acceptedAt: string | null;
  cancelledAt: string | null;
  items: Array<{
    id: string;
    productName: string;
    sku: string | null;
    hsnCode: string | null;
    quantity: number;
    unitPriceInPaise: number;
    discountInPaise: number;
    taxClass: string | null;
    taxRatePercent: number;
    taxableInPaise: number;
    taxInPaise: number;
    lineTotalInPaise: number;
  }>;
};

export function formatQuoteMoney(paise: number, currency = "INR") {
  const n = paise / 100;
  if (currency === "INR") return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
  return `${currency} ${n.toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
}

export async function listQuotations(params: {
  status?: string;
  q?: string;
  page?: number;
  pageSize?: number;
}) {
  const sp = new URLSearchParams();
  if (params.status) sp.set("status", params.status);
  if (params.q) sp.set("q", params.q);
  if (params.page) sp.set("page", String(params.page));
  if (params.pageSize) sp.set("pageSize", String(params.pageSize));
  return accountingFetch<{
    total: number;
    page: number;
    pageSize: number;
    items: QuotationRow[];
  }>(`/quotes?${sp.toString()}`);
}

export async function fetchQuotation(id: string) {
  return accountingFetch<{
    quotation: QuotationDetail;
    expiry: { label: string | null };
    convertToOrder: { available: boolean; reason: string };
  }>(`/quotes/${id}`);
}

export async function createQuotation(body: QuoteUpsertBody) {
  return accountingFetch<{ quotation: QuotationDetail }>("/quotes", {
    method: "POST",
    body: JSON.stringify(body)
  });
}

export async function updateQuotation(id: string, body: QuoteUpsertBody, returnToDraft = false) {
  const q = returnToDraft ? "?returnToDraft=1" : "";
  return accountingFetch<{ quotation: QuotationDetail }>(`/quotes/${id}${q}`, {
    method: "PUT",
    body: JSON.stringify(body)
  });
}

export async function markQuotationSent(id: string) {
  return accountingFetch<{ quotation: QuotationDetail }>(`/quotes/${id}/mark-sent`, {
    method: "POST",
    body: "{}"
  });
}

export async function markQuotationAccepted(id: string) {
  return accountingFetch<{ quotation: QuotationDetail }>(`/quotes/${id}/mark-accepted`, {
    method: "POST",
    body: "{}"
  });
}

export async function cancelQuotation(id: string) {
  return accountingFetch<{ quotation: QuotationDetail }>(`/quotes/${id}/cancel`, {
    method: "POST",
    body: "{}"
  });
}

export async function searchQuoteCatalog(q: string) {
  return accountingFetch<{
    items: Array<{
      variantId: string;
      productId: string;
      itemName: string;
      sku: string;
      hsnCode: string | null;
      taxClass: string | null;
      rateInPaise: number;
    }>;
  }>(`/quotes/catalog?q=${encodeURIComponent(q)}`);
}

export async function searchQuoteCustomers(q: string) {
  return accountingFetch<{
    items: Array<{
      id: string;
      name: string | null;
      email: string;
      phone: string | null;
      defaultAddress: {
        fullName: string;
        phone: string;
        line1: string;
        line2: string | null;
        city: string;
        state: string;
        postalCode: string;
        country: string;
      } | null;
    }>;
  }>(`/quotes/customers?q=${encodeURIComponent(q)}`);
}

export function quotationPdfUrl(id: string) {
  return `${getApiBase()}/api/admin/accounting/quotes/${id}/pdf`;
}

export function proformaPdfUrl(id: string) {
  return `${getApiBase()}/api/admin/accounting/quotes/${id}/proforma-pdf`;
}
