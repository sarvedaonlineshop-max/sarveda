import { gstFromInclusiveLine, gstRatePercent } from "../../utils/gst";

import { prisma } from "../../config/db";

import { buildOrderPaidJournal } from "./order-paid-journal.builder";
import type { OrderPaidSnapshot } from "./order-paid-journal.types";
import { ORDER_PAID_EVENT_TYPE, orderPaidUniqueKey } from "./order-paid.constants";
import { evaluateFullRefundEligibility } from "./order-refunded-full-eligibility";
import {
  ORDER_REFUNDED_FULL_EVENT_TYPE,
  orderRefundedFullUniqueKey
} from "./order-refunded-full.constants";
import type { FullRefundEligibilityCode } from "./order-refunded-full.types";
import { loadOrderRefundContextByOrderId } from "./order-refund-snapshot.service";
import { getPostingEvent } from "./posting-event.service";
import { previewOrderPaidJournal } from "./order-paid-posting.service";
import { previewOrderRefundedFull } from "./order-refunded-full-posting.service";

export type ReconciliationStatus =
  | "MATCHED"
  | "EXPECTED_VARIANCE"
  | "UNSETTLED"
  | "UNPOSTED_PARTIAL"
  | "CUMULATIVE_FULL_BUT_UNALLOCATED"
  | "MULTIPLE_REFUNDS_UNALLOCATED"
  | "DATA_GAP"
  | "ERROR"
  | "SALE_JOURNAL_REQUIRED"
  | "PENDING_REFUND_POST"
  | "NO_REFUND"
  | "PARTIALLY_SETTLED"
  | "SETTLEMENT_MISMATCH"
  | "FEE_MISMATCH"
  | "REFUND_PENDING"
  | "UNMAPPED";

export type ReconciliationRow = {
  orderId: string;
  orderNumber: string;
  provider: string;
  grandTotalInPaise: number;
  discountInPaise: number;
  shippingInPaise: number;
  native: {
    taxableValuePaise: number | null;
    cgstPaise: number | null;
    sgstPaise: number | null;
    igstPaise: number | null;
    totalGstPaise: number | null;
    netRevenuePaise: number | null;
    journalDebitPaise: number | null;
    journalCreditPaise: number | null;
    journalEntryNumber: string | null;
    journalStatus: string | null;
    postingEventStatus: string | null;
    zohoMerchandiseVariancePaise: number | null;
  };
  sarvedaPdfBasis: {
    taxableValuePaise: number | null;
    gstTotalPaise: number | null;
    varianceVsNativeTaxablePaise: number | null;
  };
  zoho: {
    invoiceId: string | null;
    invoiceNo: string | null;
    invoiceTotalPaise: null;
    taxInfo: string;
  };
  eligibility: { eligible: boolean; reason?: string; code?: string };
  buildError?: string;
};

export type ReconciliationV2Row = {
  orderId: string;
  orderNumber: string;
  status: ReconciliationStatus;
  statusReason: string;
  commerce: {
    provider: string;
    grandTotalInPaise: number;
    orderStatus: string;
    paymentStatus: string;
    refundedInPaise: number;
  };
  refundData: {
    rows: Array<{
      id: string;
      amountInPaise: number;
      status: string;
      providerRefundId: string | null;
      createdAt: string;
    }>;
    monetaryCount: number;
    monetaryTotalPaise: number;
    eligibilityCode: FullRefundEligibilityCode;
  };
  nativeSale: {
    eventStatus: string | null;
    journalEntryNumber: string | null;
    calcVersion: string | null;
    debitPaise: number | null;
    creditPaise: number | null;
    taxablePaise: number | null;
    gstTotalPaise: number | null;
    discountContraPaise: number | null;
    shippingPaise: number | null;
  };
  nativeRefund: {
    eventStatus: string | null;
    journalEntryNumber: string | null;
    calcVersion: string | null;
    debitPaise: number | null;
    creditPaise: number | null;
    refundId: string | null;
    providerRefundId: string | null;
  };
  zoho: {
    invoiceId: string | null;
    invoiceNo: string | null;
    creditNoteId: string | null;
    creditNoteNumber: string | null;
  };
  clearing: {
    accountCode: string | null;
    saleClearingDebitPaise: number | null;
    refundClearingCreditPaise: number | null;
    impliedUnreconciledBalancePaise: number | null;
    label: "UNSETTLED_PROVISIONAL" | "NONE";
  };
};

function pdfBasisForSnapshot(snapshot: OrderPaidSnapshot) {
  const isGst =
    snapshot.shippingCountry.trim().toUpperCase() === "IN" && snapshot.currency === "INR";
  if (!isGst) return { taxablePaise: snapshot.subtotalInPaise, gstTotalPaise: 0 };

  let taxablePaise = 0;
  let gstTotalPaise = 0;
  for (const line of snapshot.lines) {
    const rate = gstRatePercent(line.taxClass);
    const extracted = gstFromInclusiveLine(line.lineTotalInPaise, rate);
    taxablePaise += extracted.taxableMinor;
    gstTotalPaise += extracted.taxMinor;
  }
  return { taxablePaise, gstTotalPaise };
}

