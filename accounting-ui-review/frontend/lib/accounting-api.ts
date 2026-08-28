import { getApiBase } from "@/lib/api";
import { AdminApiError } from "@/lib/admin-errors";

async function accountingFetch<T>(path: string, init?: RequestInit): Promise<T> {
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

  let json: { success?: boolean; data?: T; error?: string; code?: string } = {};
  try {
    json = (await res.json()) as typeof json;
  } catch {
    /* non-JSON */
  }

  if (!res.ok || json.success === false) {
    throw new AdminApiError(json.error?.trim() || `Request failed (${res.status})`, {
      status: res.status,
      code: json.code
    });
  }

  if (json.data === undefined) {
    throw new AdminApiError("Empty response from server");
  }

  return json.data as T;
}

export function isAccountingEnabled(): boolean {
  return (
    process.env.NEXT_PUBLIC_ACCOUNTING_ENABLED === "1" ||
    process.env.NEXT_PUBLIC_ACCOUNTING_ENABLED === "true"
  );
}

export type AccountingStatus = {
  nativeAccountingEnabled: boolean;
  salesPostingEnabled: boolean;
  refundPostingEnabled?: boolean;
  settlementPostingEnabled?: boolean;
  purchasesPostingEnabled: boolean;
  vendorPaymentPostingEnabled?: boolean;
  expensePostingEnabled?: boolean;
  inventoryValuationEnabled?: boolean;
  purchaseCapitalizationEnabled?: boolean;
  cogsPostingEnabled?: boolean;
  cogsReversalEnabled?: boolean;
  bankingEnabled?: boolean;
  bankStatementImportEnabled?: boolean;
  bankReconciliationEnabled?: boolean;
  gstEnabled?: boolean;
  gstReconciliationEnabled?: boolean;
  shippingGstPolicy?: string;
  reportsEnabled: boolean;
  cutover?: {
    cutoverDate: string | null;
    forwardOnly: boolean;
  };
  productionLikeEnvironment?: boolean;
  productionPostingAllowed?: boolean;
  uatMode?: boolean;
  uatBanner?: string;
  openingBalanceEnabled?: boolean;
  itcVerificationEnabled?: boolean;
  gstReportingEnabled?: boolean;
  mode: string;
  discoveryWorkerActive: boolean;
  calcVersions?: {
    orderPaid?: string;
    orderRefundedFull?: string;
    paymentGatewaySettled?: string;
    vendorBillPosted?: string;
    vendorPaymentMade?: string;
    expenseRecorded?: string;
    inventoryPurchaseCapitalized?: string;
    inventoryCogsRecognized?: string;
  };
};

export type AccountingDashboard = {
  accountCount: number;
  journalCount: number;
  postedJournalCount: number;
  pendingPostingEvents: number;
  failedPostingEvents: number;
  orderPaidPostedCount?: number;
  orderRefundedFullPostedCount?: number;
  banner: string;
};

export type AccountingAccountRow = {
  id: string;
  code: string;
  name: string;
  type: string;
  currency: string;
  isActive: boolean;
  isSystem: boolean;
};

export type AccountingJournalLine = {
  id: string;
  debitInPaise: number;
  creditInPaise: number;
  lineMemo: string | null;
  account: { code: string; name: string; type: string };
};

export type AccountingJournalEntry = {
  id: string;
  entryNumber: string;
  entryDate: string;
  memo: string | null;
  status: string;
  totalDebitInPaise: number;
  totalCreditInPaise: number;
  lines: AccountingJournalLine[];
};

export async function fetchAccountingStatus() {
  return accountingFetch<AccountingStatus>("/api/admin/accounting/status");
}

export async function fetchAccountingDashboard() {
  return accountingFetch<AccountingDashboard>("/api/admin/accounting/dashboard");
}

export async function fetchAccountingAccounts() {
  return accountingFetch<{ accounts: AccountingAccountRow[] }>("/api/admin/accounting/accounts");
}

export async function fetchAccountingJournals(limit = 50, offset = 0) {
  return accountingFetch<{ items: AccountingJournalEntry[]; total: number }>(
    `/api/admin/accounting/journals?limit=${limit}&offset=${offset}`
  );
}

