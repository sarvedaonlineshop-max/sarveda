import { prisma } from "../../config/db";

import type { ApAgingBucket } from "./ap-aging";
import { AP_AGING_BUCKET_LABELS } from "./ap-aging";
import { getCutoverConfigSummary } from "./accounting-cutover";
import {
  buildReconciliationV4BillRow,
  buildReconciliationV5ExpenseRow,
  type ReconciliationV4BillRow,
  type ReconciliationV5ExpenseRow
} from "./reconciliation.service";
import { VENDOR_PAYMENT_MADE_EVENT_TYPE, vendorPaymentMadeUniqueKey } from "./vendor-payment.constants";
import { hasPostedVendorPaymentEvent } from "./vendor-payment-outstanding";

export type PurchasePaymentReconciliationRow = {
  paymentId: string;
  paymentNumber: string;
  vendorId: string;
  vendorName: string;
  paymentDate: string;
  paymentMethod: string;
  utr: string | null;
  paidAccountCode: string;
  amountInPaise: number;
  allocatedInPaise: number;
  unallocatedInPaise: number;
  journalEntryNumber: string | null;
  journalEntryId: string | null;
  postingState: string;
  status: string;
  statusReason: string;
  warnings: string[];
  allocations: Array<{
    vendorBillId: string;
    billNumber: string;
    amountInPaise: number;
    vendorId: string;
    vendorName: string;
  }>;
};