function mapReconStatus(
  eligibilityCode: FullRefundEligibilityCode,
  salePosted: boolean,
  refundPosted: boolean,
  hasMonetaryRefund: boolean
): { status: ReconciliationStatus; statusReason: string } {
  if (eligibilityCode === "REFUND_AMOUNT_EXCEEDS_TOTAL" || eligibilityCode === "INCONSISTENT_PAYMENT_STATUS") {
    return { status: "ERROR", statusReason: eligibilityCode };
  }
  if (eligibilityCode === "UNPOSTED_PARTIAL") {
    return { status: "UNPOSTED_PARTIAL", statusReason: eligibilityCode };
  }
  if (eligibilityCode === "CUMULATIVE_FULL_BUT_UNALLOCATED") {
    return { status: "CUMULATIVE_FULL_BUT_UNALLOCATED", statusReason: eligibilityCode };
  }
  if (eligibilityCode === "MULTIPLE_REFUNDS_UNALLOCATED") {
    return { status: "MULTIPLE_REFUNDS_UNALLOCATED", statusReason: eligibilityCode };
  }
  if (eligibilityCode === "NO_AUTHORITATIVE_REFUND" && !hasMonetaryRefund) {
    return {
      status: salePosted ? "NO_REFUND" : "DATA_GAP",
      statusReason: "No monetary Refund row"
    };
  }
  if (eligibilityCode === "SALE_JOURNAL_REQUIRED") {
    return { status: "SALE_JOURNAL_REQUIRED", statusReason: eligibilityCode };
  }
  if (eligibilityCode === "COD_NOT_AUTO_POSTABLE") {
    return { status: "DATA_GAP", statusReason: eligibilityCode };
  }
  if (
    eligibilityCode === "DATA_GAP" ||
    eligibilityCode === "MISSING_PROVIDER_REFUND_ID" ||
    eligibilityCode === "REFUND_NOT_PROCESSED" ||
    eligibilityCode === "PROVIDER_NOT_SUPPORTED"
  ) {
    return { status: "DATA_GAP", statusReason: eligibilityCode };
  }

  if (eligibilityCode === "AUTO_POSTABLE_FULL") {
    if (salePosted && refundPosted) {
      return {
        status: "UNSETTLED",
        statusReason: "Sale + full refund posted; clearing provisional until settlement import"
      };
    }
    if (salePosted && !refundPosted) {
      return { status: "PENDING_REFUND_POST", statusReason: "Eligible full refund not yet posted" };
    }
  }

  if (salePosted && !hasMonetaryRefund) {
    return { status: "UNSETTLED", statusReason: "Sale posted; no refund; clearing unsettled" };
  }

  return { status: "EXPECTED_VARIANCE", statusReason: eligibilityCode };
}

export async function buildReconciliationRow(
  snapshot: OrderPaidSnapshot
): Promise<ReconciliationRow> {
  const preview = await previewOrderPaidJournal(snapshot);
  const uniqueKey = orderPaidUniqueKey(snapshot.orderId);
  const postingEvent =
    preview.postingEvent ??
    (await getPostingEvent(ORDER_PAID_EVENT_TYPE, uniqueKey));

  const pdf = pdfBasisForSnapshot(snapshot);
  const proposal = preview.proposal;

  return {
    orderId: snapshot.orderId,
    orderNumber: snapshot.orderNumber,
    provider: snapshot.payment.provider,
    grandTotalInPaise: snapshot.grandTotalInPaise,
    discountInPaise: snapshot.discountInPaise,
    shippingInPaise: snapshot.shippingInPaise,
    native: {
      taxableValuePaise: proposal?.diagnostics.postDiscountTaxablePaise ?? null,
      cgstPaise: proposal?.diagnostics.outputCgstPaise ?? null,
      sgstPaise: proposal?.diagnostics.outputSgstPaise ?? null,
      igstPaise: proposal?.diagnostics.outputIgstPaise ?? null,
      totalGstPaise: proposal?.diagnostics.outputGstTotalPaise ?? null,
      netRevenuePaise: proposal
        ? proposal.diagnostics.postDiscountTaxablePaise + proposal.diagnostics.shippingPaise
        : null,
      journalDebitPaise: proposal?.totalDebitPaise ?? null,
      journalCreditPaise: proposal?.totalCreditPaise ?? null,
      journalEntryNumber: postingEvent?.journalEntry?.entryNumber ?? null,
      journalStatus: postingEvent?.journalEntry?.status ?? null,
      postingEventStatus: postingEvent?.status ?? null,
      zohoMerchandiseVariancePaise:
        proposal?.diagnostics.zohoParity?.merchandiseVariancePaise ?? null
    },
    sarvedaPdfBasis: {
      taxableValuePaise: pdf.taxablePaise,
      gstTotalPaise: pdf.gstTotalPaise,
      varianceVsNativeTaxablePaise: proposal
        ? pdf.taxablePaise - proposal.diagnostics.postDiscountTaxablePaise
        : null
    },
    zoho: {
      invoiceId: snapshot.zohoInvoiceId ?? null,
      invoiceNo: snapshot.zohoInvoiceNo ?? null,
      invoiceTotalPaise: null,
      taxInfo: snapshot.zohoInvoiceId ? "LOCAL_REFERENCE_ONLY" : "NOT_AVAILABLE_LOCALLY"
    },
    eligibility: preview.eligibility,
    buildError: preview.buildError?.message
  };
}

export async function buildReconciliationReport(snapshots: OrderPaidSnapshot[]) {
  const rows: ReconciliationRow[] = [];
  for (const snapshot of snapshots) {
    rows.push(await buildReconciliationRow(snapshot));
  }
  return { rows, count: rows.length };
}