export function formatInrPaise(paise: number): string {
  return `₹${(paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export type OrderPaidPreviewLine = {
  accountCode: string;
  accountName: string;
  debitInPaise: number;
  creditInPaise: number;
  amountSource: string;
  lineMemo?: string;
};

export type OrderPaidPreview = {
  snapshot: {
    orderId: string;
    orderNumber: string;
    grandTotalInPaise: number;
    discountInPaise: number;
    shippingInPaise: number;
    currency: string;
    payment: { provider: string; status: string };
  };
  eligibility: { eligible: boolean; reason?: string; code?: string };
  proposal: {
    calcVersion: string;
    balanced: boolean;
    imbalancePaise: number;
    totalDebitPaise: number;
    totalCreditPaise: number;
    memo: string;
    lines: OrderPaidPreviewLine[];
    diagnostics: {
      preDiscountTaxablePaise: number;
      postDiscountTaxablePaise: number;
      outputCgstPaise: number;
      outputSgstPaise: number;
      outputIgstPaise: number;
      outputGstTotalPaise: number;
      zohoParity?: {
        nativeMerchandiseNetPaise: number;
        zohoMerchandiseNetPaise: number;
        merchandiseVariancePaise: number;
      };
      lineAllocations: Array<{
        grossPaise: number;
        discountPaise: number;
        postTaxablePaise: number;
        postTaxPaise: number;
      }>;
    };
  } | null;
  buildError?: { message: string; code: string };
  postingEvent: { status: string; journalEntry?: { entryNumber: string } | null } | null;
};

export async function previewOrderPaidAccounting(body: {
  orderId?: string;
  orderNumber?: string;
}) {
  return accountingFetch<OrderPaidPreview>("/api/admin/accounting/order-paid/preview", {
    method: "POST",
    body: JSON.stringify(body)
  });
}

export async function postOrderPaidAccounting(body: { orderId?: string; orderNumber?: string }) {
  return accountingFetch<{ duplicate: boolean; journal: { entryNumber: string } }>(
    "/api/admin/accounting/order-paid/post",
    { method: "POST", body: JSON.stringify(body) }
  );
}

export async function discoverOrderPaidAccounting(body?: {
  orderId?: string;
  orderNumber?: string;
  limit?: number;
  dryRun?: boolean;
}) {
  return accountingFetch<{
    scanned: number;
    eligible: number;
    posted: number;
    dryRun: boolean;
    results: Array<{ orderNumber: string; action: string; error?: string }>;
  }>("/api/admin/accounting/order-paid/discover", {
    method: "POST",
    body: JSON.stringify(body ?? { dryRun: true, limit: 10 })
  });
}

export async function fetchOrderPaidReconciliation(params?: {
  orderId?: string;
  orderNumber?: string;
  limit?: number;
}) {
  const q = new URLSearchParams();
  if (params?.orderId) q.set("orderId", params.orderId);
  if (params?.orderNumber) q.set("orderNumber", params.orderNumber);
  if (params?.limit) q.set("limit", String(params.limit));
  return accountingFetch<{ rows: Array<Record<string, unknown>>; count: number }>(
    `/api/admin/accounting/order-paid/reconciliation?${q.toString()}`
  );
}

export async function previewOrderRefundedFullAccounting(body: {
  orderId?: string;
  orderNumber?: string;
  refundId?: string;
}) {
  return accountingFetch<Record<string, unknown>>("/api/admin/accounting/order-refunded-full/preview", {
    method: "POST",
    body: JSON.stringify(body)
  });
}

export async function postOrderRefundedFullAccounting(body: {
  orderId?: string;
  orderNumber?: string;
  refundId?: string;
}) {
  return accountingFetch<{ duplicate: boolean; journal: { entryNumber: string } }>(
    "/api/admin/accounting/order-refunded-full/post",
    { method: "POST", body: JSON.stringify(body) }
  );
}

export async function discoverOrderRefundedFullAccounting(body?: {
  orderId?: string;
  orderNumber?: string;
  refundId?: string;
  limit?: number;
  dryRun?: boolean;
}) {
  return accountingFetch<{
    scanned: number;
    autoPostable: number;
    posted: number;
    dryRun: boolean;
    results: Array<{ orderNumber: string; action: string; code?: string; error?: string }>;
  }>("/api/admin/accounting/order-refunded-full/discover", {
    method: "POST",
    body: JSON.stringify(body ?? { dryRun: true, limit: 10 })
  });
}

export async function fetchReconciliationV2(params?: {
  orderId?: string;
  orderNumber?: string;
  limit?: number;
}) {
  const q = new URLSearchParams();
  if (params?.orderId) q.set("orderId", params.orderId);
  if (params?.orderNumber) q.set("orderNumber", params.orderNumber);
  if (params?.limit) q.set("limit", String(params.limit));
  return accountingFetch<{ rows: Array<Record<string, unknown>>; count: number; version: string }>(
    `/api/admin/accounting/reconciliation/v2?${q.toString()}`
  );
}

export async function fetchReconciliationV3(params?: {
  orderId?: string;
  orderNumber?: string;
  limit?: number;
}) {
  const q = new URLSearchParams();
  if (params?.orderId) q.set("orderId", params.orderId);
  if (params?.orderNumber) q.set("orderNumber", params.orderNumber);
  if (params?.limit) q.set("limit", String(params.limit));
  return accountingFetch<{ rows: Array<Record<string, unknown>>; count: number; version: string }>(
    `/api/admin/accounting/reconciliation/v3?${q.toString()}`
  );
}

export async function listAccountingSettlements(limit = 25) {
  return accountingFetch<{
    rows: Array<Record<string, unknown>>;
    count: number;
  }>(`/api/admin/accounting/settlements?limit=${limit}`);
}

export async function fetchAccountingSettlement(settlementId: string) {
  return accountingFetch<Record<string, unknown>>(
    `/api/admin/accounting/settlements/${encodeURIComponent(settlementId)}`
  );
}

export async function previewAccountingSettlement(
  settlementId: string,
  targetBankAccountId?: string | null
) {
  return accountingFetch<Record<string, unknown>>("/api/admin/accounting/settlements/preview", {
    method: "POST",
    body: JSON.stringify({ settlementId, targetBankAccountId: targetBankAccountId ?? null })
  });
}

export async function importAccountingSettlement(settlementId: string) {
  return accountingFetch<Record<string, unknown>>("/api/admin/accounting/settlements/import", {
    method: "POST",
    body: JSON.stringify({ settlementId })
  });
}

export async function postAccountingSettlement(
  settlementId: string,
  targetBankAccountId?: string | null
) {
  return accountingFetch<{ duplicate: boolean; journal: { entryNumber: string } }>(
    "/api/admin/accounting/settlements/post",
    {
      method: "POST",
      body: JSON.stringify({ settlementId, targetBankAccountId: targetBankAccountId ?? null })
    }
  );
}

export async function discoverAccountingSettlements(body?: {
  settlementId?: string;
  limit?: number;
  dryRun?: boolean;
}) {
  return accountingFetch<{
    scanned: number;
    imported: number;
    posted: number;
    dryRun: boolean;
    results: Array<{ providerSettlementId: string; action: string; error?: string }>;
  }>("/api/admin/accounting/settlements/discover", {
    method: "POST",
    body: JSON.stringify(body ?? { dryRun: true, limit: 5 })
  });
}

export async function previewAccountingVendorBill(body: { billId?: string; billNumber?: string }) {
  return accountingFetch<Record<string, unknown>>("/api/admin/accounting/vendor-bills/preview", {
    method: "POST",
    body: JSON.stringify(body)
  });
}

export async function postAccountingVendorBill(body: { billId?: string; billNumber?: string }) {
  return accountingFetch<{
    duplicate: boolean;
    journal: { entryNumber: string; totalDebitInPaise: number; totalCreditInPaise: number };
  }>("/api/admin/accounting/vendor-bills/post", {
    method: "POST",
    body: JSON.stringify(body)
  });
}

export async function discoverAccountingVendorBills(body?: {
  billId?: string;
  billNumber?: string;
  vendorId?: string;
  limit?: number;
  dryRun?: boolean;
}) {
  return accountingFetch<{
    dryRun: boolean;
    scanned: number;
    rows: Array<Record<string, unknown>>;
  }>("/api/admin/accounting/vendor-bills/discover", {
    method: "POST",
    body: JSON.stringify(body ?? { dryRun: true, limit: 25 })
  });
}

export async function fetchAccountingReconciliationV4(params?: {
  billId?: string;
  billNumber?: string;
  vendorId?: string;
  limit?: number;
}) {
  const q = new URLSearchParams();
  if (params?.billId) q.set("billId", params.billId);
  if (params?.billNumber) q.set("billNumber", params.billNumber);
  if (params?.vendorId) q.set("vendorId", params.vendorId);
  if (params?.limit) q.set("limit", String(params.limit));
  return accountingFetch<{ rows: Array<Record<string, unknown>>; count: number; version: string }>(
    `/api/admin/accounting/reconciliation/v4?${q.toString()}`
  );
}

export async function fetchAccountingReconciliationV5(params?: {
  billId?: string;
  billNumber?: string;
  vendorId?: string;
  limit?: number;
}) {
  const q = new URLSearchParams();
  if (params?.billId) q.set("billId", params.billId);
  if (params?.billNumber) q.set("billNumber", params.billNumber);
  if (params?.vendorId) q.set("vendorId", params.vendorId);
  if (params?.limit) q.set("limit", String(params.limit));
  return accountingFetch<{ rows: Array<Record<string, unknown>>; count: number; version: string }>(
    `/api/admin/accounting/reconciliation/v5?${q.toString()}`
  );
}

export type VendorPaymentMethod = "BANK_TRANSFER" | "UPI" | "CHEQUE" | "CASH";

export async function listAccountingVendorPayments(params?: {
  vendorId?: string;
  status?: string;
  limit?: number;
}) {
  const q = new URLSearchParams();
  if (params?.vendorId) q.set("vendorId", params.vendorId);
  if (params?.status) q.set("status", params.status);
  if (params?.limit) q.set("limit", String(params.limit));
  return accountingFetch<{ payments: Array<Record<string, unknown>> }>(
    `/api/admin/accounting/vendor-payments?${q.toString()}`
  );
}

export async function fetchVendorPaymentOpenBills(vendorId: string) {
  const q = new URLSearchParams({ vendorId });
  return accountingFetch<{
    bills: Array<{
      id: string;
      billNumber: string;
      billDate: string;
      dueDate: string | null;
      totalInPaise: number;
      paidInPaise: number;
      status: string;
      referenceNumber: string | null;
      nativeApCreditInPaise: number;
      nativeAllocatedInPaise: number;
      nativeOutstandingInPaise: number;
    }>;
  }>(`/api/admin/accounting/vendor-payments/open-bills?${q.toString()}`);
}

export async function createAccountingVendorPayment(body: {
  vendorId: string;
  paymentDate: string;
  amountInPaise: number;
  paymentMethod: VendorPaymentMethod;
  utr?: string | null;
  bankAccountId?: string | null;
  notes?: string | null;
  allocations: Array<{ vendorBillId: string; amountInPaise: number }>;
}) {
  return accountingFetch<{ payment: Record<string, unknown> }>("/api/admin/accounting/vendor-payments", {
    method: "POST",
    body: JSON.stringify(body)
  });
}

export async function updateAccountingVendorPayment(
  paymentId: string,
  body: {
    paymentDate?: string;
    amountInPaise?: number;
    paymentMethod?: VendorPaymentMethod;
    utr?: string | null;
    bankAccountId?: string | null;
    notes?: string | null;
    allocations?: Array<{ vendorBillId: string; amountInPaise: number }>;
  }
) {
  return accountingFetch<{ payment: Record<string, unknown> }>(
    `/api/admin/accounting/vendor-payments/${encodeURIComponent(paymentId)}`,
    { method: "PATCH", body: JSON.stringify(body) }
  );
}

export async function deleteAccountingVendorPayment(paymentId: string) {
  return accountingFetch<{ deleted: boolean }>(
    `/api/admin/accounting/vendor-payments/${encodeURIComponent(paymentId)}`,
    { method: "DELETE" }
  );
}

export async function getAccountingVendorPayment(paymentId: string) {
  return accountingFetch<Record<string, unknown>>(
    `/api/admin/accounting/vendor-payments/${encodeURIComponent(paymentId)}`
  );
}

export async function previewAccountingVendorPayment(paymentId: string) {
  return accountingFetch<Record<string, unknown>>("/api/admin/accounting/vendor-payments/preview", {
    method: "POST",
    body: JSON.stringify({ paymentId })
  });
}

export async function postAccountingVendorPayment(paymentId: string) {
  return accountingFetch<{
    duplicate: boolean;
    journal: { entryNumber: string; totalDebitInPaise: number; totalCreditInPaise: number };
  }>("/api/admin/accounting/vendor-payments/post", {
    method: "POST",
    body: JSON.stringify({ paymentId })
  });
}

export async function previewAccountingExpense(body: {
  expenseId: string;
  acknowledgePossibleDuplicate?: boolean;
}) {
  return accountingFetch<Record<string, unknown>>("/api/admin/accounting/expenses/preview", {
    method: "POST",
    body: JSON.stringify(body)
  });
}

export async function postAccountingExpense(body: {
  expenseId: string;
  acknowledgePossibleDuplicate?: boolean;
}) {
  return accountingFetch<{
    duplicate: boolean;
    journal: { entryNumber: string; totalDebitInPaise: number; totalCreditInPaise: number };
  }>("/api/admin/accounting/expenses/post", {
    method: "POST",
    body: JSON.stringify(body)
  });
}

export async function discoverAccountingExpenses(body?: {
  expenseId?: string;
  vendorId?: string;
  limit?: number;
  dryRun?: boolean;
}) {
  return accountingFetch<{
    dryRun: boolean;
    scanned: number;
    posted: number;
    skipped: number;
    rows: Array<Record<string, unknown>>;
  }>("/api/admin/accounting/expenses/discover", {
    method: "POST",
    body: JSON.stringify(body ?? { dryRun: true, limit: 25 })
  });
}

export async function fetchAccountingReconciliationV5Expenses(params?: {
  expenseId?: string;
  vendorId?: string;
  limit?: number;
}) {
  const q = new URLSearchParams();
  if (params?.expenseId) q.set("expenseId", params.expenseId);
  if (params?.vendorId) q.set("vendorId", params.vendorId);
  if (params?.limit) q.set("limit", String(params.limit));
  return accountingFetch<{ rows: Array<Record<string, unknown>>; count: number; version: string }>(
    `/api/admin/accounting/reconciliation/v5-expenses?${q.toString()}`
  );
}

export async function fetchExpenseMappings() {
  return accountingFetch<{
    accounts: Array<Record<string, unknown>>;
    payments: Array<Record<string, unknown>>;
    unmappedAccounts: Array<Record<string, unknown>>;
    unmappedPayments: Array<Record<string, unknown>>;
  }>("/api/admin/accounting/expense-mappings");
}

export async function upsertExpenseAccountMappingApi(body: {
  sourceName: string;
  accountingAccountCode: string;
  isActive?: boolean;
}) {
  return accountingFetch<{ mapping: Record<string, unknown> }>(
    "/api/admin/accounting/expense-mappings/accounts",
    { method: "POST", body: JSON.stringify(body) }
  );
}

export async function upsertExpensePaymentMappingApi(body: {
  sourceName: string;
  paidAccountCode?: "1000" | "1010";
  bankAccountId?: string | null;
  isActive?: boolean;
}) {
  return accountingFetch<{ mapping: Record<string, unknown> }>(
    "/api/admin/accounting/expense-mappings/payments",
    { method: "POST", body: JSON.stringify(body) }
  );
}

export async function patchExpenseAccountMappingApi(id: string, isActive: boolean) {
  return accountingFetch<{ mapping: Record<string, unknown> }>(
    `/api/admin/accounting/expense-mappings/accounts/${encodeURIComponent(id)}`,
    { method: "PATCH", body: JSON.stringify({ isActive }) }
  );
}

export async function patchExpensePaymentMappingApi(id: string, isActive: boolean) {
  return accountingFetch<{ mapping: Record<string, unknown> }>(
    `/api/admin/accounting/expense-mappings/payments/${encodeURIComponent(id)}`,
    { method: "PATCH", body: JSON.stringify({ isActive }) }
  );
}

export type PurchaseAccountingDashboard = {
  version: string;
  cutover: { cutoverDate: string | null; forwardOnly: boolean };
  zohoComparisonNote: string;
  vendorBills: {
    totalNativeApRecognizedInPaise: number;
    totalNativePaidInPaise: number;
    totalNativeOutstandingInPaise: number;
    overdueOutstandingInPaise: number;
    billCount: number;
    postedApBillCount: number;
  };
  aging: Record<string, { count: number; outstandingInPaise: number }>;
  expenses: {
    totalPostedStandaloneInPaise: number;
    postedCount: number;
    unmappedCount: number;
    gstDataGapCount: number;
    duplicateRiskCount: number;
    preCutoverCount: number;
  };
  dataQuality: {
    opsPaidNativeUnpaidCount: number;
    opsPartialNativeUnpaidCount: number;
    opsNativePaymentMismatchCount: number;
    sourceChangedBillCount: number;
    sourceChangedExpenseCount: number;
    unmappedExpenseAccountCount: number;
    unmappedPaymentAccountCount: number;
    billExpenseDuplicateRiskCount: number;
  };
  payments: {
    postedCount: number;
    draftCount: number;
    overallocatedCount: number;
    missingJournalCount: number;
  };
};

export async function fetchPurchaseAccountingDashboard() {
  return accountingFetch<PurchaseAccountingDashboard>("/api/admin/accounting/dashboard/purchases");
}

export async function fetchPurchaseReconciliation(params?: {
  billId?: string;
  expenseId?: string;
  paymentId?: string;
  limit?: number;
}) {
  const q = new URLSearchParams();
  if (params?.billId) q.set("billId", params.billId);
  if (params?.expenseId) q.set("expenseId", params.expenseId);
  if (params?.paymentId) q.set("paymentId", params.paymentId);
  if (params?.limit) q.set("limit", String(params.limit));
  return accountingFetch<Record<string, unknown>>(
    `/api/admin/accounting/reconciliation/purchases?${q.toString()}`
  );
}

export type InventoryReconciliationV1 = {
  version: string;
  rowCount: number;
  statusCounts: Record<string, number>;
  financialControl: {
    inventoryGl1200InPaise: number;
    nativeLayersTotalValueInPaise: number;
    glVsLayersVarianceInPaise: number;
  };
  rows: Array<Record<string, unknown>>;
};

export async function fetchInventoryReconciliation(params?: {
  sku?: string;
  limit?: number;
  physicalOnly?: boolean;
}) {
  const q = new URLSearchParams();
  if (params?.sku) q.set("sku", params.sku);
  if (params?.limit) q.set("limit", String(params.limit));
  if (params?.physicalOnly) q.set("physicalOnly", "1");
  return accountingFetch<InventoryReconciliationV1>(
    `/api/admin/accounting/inventory/reconciliation?${q.toString()}`
  );
}

export async function fetchInventoryClassificationSummary() {
  return accountingFetch<Record<string, number>>(
    "/api/admin/accounting/inventory/classification-summary"
  );
}

export async function previewInventoryOpeningUpload(
  file: File,
  meta: {
    effectiveDate: string;
    valuationSource: string;
    sourceDocumentRef?: string;
    preparedBy?: string;
    reviewedBy?: string;
    allowQuantityMismatch?: boolean;
  }
) {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("effectiveDate", meta.effectiveDate);
  fd.append("valuationSource", meta.valuationSource);
  if (meta.sourceDocumentRef) fd.append("sourceDocumentRef", meta.sourceDocumentRef);
  if (meta.preparedBy) fd.append("preparedBy", meta.preparedBy);
  if (meta.reviewedBy) fd.append("reviewedBy", meta.reviewedBy);
  if (meta.allowQuantityMismatch) fd.append("allowQuantityMismatch", "true");

  const url = `${getApiBase()}/api/admin/accounting/inventory/opening/preview`;
  const res = await fetch(url, { method: "POST", credentials: "include", body: fd });
  const json = (await res.json()) as { success?: boolean; data?: Record<string, unknown>; error?: string };
  if (!res.ok || !json.success) throw new AdminApiError(json.error ?? "Preview failed", { status: res.status });
  return json.data!;
}

export async function saveInventoryOpeningDraft(body: Record<string, unknown>) {
  return accountingFetch<{ batch: Record<string, unknown> }>(
    "/api/admin/accounting/inventory/opening/draft",
    { method: "POST", body: JSON.stringify(body) }
  );
}

export async function postInventoryOpeningBatch(batchId: string) {
  return accountingFetch<Record<string, unknown>>("/api/admin/accounting/inventory/opening/post", {
    method: "POST",
    body: JSON.stringify({ batchId })
  });
}

export async function fetchInventoryOpeningBatches(limit = 25) {
  return accountingFetch<{ batches: Array<Record<string, unknown>> }>(
    `/api/admin/accounting/inventory/opening/batches?limit=${limit}`
  );
}

export async function fetchInventoryReconciliationV2(params?: {
  sku?: string;
  limit?: number;
  physicalOnly?: boolean;
}) {
  const q = new URLSearchParams();
  if (params?.sku) q.set("sku", params.sku);
  if (params?.limit) q.set("limit", String(params.limit));
  if (params?.physicalOnly) q.set("physicalOnly", "1");
  return accountingFetch<Record<string, unknown>>(
    `/api/admin/accounting/inventory/reconciliation/v2?${q.toString()}`
  );
}

export async function fetchInventoryReconciliationV3(params?: {
  sku?: string;
  limit?: number;
  physicalOnly?: boolean;
}) {
  const q = new URLSearchParams();
  if (params?.sku) q.set("sku", params.sku);
  if (params?.limit) q.set("limit", String(params.limit));
  if (params?.physicalOnly) q.set("physicalOnly", "1");
  return accountingFetch<Record<string, unknown>>(
    `/api/admin/accounting/inventory/reconciliation/v3?${q.toString()}`
  );
}

export async function fetchPurchaseCapitalizationClearing(params?: {
  vendorBillId?: string;
  purchaseOrderId?: string;
  limit?: number;
}) {
  const q = new URLSearchParams();
  if (params?.vendorBillId) q.set("vendorBillId", params.vendorBillId);
  if (params?.purchaseOrderId) q.set("purchaseOrderId", params.purchaseOrderId);
  if (params?.limit) q.set("limit", String(params.limit));
  return accountingFetch<Record<string, unknown>>(
    `/api/admin/accounting/inventory/purchase-capitalization/clearing?${q.toString()}`
  );
}

export async function previewPurchaseCapitalization(receiptLineId: string) {
  return accountingFetch<Record<string, unknown>>(
    "/api/admin/accounting/inventory/purchase-capitalization/preview",
    { method: "POST", body: JSON.stringify({ receiptLineId }) }
  );
}

export async function postPurchaseCapitalization(receiptLineId: string) {
  return accountingFetch<Record<string, unknown>>(
    "/api/admin/accounting/inventory/purchase-capitalization/post",
    { method: "POST", body: JSON.stringify({ receiptLineId }) }
  );
}

export async function discoverPurchaseCapitalization(body: Record<string, unknown>) {
  return accountingFetch<Record<string, unknown>>(
    "/api/admin/accounting/inventory/purchase-capitalization/discover",
    { method: "POST", body: JSON.stringify(body) }
  );
}

export async function previewInventoryCogsAccounting(body: {
  orderId?: string;
  orderNumber?: string;
}) {
  return accountingFetch<Record<string, unknown>>("/api/admin/accounting/inventory/cogs/preview", {
    method: "POST",
    body: JSON.stringify(body)
  });
}

export async function postInventoryCogsAccounting(body: {
  orderId?: string;
  orderNumber?: string;
}) {
  return accountingFetch<Record<string, unknown>>("/api/admin/accounting/inventory/cogs/post", {
    method: "POST",
    body: JSON.stringify(body)
  });
}

export async function discoverInventoryCogsAccounting(body: Record<string, unknown>) {
  return accountingFetch<Record<string, unknown>>("/api/admin/accounting/inventory/cogs/discover", {
    method: "POST",
    body: JSON.stringify(body)
  });
}

export async function fetchInventoryReconciliationV4(params?: {
  sku?: string;
  limit?: number;
  physicalOnly?: boolean;
}) {
  const q = new URLSearchParams();
  if (params?.sku) q.set("sku", params.sku);
  if (params?.limit != null) q.set("limit", String(params.limit));
  if (params?.physicalOnly) q.set("physicalOnly", "1");
  return accountingFetch<Record<string, unknown>>(
    `/api/admin/accounting/inventory/reconciliation/v4?${q.toString()}`
  );
}

export async function previewInventoryCogsReversalAccounting(body: { restockEventId: string }) {
  return accountingFetch<Record<string, unknown>>(
    "/api/admin/accounting/inventory/cogs-reversal/preview",
    {
      method: "POST",
      body: JSON.stringify(body)
    }
  );
}

export async function postInventoryCogsReversalAccounting(body: { restockEventId: string }) {
  return accountingFetch<Record<string, unknown>>(
    "/api/admin/accounting/inventory/cogs-reversal/post",
    {
      method: "POST",
      body: JSON.stringify(body)
    }
  );
}

export async function discoverInventoryCogsReversalAccounting(body: Record<string, unknown>) {
  return accountingFetch<Record<string, unknown>>(
    "/api/admin/accounting/inventory/cogs-reversal/discover",
    {
      method: "POST",
      body: JSON.stringify(body)
    }
  );
}

export type BankAccountRow = {
  id: string;
  name: string;
  bankName: string | null;
  maskedAccountNumber: string | null;
  glAccountCode: string;
  accountType: "BANK" | "CASH" | "PETTY_CASH";
  isActive: boolean;
  isDefault: boolean;
  razorpaySettlementTarget: boolean;
  bookBalanceInPaise: number;
  bookBalanceLabel: string;
  latestStatementBalanceInPaise?: number | null;
  latestStatementBalanceLabel?: string;
  reconciliationDifferenceInPaise?: number | null;
  reconciliationStatus?: string | null;
  unmatchedCount?: number;
  reviewRequiredCount?: number;
  lastReconciliationAt?: string | null;
  latestStatementPeriodEnd?: string | null;
};

export type BankStatementPreview = {
  bankAccountId: string;
  fileName: string;
  fileHash: string;
  currency: string;
  detectedColumns: Record<string, string | null>;
  rowCount: number;
  validRowCount: number;
  invalidRows: Array<{ rowNumber: number; code: string; message: string }>;
  duplicateRowsInFile: number[];
  statementFrom: string | null;
  statementTo: string | null;
  openingBalanceInPaise: number | null;
  closingBalanceInPaise: number | null;
  debitTotalInPaise: number;
  creditTotalInPaise: number;
  sampleTransactions: Array<{
    rowNumber: number;
    transactionDate: string;
    description: string;
    reference: string | null;
    debitInPaise: number;
    creditInPaise: number;
    runningBalanceInPaise: number | null;
  }>;
  canCommit: boolean;
};

export type BankStatementMatchRow = {
  id: string;
  journalEntryId: string;
  matchType: string;
  confidence: string;
  status: string;
  matchedAmountInPaise: number;
  bankGlAccountCode: string;
  evidenceJson?: unknown;
  journalEntry?: { id: string; entryNumber: string; entryDate: string };
};

export type BankStatementLineRow = {
  id: string;
  rowNumber: number;
  transactionDate: string;
  description: string;
  reference: string | null;
  debitInPaise: number;
  creditInPaise: number;
  runningBalanceInPaise: number | null;
  matchStatus: string;
  matches: BankStatementMatchRow[];
};

export type BankStatementImportRow = {
  id: string;
  fileName: string;
  bankAccountId: string;
  statementFrom: string | null;
  statementTo: string | null;
  rowCount: number;
  debitTotalInPaise: number;
  creditTotalInPaise: number;
  importStatus: string;
  committedAt: string | null;
  bankAccount?: { id: string; name: string; glAccountCode: string };
  lines?: BankStatementLineRow[];
};

async function accountingUpload<T>(path: string, fd: FormData): Promise<T> {
  const url = `${getApiBase()}${path.startsWith("/") ? path : `/${path}`}`;
  const res = await fetch(url, { method: "POST", credentials: "include", body: fd });
  const json = (await res.json()) as { success?: boolean; data?: T; error?: string; code?: string };
  if (!res.ok || json.success === false) {
    throw new AdminApiError(json.error?.trim() || `Upload failed (${res.status})`, {
      status: res.status,
      code: json.code
    });
  }
  if (json.data === undefined) throw new AdminApiError("Empty response from server");
  return json.data as T;
}

export async function fetchBankStatementImportStatus() {
  return accountingFetch<{ statementImportEnabled: boolean }>(
    "/api/admin/accounting/bank-statements/status"
  );
}

export async function previewBankStatementImport(bankAccountId: string, file: File) {
  const fd = new FormData();
  fd.append("bankAccountId", bankAccountId);
  fd.append("file", file);
  return accountingUpload<BankStatementPreview>("/api/admin/accounting/bank-statements/preview", fd);
}

export async function commitBankStatementImport(bankAccountId: string, file: File) {
  const fd = new FormData();
  fd.append("bankAccountId", bankAccountId);
  fd.append("file", file);
  return accountingUpload<BankStatementImportRow>(
    "/api/admin/accounting/bank-statements/commit",
    fd
  );
}

export async function listBankStatementImports(bankAccountId?: string) {
  const q = bankAccountId ? `?bankAccountId=${bankAccountId}` : "";
  return accountingFetch<{ imports: BankStatementImportRow[] }>(
    `/api/admin/accounting/bank-statements/imports${q}`
  );
}

export async function fetchBankStatementImport(importId: string) {
  return accountingFetch<BankStatementImportRow>(
    `/api/admin/accounting/bank-statements/imports/${importId}`
  );
}

export async function listBankStatementLines(input?: {
  importId?: string;
  bankAccountId?: string;
  matchStatus?: string;
  limit?: number;
}) {
  const params = new URLSearchParams();
  if (input?.importId) params.set("importId", input.importId);
  if (input?.bankAccountId) params.set("bankAccountId", input.bankAccountId);
  if (input?.matchStatus) params.set("matchStatus", input.matchStatus);
  if (input?.limit) params.set("limit", String(input.limit));
  const q = params.toString();
  return accountingFetch<{ lines: BankStatementLineRow[] }>(
    `/api/admin/accounting/bank-statements/lines${q ? `?${q}` : ""}`
  );
}

export async function rerunBankStatementMatching(importId: string) {
  return accountingFetch<BankStatementImportRow>(
    `/api/admin/accounting/bank-statements/imports/${importId}/rerun-matching`,
    { method: "POST", body: JSON.stringify({}) }
  );
}

export async function confirmBankStatementMatch(body: {
  lineId: string;
  journalEntryId: string;
  note?: string;
}) {
  return accountingFetch<BankStatementLineRow>("/api/admin/accounting/bank-statements/match/confirm", {
    method: "POST",
    body: JSON.stringify(body)
  });
}

export async function unmatchBankStatementLine(lineId: string) {
  return accountingFetch<unknown>("/api/admin/accounting/bank-statements/match/unmatch", {
    method: "POST",
    body: JSON.stringify({ lineId })
  });
}

export async function fetchBankingDashboard() {
  return accountingFetch<{
    accounts: BankAccountRow[];
    bankingEnabled: boolean;
    statementImportEnabled?: boolean;
    bankReconciliationEnabled?: boolean;
    gatewayControls?: Array<{
      provider: string;
      glCode: string;
      glName: string;
      balanceInPaise: number;
      status: string;
      warnings: string[];
      lastSettlementAt: string | null;
      lastSettlementUtr: string | null;
    }>;
  }>("/api/admin/accounting/banking/dashboard");
}

export async function listBankReconciliations(bankAccountId?: string) {
  const q = bankAccountId ? `?bankAccountId=${bankAccountId}` : "";
  return accountingFetch<{ reconciliations: Array<Record<string, unknown>> }>(
    `/api/admin/accounting/bank-reconciliations${q}`
  );
}

export async function createBankReconciliation(body: {
  bankAccountId: string;
  periodStart: string;
  periodEnd: string;
  statementImportId?: string | null;
  statementOpeningBalanceInPaise?: number | null;
  statementClosingBalanceInPaise?: number | null;
  notes?: string | null;
}) {
  return accountingFetch<Record<string, unknown>>("/api/admin/accounting/bank-reconciliations", {
    method: "POST",
    body: JSON.stringify(body)
  });
}

export async function fetchBankReconciliation(id: string) {
  return accountingFetch<Record<string, unknown>>(
    `/api/admin/accounting/bank-reconciliations/${id}`
  );
}

export async function recomputeBankReconciliation(id: string) {
  return accountingFetch<Record<string, unknown>>(
    `/api/admin/accounting/bank-reconciliations/${id}/recompute`,
    { method: "POST", body: JSON.stringify({}) }
  );
}

export async function reconcileBankReconciliation(id: string) {
  return accountingFetch<Record<string, unknown>>(
    `/api/admin/accounting/bank-reconciliations/${id}/reconcile`,
    { method: "POST", body: JSON.stringify({}) }
  );
}

export async function reopenBankReconciliation(id: string, reason: string) {
  return accountingFetch<Record<string, unknown>>(
    `/api/admin/accounting/bank-reconciliations/${id}/reopen`,
    { method: "POST", body: JSON.stringify({ reason }) }
  );
}

export async function categorizeBankCharge(lineId: string, note?: string) {
  return accountingFetch<Record<string, unknown>>(
    "/api/admin/accounting/bank-statements/categorize/charge",
    { method: "POST", body: JSON.stringify({ lineId, note }) }
  );
}

export async function categorizeBankInterest(lineId: string, note?: string) {
  return accountingFetch<Record<string, unknown>>(
    "/api/admin/accounting/bank-statements/categorize/interest",
    { method: "POST", body: JSON.stringify({ lineId, note }) }
  );
}

export async function ignoreBankStatementLine(lineId: string, reason: string) {
  return accountingFetch<Record<string, unknown>>(
    "/api/admin/accounting/bank-statements/categorize/ignore",
    { method: "POST", body: JSON.stringify({ lineId, reason }) }
  );
}

export async function fetchGatewayClearingControls() {
  return accountingFetch<{
    controls: Array<Record<string, unknown>>;
    codRemittanceDesign: Record<string, unknown>;
  }>("/api/admin/accounting/gateway-clearing/controls");
}

export type GstStatus = {
  gstEnabled: boolean;
  gstReconciliationEnabled: boolean;
  itcVerificationEnabled?: boolean;
  gstReportingEnabled?: boolean;
  shippingGstPolicy: string;
  itcEligibleWorkflow: boolean;
  note?: string;
};

export type GstLedgerReport = {
  from: string;
  to: string;
  accounts: Array<{
    accountCode: string;
    accountName: string;
    openingBalanceInPaise: number;
    periodDebitInPaise: number;
    periodCreditInPaise: number;
    closingBalanceInPaise: number;
  }>;
  aggregates: {
    outputCgstClosingInPaise: number;
    outputSgstClosingInPaise: number;
    outputIgstClosingInPaise: number;
    inputCgstRecognizedClosingInPaise: number;
    inputSgstRecognizedClosingInPaise: number;
    inputIgstRecognizedClosingInPaise: number;
  };
};

export type GstReconRow = {
  scope: string;
  sourceType: string;
  sourceId: string;
  reference: string | null;
  statuses: string[];
  primaryStatus: string;
  details: Record<string, unknown>;
};

export async function fetchGstStatus() {
  return accountingFetch<GstStatus>("/api/admin/accounting/gst/status");
}

export async function fetchGstOverview(params?: { from?: string; to?: string; month?: string }) {
  const q = new URLSearchParams();
  if (params?.month) q.set("month", params.month);
  if (params?.from) q.set("from", params.from);
  if (params?.to) q.set("to", params.to);
  const qs = q.toString();
  return accountingFetch<Record<string, unknown>>(
    `/api/admin/accounting/gst/overview${qs ? `?${qs}` : ""}`
  );
}

export async function fetchGstLedger(params?: { from?: string; to?: string; month?: string }) {
  const q = new URLSearchParams();
  if (params?.month) q.set("month", params.month);
  if (params?.from) q.set("from", params.from);
  if (params?.to) q.set("to", params.to);
  const qs = q.toString();
  return accountingFetch<GstLedgerReport>(
    `/api/admin/accounting/gst/ledger${qs ? `?${qs}` : ""}`
  );
}

export async function fetchGstReconciliation(params?: {
  scope?: "ALL" | "SALES" | "FULL_REFUNDS" | "VENDOR_BILLS" | "EXPENSES" | "GATEWAY_FEES";
  status?: string;
  limit?: number;
}) {
  const q = new URLSearchParams();
  if (params?.scope) q.set("scope", params.scope);
  if (params?.status) q.set("status", params.status);
  if (params?.limit != null) q.set("limit", String(params.limit));
  const qs = q.toString();
  return accountingFetch<{ rows: GstReconRow[] }>(
    `/api/admin/accounting/gst/reconciliation${qs ? `?${qs}` : ""}`
  );
}

export async function fetchGstDataGaps(limit = 40) {
  return accountingFetch<{ rows: GstReconRow[] }>(
    `/api/admin/accounting/gst/data-gaps?limit=${limit}`
  );
}

export type ItcEvidenceRow = {
  id: string;
  sourceType: string;
  sourceId: string;
  documentReference: string | null;
  supplierGstin: string | null;
  supplierName: string | null;
  documentDate: string | null;
  taxableValueInPaise: number;
  cgstInPaise: number;
  sgstInPaise: number;
  igstInPaise: number;
  totalGstInPaise: number;
  recognizedInInputGl: boolean;
  status: string;
  assessmentCode: string | null;
  evidenceWarnings: unknown;
  verificationNotes: string | null;
  statusHistory?: Array<{
    id: string;
    oldStatus: string | null;
    newStatus: string;
    actorUserId: string | null;
    reason: string | null;
    createdAt: string;
  }>;
};

export type ItcSummary = {
  recognizedInputGst: { totalGstInPaise: number; cgstInPaise: number; sgstInPaise: number; igstInPaise: number; count: number };
  eligibleInputGst: { totalGstInPaise: number; count: number };
  blockedInputGst: { totalGstInPaise: number; count: number };
  unverifiedInputGst: { totalGstInPaise: number; count: number };
  dataGapInputGst: { totalGstInPaise: number; count: number };
  gatewayProvisionalGst: { totalGstInPaise: number; count: number };
  note: string;
};

export async function fetchItcSummary(month?: string) {
  const q = month ? `?month=${encodeURIComponent(month)}` : "";
  return accountingFetch<ItcSummary>(`/api/admin/accounting/gst/itc/summary${q}`);
}

export async function fetchItcList(params?: {
  status?: string;
  sourceType?: string;
  vendor?: string;
  month?: string;
  limit?: number;
}) {
  const q = new URLSearchParams();
  if (params?.status) q.set("status", params.status);
  if (params?.sourceType) q.set("sourceType", params.sourceType);
  if (params?.vendor) q.set("vendor", params.vendor);
  if (params?.month) q.set("month", params.month);
  if (params?.limit != null) q.set("limit", String(params.limit));
  const qs = q.toString();
  return accountingFetch<{ rows: ItcEvidenceRow[]; total: number }>(
    `/api/admin/accounting/gst/itc${qs ? `?${qs}` : ""}`
  );
}

export async function fetchItcEvidence(id: string) {
  return accountingFetch<ItcEvidenceRow>(`/api/admin/accounting/gst/itc/${id}`);
}

export async function discoverItc(body?: { sourceType?: string; limit?: number }) {
  return accountingFetch<{
    scanned: number;
    created: number;
    updated: number;
    skipped: number;
    ids: string[];
  }>("/api/admin/accounting/gst/itc/discover", {
    method: "POST",
    body: JSON.stringify(body ?? {})
  });
}

export async function verifyItc(id: string, reason: string) {
  return accountingFetch<ItcEvidenceRow>(`/api/admin/accounting/gst/itc/${id}/verify`, {
    method: "POST",
    body: JSON.stringify({ reason })
  });
}

export async function blockItc(id: string, reason: string) {
  return accountingFetch<ItcEvidenceRow>(`/api/admin/accounting/gst/itc/${id}/block`, {
    method: "POST",
    body: JSON.stringify({ reason })
  });
}

export async function markItcDataGap(id: string, reason: string) {
  return accountingFetch<ItcEvidenceRow>(`/api/admin/accounting/gst/itc/${id}/data-gap`, {
    method: "POST",
    body: JSON.stringify({ reason })
  });
}

function gstPeriodQuery(params?: { from?: string; to?: string; month?: string }) {
  const q = new URLSearchParams();
  if (params?.month) q.set("month", params.month);
  if (params?.from) q.set("from", params.from);
  if (params?.to) q.set("to", params.to);
  const qs = q.toString();
  return qs ? `?${qs}` : "";
}

export async function fetchGstReportOverview(params?: { from?: string; to?: string; month?: string }) {
  return accountingFetch<Record<string, unknown>>(
    `/api/admin/accounting/gst/reports/overview${gstPeriodQuery(params)}`
  );
}

export async function fetchGstReportOutward(params?: { from?: string; to?: string; month?: string }) {
  return accountingFetch<Record<string, unknown>>(
    `/api/admin/accounting/gst/reports/outward${gstPeriodQuery(params)}`
  );
}

export async function fetchGstReportB2b(params?: { from?: string; to?: string; month?: string }) {
  return accountingFetch<Record<string, unknown>>(
    `/api/admin/accounting/gst/reports/b2b${gstPeriodQuery(params)}`
  );
}

export async function fetchGstReportB2c(params?: { from?: string; to?: string; month?: string }) {
  return accountingFetch<Record<string, unknown>>(
    `/api/admin/accounting/gst/reports/b2c${gstPeriodQuery(params)}`
  );
}

export async function fetchGstReportCreditNotes(params?: { from?: string; to?: string; month?: string }) {
  return accountingFetch<Record<string, unknown>>(
    `/api/admin/accounting/gst/reports/credit-notes${gstPeriodQuery(params)}`
  );
}

export async function fetchGstReportHsn(params?: { from?: string; to?: string; month?: string }) {
  return accountingFetch<Record<string, unknown>>(
    `/api/admin/accounting/gst/reports/hsn${gstPeriodQuery(params)}`
  );
}

export async function fetchGstReportRates(params?: { from?: string; to?: string; month?: string }) {
  return accountingFetch<Record<string, unknown>>(
    `/api/admin/accounting/gst/reports/rates${gstPeriodQuery(params)}`
  );
}

export async function fetchGstReport3b(params?: { from?: string; to?: string; month?: string }) {
  return accountingFetch<Record<string, unknown>>(
    `/api/admin/accounting/gst/reports/3b-summary${gstPeriodQuery(params)}`
  );
}

export async function fetchGstReportIntegrity(params?: { from?: string; to?: string; month?: string }) {
  return accountingFetch<{
    status: string;
    checks: Array<Record<string, unknown>>;
    failures: Array<Record<string, unknown>>;
  }>(`/api/admin/accounting/gst/reports/integrity${gstPeriodQuery(params)}`);
}

export async function fetchGstReportDataGaps(params?: { from?: string; to?: string; month?: string }) {
  return accountingFetch<{ gaps: Array<{ code: string; count: number; exposureInPaise: number }> }>(
    `/api/admin/accounting/gst/reports/data-gaps${gstPeriodQuery(params)}`
  );
}

export function gstExportUrl(params?: { from?: string; to?: string; month?: string }) {
  return `/api/admin/accounting/gst/export${gstPeriodQuery(params)}`;
}

export async function listBankAccounts(includeInactive = false) {
  return accountingFetch<{ accounts: BankAccountRow[] }>(
    `/api/admin/accounting/bank-accounts?includeInactive=${includeInactive ? "1" : "0"}`
  );
}

export async function createBankAccount(body: {
  name: string;
  bankName?: string | null;
  maskedAccountNumber?: string | null;
  ifsc?: string | null;
  glAccountCode: string;
  accountType: "BANK" | "CASH" | "PETTY_CASH";
  isDefault?: boolean;
  razorpaySettlementTarget?: boolean;
  createGlIfMissing?: boolean;
}) {
  return accountingFetch<{ id: string } & BankAccountRow>("/api/admin/accounting/bank-accounts", {
    method: "POST",
    body: JSON.stringify(body)
  });
}

export async function updateBankAccount(
  id: string,
  body: Partial<{
    name: string;
    bankName: string | null;
    isDefault: boolean;
    razorpaySettlementTarget: boolean;
    statementImportEnabled: boolean;
  }>
) {
  return accountingFetch<BankAccountRow>(`/api/admin/accounting/bank-accounts/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body)
  });
}