export type PurchaseAccountingDashboard = {
  version: "purchase-v1";
  cutover: ReturnType<typeof getCutoverConfigSummary>;
  zohoComparisonNote: string;
  vendorBills: {
    totalNativeApRecognizedInPaise: number;
    totalNativePaidInPaise: number;
    totalNativeOutstandingInPaise: number;
    overdueOutstandingInPaise: number;
    billCount: number;
    postedApBillCount: number;
  };
  aging: Record<ApAgingBucket, { count: number; outstandingInPaise: number }>;
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

export async function buildVendorPaymentReconciliationRow(
  paymentId: string
): Promise<PurchasePaymentReconciliationRow> {
  const payment = await prisma.accountingVendorPayment.findUnique({
    where: { id: paymentId },
    include: {
      vendor: { select: { id: true, name: true } },
      allocations: true
    }
  });
  if (!payment) {
    throw new Error(`Vendor payment not found: ${paymentId}`);
  }

  const billIds = payment.allocations.map((a) => a.vendorBillId);
  const bills =
    billIds.length > 0
      ? await prisma.vendorBill.findMany({
          where: { id: { in: billIds } },
          select: {
            id: true,
            billNumber: true,
            vendorId: true,
            vendor: { select: { name: true } }
          }
        })
      : [];
  const billById = new Map(bills.map((b) => [b.id, b]));

  const event = await prisma.accountingPostingEvent.findUnique({
    where: {
      eventType_uniqueKey: {
        eventType: VENDOR_PAYMENT_MADE_EVENT_TYPE,
        uniqueKey: vendorPaymentMadeUniqueKey(paymentId)
      }
    },
    include: { journalEntry: { select: { id: true, entryNumber: true } } }
  });

  const allocatedInPaise = payment.allocations.reduce((s, a) => s + a.amountInPaise, 0);
  const unallocatedInPaise = Math.max(0, payment.amountInPaise - allocatedInPaise);
  const hasJournal = event?.status === "POSTED" && !!event.journalEntry;
  const warnings: string[] = [];

  let status = "DATA_GAP";
  let statusReason = `Ops payment status: ${payment.status}`;

  if (payment.status === "VOID") {
    status = "VOID";
    statusReason = "Payment voided";
  } else if (hasJournal) {
    if (unallocatedInPaise > 2) {
      status = "UNDER_ALLOCATED";
      statusReason = "Payment amount exceeds bill allocations";
      warnings.push("UNDER/UNALLOCATED");
    } else if (allocatedInPaise > payment.amountInPaise + 2) {
      status = "OVER_ALLOCATED";
      statusReason = "Allocations exceed payment amount";
      warnings.push("OVERPAID");
    } else {
      status = "MATCHED";
      statusReason = "VENDOR_PAYMENT_MADE journal present";
    }
  } else if (payment.status === "POSTED") {
    status = "MISSING_AP_JOURNAL";
    statusReason = "Payment POSTED but no accounting journal";
    warnings.push("MISSING_AP_JOURNAL");
  } else if (payment.status === "DRAFT") {
    status = "DRAFT";
    statusReason = "Draft — not posted";
  }

  for (const a of payment.allocations) {
    const bill = billById.get(a.vendorBillId);
    if (bill && bill.vendorId !== payment.vendorId) {
      status = "WRONG_VENDOR";
      statusReason = "Allocation bill vendor differs from payment vendor";
      warnings.push("WRONG_VENDOR");
      break;
    }
  }

  return {
    paymentId: payment.id,
    paymentNumber: payment.paymentNumber,
    vendorId: payment.vendor.id,
    vendorName: payment.vendor.name,
    paymentDate: payment.paymentDate.toISOString(),
    paymentMethod: payment.paymentMethod,
    utr: payment.utr,
    paidAccountCode: payment.paidAccountCode,
    amountInPaise: payment.amountInPaise,
    allocatedInPaise,
    unallocatedInPaise,
    journalEntryNumber: event?.journalEntry?.entryNumber ?? null,
    journalEntryId: event?.journalEntry?.id ?? null,
    postingState: event?.status ?? "NONE",
    status,
    statusReason,
    warnings: [...new Set(warnings)],
    allocations: payment.allocations.map((a) => {
      const bill = billById.get(a.vendorBillId);
      return {
        vendorBillId: a.vendorBillId,
        billNumber: bill?.billNumber ?? a.vendorBillId,
        amountInPaise: a.amountInPaise,
        vendorId: bill?.vendorId ?? payment.vendorId,
        vendorName: bill?.vendor.name ?? payment.vendor.name
      };
    })
  };
}

function emptyAgingTotals(): Record<ApAgingBucket, { count: number; outstandingInPaise: number }> {
  return {
    CURRENT: { count: 0, outstandingInPaise: 0 },
    "1_30": { count: 0, outstandingInPaise: 0 },
    "31_60": { count: 0, outstandingInPaise: 0 },
    "61_90": { count: 0, outstandingInPaise: 0 },
    OVER_90: { count: 0, outstandingInPaise: 0 },
    PAID: { count: 0, outstandingInPaise: 0 }
  };
}

export async function buildPurchaseAccountingDashboard(opts?: {
  billLimit?: number;
  expenseLimit?: number;
}): Promise<PurchaseAccountingDashboard> {
  const billLimit = opts?.billLimit ?? 500;
  const expenseLimit = opts?.expenseLimit ?? 500;

  const [bills, expenses, payments] = await Promise.all([
    prisma.vendorBill.findMany({
      where: { status: { in: ["OPEN", "PAID"] } },
      select: { id: true },
      orderBy: { billDate: "desc" },
      take: billLimit
    }),
    prisma.expense.findMany({
      where: { status: { in: ["RECORDED", "DRAFT"] } },
      select: { id: true },
      orderBy: { expenseDate: "desc" },
      take: expenseLimit
    }),
    prisma.accountingVendorPayment.findMany({
      where: { status: { in: ["DRAFT", "POSTED"] } },
      select: { id: true, status: true, amountInPaise: true },
      take: 500
    })
  ]);

  const billRows: ReconciliationV4BillRow[] = [];
  for (const b of bills) {
    billRows.push(await buildReconciliationV4BillRow(b.id));
  }

  const expenseRows: ReconciliationV5ExpenseRow[] = [];
  for (const e of expenses) {
    expenseRows.push(await buildReconciliationV5ExpenseRow(e.id));
  }

  const aging = emptyAgingTotals();
  let totalNativeAp = 0;
  let totalNativePaid = 0;
  let totalNativeOutstanding = 0;
  let overdueOutstanding = 0;
  let postedApBillCount = 0;

  for (const row of billRows) {
    totalNativeAp += row.apCreditInPaise;
    totalNativePaid += row.nativeVendorPaymentInPaise;
    totalNativeOutstanding += row.outstandingNativeApInPaise;
    if (row.overdue) overdueOutstanding += row.outstandingNativeApInPaise;
    if (row.apCreditInPaise > 0) postedApBillCount += 1;
    if (row.agingBucket) {
      aging[row.agingBucket].count += 1;
      if (row.agingBucket !== "PAID") {
        aging[row.agingBucket].outstandingInPaise += row.outstandingNativeApInPaise;
      }
    }
  }

  let totalPostedExpense = 0;
  let postedExpenseCount = 0;
  let unmappedCount = 0;
  let gstGapCount = 0;
  let duplicateRiskCount = 0;
  let preCutoverExpenseCount = 0;
  let sourceChangedExpenseCount = 0;
  let unmappedAccountCount = 0;
  let unmappedPaymentCount = 0;

  for (const row of expenseRows) {
    if (row.status === "POSTED") {
      postedExpenseCount += 1;
      totalPostedExpense += row.grossPaymentInPaise ?? row.amountInPaise;
    }
    if (
      row.historicalClassification === "NEEDS_ACCOUNT_MAPPING" ||
      row.status === "UNMAPPED_EXPENSE_ACCOUNT"
    ) {
      unmappedAccountCount += 1;
      unmappedCount += 1;
    }
    if (
      row.historicalClassification === "NEEDS_PAYMENT_MAPPING" ||
      row.status === "UNMAPPED_PAYMENT_ACCOUNT"
    ) {
      unmappedPaymentCount += 1;
      unmappedCount += 1;
    }
    if (row.historicalClassification === "GST_DATA_GAP" || row.status === "GST_DATA_GAP") gstGapCount += 1;
    if (row.historicalClassification === "DUPLICATE_RISK" || row.duplicateClass !== "NO_DUPLICATE") {
      duplicateRiskCount += 1;
    }
    if (row.historicalClassification === "PRE_CUTOVER") preCutoverExpenseCount += 1;
    if (row.sourceChangedAfterPost) sourceChangedExpenseCount += 1;
  }

  const opsPaidNativeUnpaid = billRows.filter((r) => r.status === "OPS_PAID_NATIVE_UNPAID").length;
  const opsPartialNativeUnpaid = billRows.filter((r) => r.status === "OPS_PARTIAL_NATIVE_UNPAID").length;
  const opsMismatch = billRows.filter((r) => r.status === "OPS_NATIVE_PAYMENT_MISMATCH").length;
  const sourceChangedBill = billRows.filter((r) => r.sourceChangedAfterPost).length;
  const billExpenseDup = billRows.filter(
    (r) => r.billExpenseDuplicateClass !== "NO_DUPLICATE"
  ).length;

  let overallocatedCount = 0;
  let missingJournalCount = 0;
  for (const p of payments) {
    if (p.status === "POSTED") {
      const has = await hasPostedVendorPaymentEvent(p.id);
      if (!has) missingJournalCount += 1;
    }
  }
  for (const p of payments.filter((x) => x.status === "POSTED")) {
    const row = await buildVendorPaymentReconciliationRow(p.id);
    if (row.status === "UNDER_ALLOCATED" || row.status === "OVER_ALLOCATED") overallocatedCount += 1;
  }

  return {
    version: "purchase-v1",
    cutover: getCutoverConfigSummary(),
    zohoComparisonNote:
      "Zoho Books AP/expense totals are authoritative in shadow mode. Local Zoho figures are DATA_GAP unless imported.",
    vendorBills: {
      totalNativeApRecognizedInPaise: totalNativeAp,
      totalNativePaidInPaise: totalNativePaid,
      totalNativeOutstandingInPaise: totalNativeOutstanding,
      overdueOutstandingInPaise: overdueOutstanding,
      billCount: billRows.length,
      postedApBillCount
    },
    aging,
    expenses: {
      totalPostedStandaloneInPaise: totalPostedExpense,
      postedCount: postedExpenseCount,
      unmappedCount,
      gstDataGapCount: gstGapCount,
      duplicateRiskCount,
      preCutoverCount: preCutoverExpenseCount
    },
    dataQuality: {
      opsPaidNativeUnpaidCount: opsPaidNativeUnpaid,
      opsPartialNativeUnpaidCount: opsPartialNativeUnpaid,
      opsNativePaymentMismatchCount: opsMismatch,
      sourceChangedBillCount: sourceChangedBill,
      sourceChangedExpenseCount,
      unmappedExpenseAccountCount: unmappedAccountCount,
      unmappedPaymentAccountCount: unmappedPaymentCount,
      billExpenseDuplicateRiskCount: billExpenseDup
    },
    payments: {
      postedCount: payments.filter((p) => p.status === "POSTED").length,
      draftCount: payments.filter((p) => p.status === "DRAFT").length,
      overallocatedCount,
      missingJournalCount
    }
  };
}

export type PurchaseReconciliationReport = {
  version: "purchase-recon-v5";
  cutover: ReturnType<typeof getCutoverConfigSummary>;
  dashboard: PurchaseAccountingDashboard;
  bills: ReconciliationV4BillRow[];
  expenses: ReconciliationV5ExpenseRow[];
  payments: PurchasePaymentReconciliationRow[];
  agingLabels: typeof AP_AGING_BUCKET_LABELS;
};

export async function buildPurchaseReconciliationReport(opts?: {
  billIds?: string[];
  expenseIds?: string[];
  paymentIds?: string[];
  since?: Date;
  until?: Date;
  limit?: number;
}): Promise<PurchaseReconciliationReport> {
  const limit = opts?.limit ?? 100;
  const since = opts?.since ?? new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const until = opts?.until ?? new Date();

  let billIds = opts?.billIds;
  let expenseIds = opts?.expenseIds;
  let paymentIds = opts?.paymentIds;

  if (!billIds) {
    const rows = await prisma.vendorBill.findMany({
      where: {
        status: { in: ["OPEN", "PAID", "DRAFT"] },
        billDate: { gte: since, lte: until }
      },
      select: { id: true },
      orderBy: { billDate: "desc" },
      take: limit
    });
    billIds = rows.map((r) => r.id);
  }

  if (!expenseIds) {
    const rows = await prisma.expense.findMany({
      where: {
        status: { in: ["RECORDED", "DRAFT"] },
        expenseDate: { gte: since, lte: until }
      },
      select: { id: true },
      orderBy: { expenseDate: "desc" },
      take: limit
    });
    expenseIds = rows.map((r) => r.id);
  }

  if (!paymentIds) {
    const rows = await prisma.accountingVendorPayment.findMany({
      where: {
        status: { in: ["DRAFT", "POSTED"] },
        paymentDate: { gte: since, lte: until }
      },
      select: { id: true },
      orderBy: { paymentDate: "desc" },
      take: limit
    });
    paymentIds = rows.map((r) => r.id);
  }

  const bills: ReconciliationV4BillRow[] = [];
  for (const id of billIds) {
    bills.push(await buildReconciliationV4BillRow(id));
  }
  const expenses: ReconciliationV5ExpenseRow[] = [];
  for (const id of expenseIds) {
    expenses.push(await buildReconciliationV5ExpenseRow(id));
  }
  const payments: PurchasePaymentReconciliationRow[] = [];
  for (const id of paymentIds) {
    payments.push(await buildVendorPaymentReconciliationRow(id));
  }

  const dashboard = await buildPurchaseAccountingDashboard({
    billLimit: Math.max(billIds.length, 50),
    expenseLimit: Math.max(expenseIds.length, 50)
  });

  return {
    version: "purchase-recon-v5",
    cutover: getCutoverConfigSummary(),
    dashboard,
    bills,
    expenses,
    payments,
    agingLabels: AP_AGING_BUCKET_LABELS
  };
}