/** Lightweight preview-only reconciliation without posting-event DB read per row when proposal exists. */
export function buildReconciliationRowFromProposal(
  snapshot: OrderPaidSnapshot,
  proposal: ReturnType<typeof buildOrderPaidJournal> | null,
  eligibility: { eligible: boolean; reason?: string; code?: string },
  buildError?: string
): ReconciliationRow {
  const pdf = pdfBasisForSnapshot(snapshot);
  return {
    orderId: snapshot.orderId,
    orderNumber: snapshot.orderNumber,
    provider: snapshot.payment.provider,
    grandTotalInPaise: snapshot.grandTotalInPaise,
    discountInPaise: snapshot.discountInPaise,
    shippingInPaise: snapshot.shippingInPaise,
    native: {
      taxableValuePaise: proposal?.diagnostics.postDiscountTaxablePaise ?? null,
      cgstPaise: proposal?.diagnostics.outputCgstPaise ?? null,
      sgstPaise: proposal?.diagnostics.outputSgstPaise ?? null,
      igstPaise: proposal?.diagnostics.outputIgstPaise ?? null,
      totalGstPaise: proposal?.diagnostics.outputGstTotalPaise ?? null,
      netRevenuePaise: proposal
        ? proposal.diagnostics.postDiscountTaxablePaise + proposal.diagnostics.shippingPaise
        : null,
      journalDebitPaise: proposal?.totalDebitPaise ?? null,
      journalCreditPaise: proposal?.totalCreditPaise ?? null,
      journalEntryNumber: null,
      journalStatus: null,
      postingEventStatus: null,
      zohoMerchandiseVariancePaise:
        proposal?.diagnostics.zohoParity?.merchandiseVariancePaise ?? null
    },
    sarvedaPdfBasis: {
      taxableValuePaise: pdf.taxablePaise,
      gstTotalPaise: pdf.gstTotalPaise,
      varianceVsNativeTaxablePaise: proposal
        ? pdf.taxablePaise - proposal.diagnostics.postDiscountTaxablePaise
        : null
    },
    zoho: {
      invoiceId: snapshot.zohoInvoiceId ?? null,
      invoiceNo: snapshot.zohoInvoiceNo ?? null,
      invoiceTotalPaise: null,
      taxInfo: snapshot.zohoInvoiceId ? "LOCAL_REFERENCE_ONLY" : "NOT_AVAILABLE_LOCALLY"
    },
    eligibility,
    buildError
  };
}

/** Phase 2C Reconciliation V2 — sale + refund lifecycle. */
export async function buildReconciliationV2Row(orderId: string): Promise<ReconciliationV2Row> {
  const ctx = await loadOrderRefundContextByOrderId(orderId);
  const eligibility = evaluateFullRefundEligibility(ctx);
  const saleEvent = await getPostingEvent(ORDER_PAID_EVENT_TYPE, orderPaidUniqueKey(orderId));
  const refundEvent = await getPostingEvent(
    ORDER_REFUNDED_FULL_EVENT_TYPE,
    orderRefundedFullUniqueKey(orderId)
  );

  const refundPreview = await previewOrderRefundedFull(ctx);
  const salePosted = saleEvent?.status === "POSTED" && Boolean(saleEvent.journalEntry);
  const refundPosted = refundEvent?.status === "POSTED" && Boolean(refundEvent.journalEntry);

  const { status, statusReason } = mapReconStatus(
    eligibility.code,
    salePosted,
    refundPosted,
    eligibility.monetaryRefundCount > 0
  );

  const saleDiag = ctx.originalSale?.diagnostics ?? null;
  const clearingCode = refundPreview.proposal?.diagnostics.clearingAccountCode
    ?? (ctx.originalSale?.lines.find((l) => l.debitInPaise > 0)?.accountCode ?? null);

  const saleClearingDebit =
    refundPreview.proposal?.diagnostics.saleClearingDebitPaise
    ?? ctx.originalSale?.lines.find((l) => l.accountCode === clearingCode)?.debitInPaise
    ?? null;

  const refundClearingCredit =
    refundPreview.proposal?.diagnostics.refundClearingCreditPaise
    ?? (refundPosted && saleClearingDebit != null ? saleClearingDebit : null);

  const impliedBalance =
    saleClearingDebit != null
      ? saleClearingDebit - (refundClearingCredit ?? 0)
      : null;

  return {
    orderId: ctx.orderId,
    orderNumber: ctx.orderNumber,
    status,
    statusReason,
    commerce: {
      provider: ctx.provider,
      grandTotalInPaise: ctx.grandTotalInPaise,
      orderStatus: ctx.orderStatus,
      paymentStatus: ctx.paymentStatusDetail,
      refundedInPaise: ctx.refundedInPaise
    },
    refundData: {
      rows: ctx.refunds.map((r) => ({
        id: r.id,
        amountInPaise: r.amountInPaise,
        status: r.status,
        providerRefundId: r.providerRefundId,
        createdAt: r.createdAt.toISOString()
      })),
      monetaryCount: eligibility.monetaryRefundCount,
      monetaryTotalPaise: eligibility.monetaryRefundTotalPaise,
      eligibilityCode: eligibility.code
    },
    nativeSale: {
      eventStatus: saleEvent?.status ?? null,
      journalEntryNumber: saleEvent?.journalEntry?.entryNumber ?? null,
      calcVersion: ctx.originalSale?.calcVersion ?? null,
      debitPaise: saleEvent?.journalEntry?.totalDebitInPaise ?? null,
      creditPaise: saleEvent?.journalEntry?.totalCreditInPaise ?? null,
      taxablePaise: saleDiag?.postDiscountTaxablePaise ?? null,
      gstTotalPaise: saleDiag?.outputGstTotalPaise ?? null,
      discountContraPaise: saleDiag?.discountTaxableContraPaise ?? null,
      shippingPaise: saleDiag?.shippingPaise ?? null
    },
    nativeRefund: {
      eventStatus: refundEvent?.status ?? null,
      journalEntryNumber: refundEvent?.journalEntry?.entryNumber ?? null,
      calcVersion: refundPreview.proposal?.calcVersion ?? null,
      debitPaise: refundEvent?.journalEntry?.totalDebitInPaise ?? null,
      creditPaise: refundEvent?.journalEntry?.totalCreditInPaise ?? null,
      refundId: eligibility.candidateRefundId ?? null,
      providerRefundId:
        ctx.refunds.find((r) => r.id === eligibility.candidateRefundId)?.providerRefundId ?? null
    },
    zoho: {
      invoiceId: ctx.zohoInvoiceId,
      invoiceNo: ctx.zohoInvoiceNo,
      creditNoteId: ctx.zohoCreditNoteId,
      creditNoteNumber: ctx.zohoCreditNoteNumber
    },
    clearing: {
      accountCode: clearingCode,
      saleClearingDebitPaise: saleClearingDebit,
      refundClearingCreditPaise: refundClearingCredit,
      impliedUnreconciledBalancePaise: impliedBalance,
      label: salePosted ? "UNSETTLED_PROVISIONAL" : "NONE"
    }
  };
}