export async function deactivateBankAccount(id: string) {
  return accountingFetch<Record<string, unknown>>(
    `/api/admin/accounting/bank-accounts/${id}/deactivate`,
    { method: "POST", body: JSON.stringify({}) }
  );
}

export async function createBankTransfer(body: {
  transferDate: string;
  amountInPaise: number;
  transferKind: "INTERNAL_TRANSFER" | "CASH_DEPOSIT" | "CASH_WITHDRAWAL";
  sourceBankAccountId: string;
  destinationBankAccountId: string;
  reference?: string | null;
  memo?: string | null;
}) {
  return accountingFetch<Record<string, unknown>>("/api/admin/accounting/bank-transfers", {
    method: "POST",
    body: JSON.stringify(body)
  });
}

export async function previewBankTransfer(transferId: string) {
  return accountingFetch<Record<string, unknown>>("/api/admin/accounting/bank-transfers/preview", {
    method: "POST",
    body: JSON.stringify({ transferId })
  });
}

export async function postBankTransfer(transferId: string) {
  return accountingFetch<{ duplicate: boolean; journal: { entryNumber: string } }>(
    "/api/admin/accounting/bank-transfers/post",
    { method: "POST", body: JSON.stringify({ transferId }) }
  );
}

export async function listBankTransfers(limit = 30) {
  return accountingFetch<{ transfers: Array<Record<string, unknown>> }>(
    `/api/admin/accounting/bank-transfers?limit=${limit}`
  );
}

/* ─── Phase 6B financial reports (TB / GL) ─── */

export type FinancialReportClass =
  | "ASSET"
  | "LIABILITY"
  | "EQUITY"
  | "REVENUE"
  | "CONTRA_REVENUE"
  | "COGS"
  | "EXPENSE"
  | "OTHER_INCOME"
  | "OTHER_EXPENSE"
  | "TAX_ASSET"
  | "TAX_LIABILITY"
  | "PURCHASE_CLEARING_ASSET"
  | "PURCHASE_CLEARING_LIABILITY"
  | "CASH"
  | "BANK";

export type TrialBalanceRow = {
  accountId: string;
  accountCode: string;
  accountName: string;
  accountType: string;
  reportClass: FinancialReportClass;
  openingDebitInPaise: number;
  openingCreditInPaise: number;
  periodDebitInPaise: number;
  periodCreditInPaise: number;
  closingDebitInPaise: number;
  closingCreditInPaise: number;
  closingNetInPaise: number;
};

export type TrialBalanceReport = {
  mode: "AS_OF" | "PERIOD";
  asOf: string | null;
  from: string | null;
  to: string | null;
  includeZeroBalanceAccounts: boolean;
  currency: "INR";
  rows: TrialBalanceRow[];
  totals: {
    openingDebitInPaise: number;
    openingCreditInPaise: number;
    periodDebitInPaise: number;
    periodCreditInPaise: number;
    closingDebitInPaise: number;
    closingCreditInPaise: number;
  };
  balanced: boolean;
  varianceInPaise: number;
  integrity: {
    code: "TB_DEBITS_EQUAL_CREDITS";
    status: "PASS" | "FAIL";
    varianceInPaise: number;
  };
};