export async function buildReconciliationV2Report(orderIds: string[]) {
  const rows: ReconciliationV2Row[] = [];
  for (const orderId of orderIds) {
    rows.push(await buildReconciliationV2Row(orderId));
  }
  return { rows, count: rows.length, version: "v2" as const };
}

export type ReconciliationV3Row = ReconciliationV2Row & {
  version: "v3";
  settlement: {
    allocations: Array<{
      providerSettlementId: string;
      utr: string | null;
      lineType: string;
      amountInPaise: number;
      feeInPaise: number;
      taxInPaise: number;
      mappingStatus: string;
      journalEntryNumber: string | null;
      gstItcStatus: string;
    }>;
    feeInPaise: number;
    taxInPaise: number;
    netAllocatedPaise: number;
    remainingClearingPaise: number | null;
    status: ReconciliationStatus;
    statusReason: string;
  };
};

export async function buildReconciliationV3Row(orderId: string): Promise<ReconciliationV3Row> {
  const v2 = await buildReconciliationV2Row(orderId);
  const lines = await prisma.accountingGatewaySettlementLine.findMany({
    where: { orderId },
    include: {
      settlement: {
        include: { journalEntry: { select: { entryNumber: true } } }
      }
    },
    orderBy: { createdAt: "asc" }
  });

  const allocations = lines.map((l) => ({
    providerSettlementId: l.settlement.providerSettlementId,
    utr: l.settlement.utr,
    lineType: l.lineType,
    amountInPaise: l.amountInPaise,
    feeInPaise: l.feeInPaise,
    taxInPaise: l.taxInPaise,
    mappingStatus: l.mappingStatus,
    journalEntryNumber: l.settlement.journalEntry?.entryNumber ?? null,
    gstItcStatus: l.settlement.gstItcStatus
  }));

  const feeInPaise = allocations.reduce((s, a) => s + a.feeInPaise, 0);
  const taxInPaise = allocations.reduce((s, a) => s + a.taxInPaise, 0);
  const paymentSettled = allocations
    .filter((a) => a.lineType === "PAYMENT")
    .reduce((s, a) => s + a.amountInPaise, 0);
  const refundSettled = allocations
    .filter((a) => a.lineType === "REFUND")
    .reduce((s, a) => s + a.amountInPaise, 0);

  const saleClearing = v2.clearing.saleClearingDebitPaise ?? 0;
  const refundClearing = v2.clearing.refundClearingCreditPaise ?? 0;
  // After settlement: remaining ≈ sale - refund - paymentSettled + refundSettled
  const remainingClearingPaise =
    saleClearing - refundClearing - paymentSettled + refundSettled;

  let status: ReconciliationStatus = v2.status;
  let statusReason = v2.statusReason;

  if (allocations.some((a) => a.mappingStatus !== "MAPPED" && a.lineType === "PAYMENT")) {
    status = "UNMAPPED";
    statusReason = "Settlement line has unmapped payment";
  } else if (lines.some((l) => l.settlement.status === "MISMATCH")) {
    status = "SETTLEMENT_MISMATCH";
    statusReason = "Settlement source mismatch";
  } else if (Math.abs(remainingClearingPaise) <= 2 && paymentSettled > 0) {
    status = "MATCHED";
    statusReason = "Clearing reconciled via settlement";
  } else if (paymentSettled > 0 && Math.abs(remainingClearingPaise) > 2) {
    status = "PARTIALLY_SETTLED";
    statusReason = "Partial settlement allocation vs clearing";
  } else if (refundClearing > 0 && paymentSettled > 0 && refundSettled === 0) {
    status = "REFUND_PENDING";
    statusReason = "Refund posted; settlement reclaim not yet seen";
  } else if (v2.clearing.label === "UNSETTLED_PROVISIONAL" && paymentSettled === 0) {
    status = "UNSETTLED";
    statusReason = statusReason || "Awaiting settlement";
  }

  return {
    ...v2,
    version: "v3",
    clearing: {
      ...v2.clearing,
      impliedUnreconciledBalancePaise: remainingClearingPaise,
      label:
        status === "MATCHED"
          ? "NONE"
          : v2.clearing.label
    },
    settlement: {
      allocations,
      feeInPaise,
      taxInPaise,
      netAllocatedPaise: paymentSettled - refundSettled - feeInPaise - taxInPaise,
      remainingClearingPaise,
      status,
      statusReason
    },
    status,
    statusReason
  };
}

export async function buildReconciliationV3Report(orderIds: string[]) {
  const rows: ReconciliationV3Row[] = [];
  for (const orderId of orderIds) {
    rows.push(await buildReconciliationV3Row(orderId));
  }
  return { rows, count: rows.length, version: "v3" as const };
}