export type GeneralLedgerLine = {
  lineId: string;
  entryDate: string;
  journalEntryId: string;
  journalNumber: string;
  description: string | null;
  lineMemo: string | null;
  debitInPaise: number;
  creditInPaise: number;
  runningBalanceInPaise: number;
  eventType: string | null;
  sourceType: string | null;
  sourceId: string | null;
  postingEventId: string | null;
  orphanJournal: boolean;
  sourceHref: string | null;
};

export type GeneralLedgerReport = {
  accountId: string;
  accountCode: string;
  accountName: string;
  accountType: string;
  reportClass: FinancialReportClass;
  from: string;
  to: string;
  openingBalanceInPaise: number;
  periodDebitInPaise: number;
  periodCreditInPaise: number;
  closingBalanceInPaise: number;
  pagination: {
    limit: number;
    offset: number;
    totalLines: number;
    hasMore: boolean;
  };
  lines: GeneralLedgerLine[];
};

export type ReportAccountRow = {
  id: string;
  code: string;
  name: string;
  type: string;
  reportClass: FinancialReportClass;
  normalBalance: "DEBIT" | "CREDIT";
  isActive: boolean;
  isSystem: boolean;
  isBankRegistryGl: boolean;
  bankAccountType: "BANK" | "CASH" | null;
  hasPostedActivity: boolean;
};

export type FinancialYearSummary = {
  fyStartMonth: number;
  currentFy: {
    startDate: string;
    endDate: string;
    label: string;
    startYear: number;
    startMonth: number;
  };
  ytdStart: string;
  options: Array<{
    startDate: string;
    endDate: string;
    label: string;
    startYear: number;
    startMonth: number;
  }>;
};

function qs(params: Record<string, string | number | boolean | undefined | null>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export async function fetchTrialBalance(params: {
  asOf?: string;
  from?: string;
  to?: string;
  includeZeroBalanceAccounts?: boolean;
}) {
  return accountingFetch<TrialBalanceReport>(
    `/api/admin/accounting/reports/trial-balance${qs({
      asOf: params.asOf,
      from: params.from,
      to: params.to,
      includeZeroBalanceAccounts: params.includeZeroBalanceAccounts ? "1" : undefined
    })}`
  );
}

export async function fetchGeneralLedger(params: {
  accountCode?: string;
  accountId?: string;
  from: string;
  to: string;
  limit?: number;
  offset?: number;
}) {
  return accountingFetch<GeneralLedgerReport>(
    `/api/admin/accounting/reports/general-ledger${qs(params)}`
  );
}

export async function fetchReportAccounts() {
  return accountingFetch<{ items: ReportAccountRow[]; total: number }>(
    "/api/admin/accounting/reports/accounts"
  );
}

export async function fetchFinancialYearConfig() {
  return accountingFetch<FinancialYearSummary>("/api/admin/accounting/reports/financial-year");
}

/* ─── Phase 6C P&L / BS / Dashboard ─── */

export type StatementLine = {
  key: string;
  label: string;
  kind: "line" | "subtotal" | "total" | "header";
  amountInPaise: number;
  signedNetInPaise: number | null;
  accountCodes: string[];
  reportClass?: FinancialReportClass;
  children?: StatementLine[];
  warning?: string | null;
};

export type ProfitLossReport = {
  from: string;
  to: string;
  totals: {
    grossProductSalesInPaise: number;
    discountsInPaise: number;
    netProductSalesInPaise: number;
    shippingRevenueInPaise: number;
    totalOperatingRevenueInPaise: number;
    cogsInPaise: number;
    grossProfitInPaise: number;
    grossMarginPercent: number | null;
    operatingExpensesInPaise: number;
    operatingProfitInPaise: number;
    otherIncomeInPaise: number;
    otherExpensesInPaise: number;
    netProfitInPaise: number;
  };
  sections: {
    revenue: StatementLine[];
    cogs: StatementLine[];
    operatingExpenses: StatementLine[];
    otherIncome: StatementLine[];
    otherExpenses: StatementLine[];
  };
  integrity: {
    code: string;
    status: "PASS" | "FAIL";
    temporaryAccountsNetInPaise: number;
    varianceInPaise: number;
  };
  comparison?: {
    previousPeriod: { from: string; to: string; netProfitInPaise: number } | null;
    ytd: { from: string; to: string; netProfitInPaise: number } | null;
  };
};

export type BalanceSheetReport = {
  asOf: string;
  fy: { startDate: string; endDate: string; label: string };
  earnings: {
    currentFyFrom: string;
    currentFyTo: string;
    currentFyEarningsInPaise: number;
    priorUnclosedEarningsInPaise: number;
    formula: string;
  };
  sections: {
    assets: StatementLine[];
    liabilities: StatementLine[];
    equity: StatementLine[];
  };
  totals: {
    totalAssetsInPaise: number;
    totalLiabilitiesInPaise: number;
    totalEquityInPaise: number;
    differenceInPaise: number;
    balanced: boolean;
  };
  integrity: { code: string; status: "PASS" | "FAIL"; varianceInPaise: number };
  disclosures: { arSubledger: string; warnings: string[] };
};

export type FinancialDashboardReport = {
  period: { from: string; to: string };
  asOf: string;
  fy: { label: string; startDate: string; endDate: string };
  profitAndLoss: {
    revenueInPaise: number;
    netRevenueInPaise: number;
    cogsInPaise: number;
    grossProfitInPaise: number;
    grossMarginPercent: number | null;
    operatingExpensesInPaise: number;
    netProfitInPaise: number;
  };
  balanceSheet: {
    cashAndBankInPaise: number;
    accountsReceivableInPaise: number;
    accountsPayableInPaise: number;
    inventoryInPaise: number;
    gatewayClearingInPaise: number;
    inputGstAssetInPaise: number;
    outputGstLiabilityInPaise: number;
    balanced: boolean;
  };
  comparison: {
    previousPeriodNetProfitInPaise: number | null;
    ytdNetProfitInPaise: number | null;
  };
  links: {
    profitLoss: { from: string; to: string };
    balanceSheet: { asOf: string };
    trialBalance: { asOf: string };
  };
  disclosures: string[];
};

export async function fetchProfitLoss(params: {
  from: string;
  to: string;
  comparison?: boolean;
}) {
  return accountingFetch<ProfitLossReport>(
    `/api/admin/accounting/reports/profit-loss${qs({
      from: params.from,
      to: params.to,
      comparison: params.comparison ? "1" : undefined
    })}`
  );
}

export async function fetchBalanceSheet(params: { asOf: string; comparison?: boolean }) {
  return accountingFetch<BalanceSheetReport>(
    `/api/admin/accounting/reports/balance-sheet${qs({
      asOf: params.asOf,
      comparison: params.comparison ? "1" : undefined
    })}`
  );
}

export async function fetchFinancialDashboard(params: {
  from: string;
  to: string;
  asOf?: string;
}) {
  return accountingFetch<FinancialDashboardReport>(
    `/api/admin/accounting/reports/dashboard${qs(params)}`
  );
}

/* ─── Phase 6D Integrity / Exports ─── */

export type IntegrityStatus = "PASS" | "WARNING" | "FAIL" | "DATA_GAP";
export type IntegritySeverity = "BLOCKER" | "HIGH" | "MEDIUM" | "LOW" | "INFO";

export type IntegrityCheck = {
  code: string;
  status: IntegrityStatus;
  severity: IntegritySeverity;
  expectedInPaise: number | null;
  actualInPaise: number | null;
  varianceInPaise: number | null;
  message: string;
  drillDown: Record<string, unknown> | null;
};

export type FinancialIntegrityReport = {
  asOf: string;
  period: { from: string; to: string };
  generatedAt: string;
  overallStatus: "FINANCIAL_REPORTING_ENGINE_HEALTHY" | "REVIEW_REQUIRED";
  productionCutoverReady: false;
  summary: { pass: number; warning: number; fail: number; dataGap: number };
  checks: IntegrityCheck[];
  phase7CarryForward: string[];
};

export async function fetchFinancialIntegrity(params: {
  asOf?: string;
  from?: string;
  to?: string;
}) {
  return accountingFetch<FinancialIntegrityReport>(
    `/api/admin/accounting/reports/integrity${qs(params)}`
  );
}

async function downloadAccountingBlob(path: string, fallbackName: string) {
  const url = `${getApiBase()}${path.startsWith("/") ? path : `/${path}`}`;
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) {
    let msg = `Export failed (${res.status})`;
    try {
      const j = (await res.json()) as { error?: string };
      if (j.error) msg = j.error;
    } catch {
      /* ignore */
    }
    throw new AdminApiError(msg, { status: res.status });
  }
  const blob = await res.blob();
  const cd = res.headers.get("Content-Disposition") ?? "";
  const match = /filename="([^"]+)"/i.exec(cd);
  const filename = match?.[1] ?? fallbackName;
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(href);
}