export async function buildSettlementBatchReconciliation(providerSettlementId: string) {
  const settlement = await prisma.accountingGatewaySettlement.findUnique({
    where: {
      provider_providerSettlementId: {
        provider: "RAZORPAY",
        providerSettlementId
      }
    },
    include: {
      lines: { orderBy: { sortOrder: "asc" } },
      journalEntry: true
    }
  });
  if (!settlement) return null;

  return {
    providerSettlementId: settlement.providerSettlementId,
    settledAt: settlement.settledAt,
    utr: settlement.utr,
    currency: settlement.currency,
    grossInPaise: settlement.grossInPaise,
    feeInPaise: settlement.feeInPaise,
    taxInPaise: settlement.taxInPaise,
    netInPaise: settlement.netInPaise,
    status: settlement.status,
    gstItcStatus: settlement.gstItcStatus,
    journalEntryNumber: settlement.journalEntry?.entryNumber ?? null,
    lines: settlement.lines.map((l) => ({
      lineType: l.lineType,
      providerEntityId: l.providerEntityId,
      amountInPaise: l.amountInPaise,
      feeInPaise: l.feeInPaise,
      taxInPaise: l.taxInPaise,
      debitInPaise: l.debitInPaise,
      creditInPaise: l.creditInPaise,
      mappingStatus: l.mappingStatus,
      paymentId: l.paymentId,
      orderId: l.orderId
    })),
    mappedPayments: settlement.lines.filter((l) => l.lineType === "PAYMENT" && l.mappingStatus === "MAPPED")
      .length,
    mappedRefunds: settlement.lines.filter((l) => l.lineType === "REFUND" && l.mappingStatus === "MAPPED")
      .length,
    unmapped: settlement.lines.filter((l) => l.mappingStatus !== "MAPPED").length
  };
}

export type ReconciliationV4BillRow = {
  version: "v4" | "v5";
  billId: string;
  billNumber: string;
  referenceNumber: string | null;
  vendorId: string;
  vendorName: string;
  vendorGstin: string | null;
  billDate: string;
  dueDate: string | null;
  purchaseOrderId: string | null;
  purchaseOrderNumber: string | null;
  billTotalInPaise: number;
  taxInPaise: number;
  stockClearingInPaise: number;
  expenseInPaise: number;
  inputCgstInPaise: number;
  inputSgstInPaise: number;
  inputIgstInPaise: number;
  journalEntryNumber: string | null;
  journalEntryId: string | null;
  apCreditInPaise: number;
  opsPaidInPaise: number;
  opsStatus: string;
  nativeVendorPaymentInPaise: number;
  outstandingNativeApInPaise: number;
  itcStatus: string | null;
  duplicateSupplierReference: boolean;
  sourceChangedAfterPost: boolean;
  status: string;
  statusReason: string;
  warnings: string[];
  /** Phase 3C1 / V5 */
  payments?: Array<{
    paymentId: string;
    paymentNumber: string;
    paymentDate: string;
    amountInPaise: number;
    utr: string | null;
    paidAccountCode: string;
    paymentMethod: string;
  }>;
  /** Phase 3C3 */
  cutoverClassification: import("./accounting-cutover").CutoverClassification;
  agingBucket: import("./ap-aging").ApAgingBucket | null;
  overdue: boolean;
  billExpenseDuplicateClass: string;
  possibleDuplicateExpenseIds: string[];
  paymentRefs: string[];
  opsPaidExplanation: string;
};