export async function downloadFinancialStatementsXlsx(params: {
  asOf: string;
  from: string;
  to: string;
}) {
  await downloadAccountingBlob(
    `/api/admin/accounting/reports/export/xlsx${qs(params)}`,
    `sarveda-financial-statements-${params.from}_${params.to}.xlsx`
  );
}

export async function downloadGeneralLedgerXlsx(params: {
  accountCode: string;
  from: string;
  to: string;
}) {
  await downloadAccountingBlob(
    `/api/admin/accounting/reports/export/gl-xlsx${qs(params)}`,
    `sarveda-gl-${params.accountCode}-${params.from}_${params.to}.xlsx`
  );
}

export async function downloadFinancialStatementPdf(params: {
  kind: "profit-loss" | "balance-sheet" | "trial-balance";
  asOf?: string;
  from?: string;
  to?: string;
}) {
  await downloadAccountingBlob(
    `/api/admin/accounting/reports/export/pdf${qs(params)}`,
    `sarveda-${params.kind}.pdf`
  );
}

/* ─── Phase 7B production opening / cutover ─── */

export type OpeningStatus = {
  nativeAccountingEnabled: boolean;
  openingBalanceEnabled: boolean;
  productionLike: boolean;
  postedOpeningBatch: {
    id: string;
    batchNumber: string;
    postedAt: string | null;
  } | null;
  resetNotice: string;
  cutoverReady: boolean;
};

export type OpeningBatchRow = {
  id: string;
  batchNumber: string;
  effectiveDate: string;
  status: string;
  description: string | null;
  source: string;
  arApprovedZero: boolean;
  totalDebitInPaise: number;
  totalCreditInPaise: number;
  validatedAt: string | null;
  postedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type OpeningBatchDetail = OpeningBatchRow & {
  skuMappings: Array<Record<string, unknown>>;
  inventoryLines: Array<Record<string, unknown>>;
  bankLines: Array<Record<string, unknown>>;
  gatewayLines: Array<Record<string, unknown>>;
  apLines: Array<Record<string, unknown>>;
  arLines: Array<Record<string, unknown>>;
  gstLines: Array<Record<string, unknown>>;
  equityLines: Array<Record<string, unknown>>;
  equity3900Reason: string | null;
  equity3900Reviewer: string | null;
  equity3900Approved: boolean;
  validationSummary: Record<string, unknown> | null;
};

export type OpeningStagingPayload = {
  skuMappings?: Array<Record<string, unknown>>;
  inventoryLines?: Array<Record<string, unknown>>;
  bankLines?: Array<Record<string, unknown>>;
  gatewayLines?: Array<Record<string, unknown>>;
  apLines?: Array<Record<string, unknown>>;
  arLines?: Array<Record<string, unknown>>;
  gstLines?: Array<Record<string, unknown>>;
  equityLines?: Array<Record<string, unknown>>;
  arApprovedZero?: boolean;
  equity3900Reason?: string | null;
  equity3900Reviewer?: string | null;
  equity3900Approved?: boolean;
};

export type OpeningValidationResult = {
  batchId: string;
  status: "PASS" | "WARNING" | "FAIL" | "DATA_GAP";
  checks: Array<{
    code: string;
    status: string;
    message: string;
    expectedInPaise?: number | null;
    actualInPaise?: number | null;
    varianceInPaise?: number | null;
  }>;
  proposedDebitInPaise: number;
  proposedCreditInPaise: number;
  balanced: boolean;
};

export async function fetchOpeningStatus() {
  return accountingFetch<OpeningStatus>("/api/admin/accounting/opening/status");
}

export async function listOpeningBatches(limit = 25) {
  return accountingFetch<OpeningBatchRow[]>(`/api/admin/accounting/opening/batches?limit=${limit}`);
}

export async function createOpeningBatch(body: {
  effectiveDate: string;
  description?: string;
  source?: string;
  arApprovedZero?: boolean;
}) {
  return accountingFetch<OpeningBatchRow>("/api/admin/accounting/opening/batches", {
    method: "POST",
    body: JSON.stringify(body)
  });
}

export async function getOpeningBatch(batchId: string) {
  return accountingFetch<OpeningBatchDetail>(
    `/api/admin/accounting/opening/batches/${encodeURIComponent(batchId)}`
  );
}

export async function putOpeningStaging(batchId: string, body: OpeningStagingPayload) {
  return accountingFetch<OpeningBatchDetail>(
    `/api/admin/accounting/opening/batches/${encodeURIComponent(batchId)}/staging`,
    { method: "PUT", body: JSON.stringify(body) }
  );
}

export async function validateOpeningBatch(batchId: string) {
  return accountingFetch<{ ok: boolean; validation: OpeningValidationResult }>(
    `/api/admin/accounting/opening/batches/${encodeURIComponent(batchId)}/validate`,
    { method: "POST", body: JSON.stringify({}) }
  );
}

export async function previewOpeningBatch(batchId: string) {
  return accountingFetch<{
    batch: OpeningBatchDetail;
    validation: OpeningValidationResult;
    proposal: {
      lines: Array<{
        accountCode: string;
        debitInPaise: number;
        creditInPaise: number;
        memo: string;
      }>;
      totalDebitInPaise: number;
      totalCreditInPaise: number;
    };
  }>(`/api/admin/accounting/opening/batches/${encodeURIComponent(batchId)}/preview`, {
    method: "POST",
    body: JSON.stringify({})
  });
}

export async function postOpeningBatch(batchId: string) {
  return accountingFetch<{
    duplicate: boolean;
    batch: OpeningBatchDetail;
    journal: { id: string; entryNumber: string } | null;
    validation: OpeningValidationResult;
  }>(`/api/admin/accounting/opening/batches/${encodeURIComponent(batchId)}/post`, {
    method: "POST",
    body: JSON.stringify({})
  });
}

export function openingTemplateUrl(kind: string) {
  return `${getApiBase()}/api/admin/accounting/opening/templates/${encodeURIComponent(kind)}`;
}

export function exportOpeningReviewUrl(batchId: string) {
  return `${getApiBase()}/api/admin/accounting/opening/batches/${encodeURIComponent(batchId)}/export/review`;
}

export async function downloadOpeningReview(batchId: string) {
  await downloadAccountingBlob(
    `/api/admin/accounting/opening/batches/${encodeURIComponent(batchId)}/export/review`,
    `sarveda-opening-review-${batchId}.xlsx`
  );
}