export async function buildReconciliationV4BillRow(billId: string): Promise<ReconciliationV4BillRow> {
  const { loadVendorBillSnapshotById } = await import("./vendor-bill-snapshot.service");
  const { previewVendorBillPostedJournal } = await import("./vendor-bill-posting.service");
  const { findDuplicateSupplierReferences } = await import("./vendor-bill-discovery-worker");
  const { getNativeBillOutstanding } = await import("./vendor-payment-outstanding");
  const { classifyCutover } = await import("./accounting-cutover");
  const { computeApAgingBucket, isOverdueAp } = await import("./ap-aging");
  const { findExpenseDuplicatesForBill } = await import("./expense-duplicate");

  const snapshot = await loadVendorBillSnapshotById(billId);
  const preview = await previewVendorBillPostedJournal(snapshot);
  const dupRef = await findDuplicateSupplierReferences(
    snapshot.vendorId,
    snapshot.referenceNumber,
    snapshot.billId
  );
  const billExpenseDup = await findExpenseDuplicatesForBill(billId);
  const nativeOut = await getNativeBillOutstanding(billId);

  const posted = preview.postingEvent?.status === "POSTED";
  const journalEntryId = preview.postingEvent?.journalEntryId ?? null;
  let journalEntryNumber: string | null = null;
  if (journalEntryId) {
    const je = await prisma.accountingJournalEntry.findUnique({
      where: { id: journalEntryId },
      select: { entryNumber: true }
    });
    journalEntryNumber = je?.entryNumber ?? null;
  }

  const paymentAllocs = await prisma.accountingVendorPaymentAllocation.findMany({
    where: { vendorBillId: billId, payment: { status: "POSTED" } },
    include: {
      payment: {
        select: {
          id: true,
          paymentNumber: true,
          paymentDate: true,
          utr: true,
          paidAccountCode: true,
          paymentMethod: true
        }
      }
    }
  });
  const nativeVendorPaymentInPaise = paymentAllocs.reduce((s, a) => s + a.amountInPaise, 0);
  const outstandingNativeApInPaise = nativeOut.hasApJournal
    ? nativeOut.outstandingInPaise
    : posted
      ? snapshot.totalInPaise
      : 0;

  const stockClearing = preview.proposal?.diagnostics.stockClearingInPaise ?? 0;
  const expense = preview.proposal?.diagnostics.expenseInPaise ?? 0;
  const gst = preview.proposal?.diagnostics.gst;
  const warnings = [
    ...preview.eligibility.warnings,
    ...(preview.proposal?.diagnostics.warnings ?? []),
    ...(dupRef ? ["DUPLICATE_SUPPLIER_REFERENCE"] : []),
    ...(billExpenseDup.classification === "DUPLICATE_SUPPLIER_DOCUMENT"
      ? ["DUPLICATE_SUPPLIER_DOCUMENT", "POSSIBLE_DUPLICATE_BILL_EXPENSE"]
      : []),
    ...(billExpenseDup.classification === "POSSIBLE_DUPLICATE_BILL_EXPENSE"
      ? ["POSSIBLE_DUPLICATE_BILL_EXPENSE"]
      : []),
    ...(preview.sourceChangedAfterPost ? ["SOURCE_CHANGED_AFTER_POST", "REVERSAL_REQUIRED"] : [])
  ];

  const cutoverClassification = classifyCutover(snapshot.billDate);
  const agingBucket = computeApAgingBucket({
    outstandingNativeApInPaise,
    dueDate: snapshot.dueDate,
    billDate: snapshot.billDate
  });
  const overdue = isOverdueAp({
    outstandingNativeApInPaise,
    dueDate: snapshot.dueDate,
    billDate: snapshot.billDate
  });

  const opsHasPaid =
    snapshot.status === "PAID" || snapshot.paidInPaise > 0;
  const opsFullyPaid =
    snapshot.paidInPaise >= snapshot.totalInPaise - 2 || snapshot.status === "PAID";
  const opsPartialPaid =
    snapshot.paidInPaise > 0 && snapshot.paidInPaise < snapshot.totalInPaise - 2;

  let status = "DATA_GAP";
  let statusReason = preview.eligibility.code;

  if (
    nativeOut.hasApJournal &&
    outstandingNativeApInPaise === 0 &&
    nativeVendorPaymentInPaise > 0
  ) {
    if (opsHasPaid && Math.abs(snapshot.paidInPaise - nativeVendorPaymentInPaise) > 2) {
      status = "OPS_NATIVE_PAYMENT_MISMATCH";
      statusReason = "Native payments settle AP but ops paidInPaise differs";
    } else {
      status = "PAID";
      statusReason = "Native AP fully settled by VendorPayment allocations";
    }
  } else if (
    nativeOut.hasApJournal &&
    nativeVendorPaymentInPaise > 0 &&
    outstandingNativeApInPaise > 0
  ) {
    if (opsHasPaid && Math.abs(snapshot.paidInPaise - nativeVendorPaymentInPaise) > 2) {
      status = "OPS_NATIVE_PAYMENT_MISMATCH";
      statusReason = "Ops paid amount differs from native VendorPayment allocations";
    } else {
      status = "PARTIALLY_PAID";
      statusReason = "Partial native VendorPayment allocations";
    }
  } else if (
    nativeOut.hasApJournal &&
    nativeVendorPaymentInPaise === 0 &&
    opsPartialPaid
  ) {
    status = "OPS_PARTIAL_NATIVE_UNPAID";
    statusReason = "Ops partial paidInPaise; no native VendorPayment";
  } else if (
    nativeOut.hasApJournal &&
    nativeVendorPaymentInPaise === 0 &&
    opsFullyPaid
  ) {
    status = "OPS_PAID_NATIVE_UNPAID";
    statusReason = "Ops marked paid; no AccountingVendorPayment";
  } else if (preview.sourceChangedAfterPost) {
    status = "SOURCE_CHANGED_AFTER_POST";
    statusReason = "Bill financial fingerprint differs from posted payload";
  } else if (dupRef) {
    status = "DUPLICATE_SUPPLIER_REFERENCE";
    statusReason = "Same vendor + normalized supplier reference exists on another bill";
  } else if (preview.buildError?.code === "GST_DATA_GAP" || preview.eligibility.code === "GST_DATA_GAP") {
    status = "GST_DATA_GAP";
    statusReason = preview.buildError?.message ?? "GST evidence insufficient";
  } else if (warnings.includes("ADJUSTMENT_UNCLASSIFIED") && !posted) {
    status = "ADJUSTMENT_UNCLASSIFIED";
    statusReason = "Bill has unclassified adjustment (allocated pro-rata in V1)";
  } else if (posted && snapshot.status === "PAID" && snapshot.paidInPaise > 0 && nativeVendorPaymentInPaise === 0) {
    status = "OPS_MARKED_PAID_NO_ACCOUNTING_PAYMENT";
    statusReason = "Ops paidInPaise set; native vendor payment journals not present";
  } else if (posted && outstandingNativeApInPaise > 0) {
    status = "UNPAID";
    statusReason = "Native AP recognized; no/ incomplete accounting payment";
  } else if (posted) {
    status = "MATCHED";
    statusReason = "VENDOR_BILL_POSTED journal present";
  } else if (snapshot.status === "DRAFT") {
    status = "DATA_GAP";
    statusReason = "DRAFT";
  } else if (snapshot.status === "VOID") {
    status = "DATA_GAP";
    statusReason = "VOID";
  } else if (!preview.eligibility.eligible) {
    status = preview.eligibility.code === "ERROR" ? "ERROR" : "DATA_GAP";
    statusReason = preview.eligibility.reason ?? preview.eligibility.code;
  } else {
    status = "UNPAID";
    statusReason = "Eligible but not yet posted";
  }

  if (nativeVendorPaymentInPaise > (nativeOut.apCreditInPaise || snapshot.totalInPaise) + 2) {
    status = "OVERPAID";
    statusReason = "Native allocations exceed AP credit";
  }

  const paymentRows = paymentAllocs.map((a) => ({
    paymentId: a.payment.id,
    paymentNumber: a.payment.paymentNumber,
    paymentDate: a.payment.paymentDate.toISOString(),
    amountInPaise: a.amountInPaise,
    utr: a.payment.utr,
    paidAccountCode: a.payment.paidAccountCode,
    paymentMethod: a.payment.paymentMethod
  }));
  const paymentRefs = paymentRows.map((p) => p.paymentNumber);

  const opsPaidExplanation =
    nativeVendorPaymentInPaise === 0 && opsHasPaid
      ? "Operational paidInPaise/status is not financial authority — native AP requires VendorPayment"
      : nativeVendorPaymentInPaise > 0 && opsHasPaid &&
          Math.abs(snapshot.paidInPaise - nativeVendorPaymentInPaise) > 2
        ? "Ops paidInPaise differs from native VendorPayment — reconcile manually"
        : "Native AP recognized/settled from journals and allocations";

  return {
    version: "v5",
    billId: snapshot.billId,
    billNumber: snapshot.billNumber,
    referenceNumber: snapshot.referenceNumber,
    vendorId: snapshot.vendorId,
    vendorName: snapshot.vendorName,
    vendorGstin: snapshot.vendorGstin,
    billDate: snapshot.billDate.toISOString(),
    dueDate: snapshot.dueDate?.toISOString() ?? null,
    purchaseOrderId: snapshot.purchaseOrderId,
    purchaseOrderNumber: snapshot.purchaseOrderNumber,
    billTotalInPaise: snapshot.totalInPaise,
    taxInPaise: snapshot.taxInPaise,
    stockClearingInPaise: stockClearing,
    expenseInPaise: expense,
    inputCgstInPaise: gst?.cgstInPaise ?? 0,
    inputSgstInPaise: gst?.sgstInPaise ?? 0,
    inputIgstInPaise: gst?.igstInPaise ?? 0,
    journalEntryNumber,
    journalEntryId,
    apCreditInPaise: nativeOut.hasApJournal ? nativeOut.apCreditInPaise : posted ? snapshot.totalInPaise : 0,
    opsPaidInPaise: snapshot.paidInPaise,
    opsStatus: snapshot.status,
    nativeVendorPaymentInPaise,
    outstandingNativeApInPaise,
    itcStatus: gst?.itcStatus ?? null,
    duplicateSupplierReference: dupRef,
    sourceChangedAfterPost: preview.sourceChangedAfterPost,
    status,
    statusReason,
    warnings: [...new Set(warnings)],
    payments: paymentRows,
    cutoverClassification,
    agingBucket,
    overdue,
    billExpenseDuplicateClass: billExpenseDup.classification,
    possibleDuplicateExpenseIds: billExpenseDup.expenseIds,
    paymentRefs,
    opsPaidExplanation
  };
}

export async function buildReconciliationV4Report(billIds: string[]) {
  const rows: ReconciliationV4BillRow[] = [];
  for (const id of billIds) {
    rows.push(await buildReconciliationV4BillRow(id));
  }
  return { rows, count: rows.length, version: "v5" as const };
}

export async function buildReconciliationV5Report(billIds: string[]) {
  return buildReconciliationV4Report(billIds);
}

export type ReconciliationV5ExpenseRow = {
  version: "v5-expense";
  expenseId: string;
  expenseDate: string;
  statusOps: string;
  vendorId: string | null;
  vendorName: string | null;
  invoiceNumber: string | null;
  referenceNumber: string | null;
  sourceExpenseAccount: string;
  mappedExpenseAccountCode: string | null;
  paidThrough: string | null;
  mappedPaymentAccountCode: string | null;
  amountInPaise: number;
  taxInPaise: number;
  taxInclusive: boolean;
  netExpenseInPaise: number | null;
  grossPaymentInPaise: number | null;
  gstJurisdiction: string | null;
  inputCgstInPaise: number;
  inputSgstInPaise: number;
  inputIgstInPaise: number;
  itcStatus: string | null;
  duplicateClass: string;
  duplicateBillIds: string[];
  journalEntryNumber: string | null;
  journalEntryId: string | null;
  status: string;
  statusReason: string;
  warnings: string[];
  /** Phase 3C3 */
  cutoverClassification: import("./accounting-cutover").CutoverClassification;
  historicalClassification: string;
  sourceChangedAfterPost: boolean;
};

export async function buildReconciliationV5ExpenseRow(
  expenseId: string
): Promise<ReconciliationV5ExpenseRow> {
  const { loadExpenseSnapshotById } = await import("./expense-snapshot.service");
  const { previewExpenseRecordedJournal } = await import("./expense-posting.service");
  const { resolveExpenseAmountSemantics } = await import("./expense-amount");
  const { classifyCutover } = await import("./accounting-cutover");

  const snapshot = await loadExpenseSnapshotById(expenseId);
  const preview = await previewExpenseRecordedJournal(snapshot);
  const amount = resolveExpenseAmountSemantics(snapshot);
  const posted = preview.postingEvent?.status === "POSTED";
  const journalEntryId = preview.postingEvent?.journalEntryId ?? null;
  let journalEntryNumber: string | null = null;
  if (journalEntryId) {
    const je = await prisma.accountingJournalEntry.findUnique({
      where: { id: journalEntryId },
      select: { entryNumber: true }
    });
    journalEntryNumber = je?.entryNumber ?? null;
  }

  const warnings = [
    ...preview.eligibility.warnings,
    ...(preview.proposal?.diagnostics.warnings ?? []),
    ...(preview.sourceChangedAfterPost ? ["SOURCE_CHANGED_AFTER_POST", "REVERSAL_REQUIRED"] : [])
  ];

  let status = "DATA_GAP";
  let statusReason: string = String(preview.eligibility.code);

  if (preview.sourceChangedAfterPost) {
    status = "SOURCE_CHANGED_AFTER_POST";
    statusReason = "REVERSAL_REQUIRED";
  } else if (posted) {
    status = "POSTED";
    statusReason = "EXPENSE_RECORDED journal present";
  } else if (preview.eligibility.code === "EXPENSE_ACCOUNT_UNMAPPED") {
    status = "UNMAPPED_EXPENSE_ACCOUNT";
    statusReason = preview.eligibility.reason ?? preview.eligibility.code;
  } else if (preview.eligibility.code === "PAYMENT_ACCOUNT_UNMAPPED") {
    status = "UNMAPPED_PAYMENT_ACCOUNT";
    statusReason = preview.eligibility.reason ?? preview.eligibility.code;
  } else if (preview.eligibility.code === "GST_DATA_GAP" || preview.buildError?.code === "GST_DATA_GAP") {
    status = "GST_DATA_GAP";
    statusReason = preview.eligibility.reason ?? preview.buildError?.message ?? "GST_DATA_GAP";
  } else if (preview.eligibility.code === "RCM_DATA_GAP") {
    status = "RCM_DATA_GAP";
    statusReason = preview.eligibility.reason ?? "RCM deferred";
  } else if (preview.eligibility.code === "DUPLICATE_RISK") {
    status = "DUPLICATE_RISK";
    statusReason = preview.eligibility.reason ?? "Duplicate bill risk";
  } else if (snapshot.status === "DRAFT") {
    status = "DATA_GAP";
    statusReason = "DRAFT";
  } else if (!preview.eligibility.eligible) {
    status = preview.eligibility.code === "ERROR" ? "ERROR" : "DATA_GAP";
    statusReason = preview.eligibility.reason ?? preview.eligibility.code;
  } else {
    status = "DATA_GAP";
    statusReason = "Eligible but not yet posted";
  }

  const gst = preview.proposal?.diagnostics.gst;
  const cutoverClassification = classifyCutover(snapshot.expenseDate);

  let historicalClassification = "POSTABLE";
  if (cutoverClassification === "PRE_CUTOVER" && !posted) {
    historicalClassification = "PRE_CUTOVER";
  } else if (preview.sourceChangedAfterPost) {
    historicalClassification = "SOURCE_CHANGED_AFTER_POST";
  } else if (posted) {
    historicalClassification = "POSTED_NATIVE";
  } else if (preview.eligibility.code === "EXPENSE_ACCOUNT_UNMAPPED") {
    historicalClassification = "NEEDS_ACCOUNT_MAPPING";
  } else if (preview.eligibility.code === "PAYMENT_ACCOUNT_UNMAPPED") {
    historicalClassification = "NEEDS_PAYMENT_MAPPING";
  } else if (
    preview.eligibility.code === "GST_DATA_GAP" ||
    preview.buildError?.code === "GST_DATA_GAP"
  ) {
    historicalClassification = "GST_DATA_GAP";
  } else if (preview.eligibility.code === "RCM_DATA_GAP") {
    historicalClassification = "RCM_DATA_GAP";
  } else if (
    preview.eligibility.code === "DUPLICATE_RISK" ||
    preview.duplicate.classification !== "NO_DUPLICATE"
  ) {
    historicalClassification = "DUPLICATE_RISK";
  } else if (snapshot.status === "DRAFT") {
    historicalClassification = "DATA_GAP";
  } else if (preview.eligibility.eligible) {
    historicalClassification = "POSTABLE";
  } else {
    historicalClassification = preview.eligibility.code;
  }

  return {
    version: "v5-expense",
    expenseId: snapshot.expenseId,
    expenseDate: snapshot.expenseDate.toISOString().slice(0, 10),
    statusOps: snapshot.status,
    vendorId: snapshot.vendorId,
    vendorName: snapshot.vendorName,
    invoiceNumber: snapshot.invoiceNumber,
    referenceNumber: snapshot.referenceNumber,
    sourceExpenseAccount: snapshot.expenseAccount,
    mappedExpenseAccountCode: snapshot.mappedExpenseAccountCode,
    paidThrough: snapshot.paidThrough,
    mappedPaymentAccountCode: snapshot.mappedPaymentAccountCode,
    amountInPaise: snapshot.amountInPaise,
    taxInPaise: snapshot.taxInPaise,
    taxInclusive: snapshot.taxInclusive,
    netExpenseInPaise: amount.amount?.netExpenseInPaise ?? null,
    grossPaymentInPaise: amount.amount?.grossPaymentInPaise ?? null,
    gstJurisdiction: gst?.jurisdiction ?? null,
    inputCgstInPaise: gst?.cgstInPaise ?? 0,
    inputSgstInPaise: gst?.sgstInPaise ?? 0,
    inputIgstInPaise: gst?.igstInPaise ?? 0,
    itcStatus: gst?.itcStatus ?? null,
    duplicateClass: preview.duplicate.classification,
    duplicateBillIds: preview.duplicate.billIds,
    journalEntryNumber,
    journalEntryId,
    status,
    statusReason,
    warnings: [...new Set(warnings)],
    cutoverClassification,
    historicalClassification,
    sourceChangedAfterPost: preview.sourceChangedAfterPost
  };
}

export async function buildReconciliationV5ExpenseReport(expenseIds: string[]) {
  const rows: ReconciliationV5ExpenseRow[] = [];
  for (const id of expenseIds) {
    rows.push(await buildReconciliationV5ExpenseRow(id));
  }
  return { rows, count: rows.length, version: "v5-expense" as const };
}
