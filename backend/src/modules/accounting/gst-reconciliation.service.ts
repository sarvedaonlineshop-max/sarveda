import { prisma } from "../../config/db";

import { ORDER_PAID_EVENT_TYPE } from "./order-paid.constants";
import { ORDER_REFUNDED_FULL_EVENT_TYPE } from "./order-refunded-full.constants";
import { VENDOR_BILL_POSTED_EVENT_TYPE, vendorBillPostedUniqueKey } from "./vendor-bill.constants";
import { EXPENSE_RECORDED_EVENT_TYPE, expenseRecordedUniqueKey } from "./expense.constants";
import { getPostingEvent } from "./posting-event.service";
import { SHIPPING_GST_POLICY, type GstReconScope, type GstReconStatus } from "./gst.constants";
import { evaluateFullRefundEligibility } from "./order-refunded-full-eligibility";
import { loadOrderRefundContextByOrderId } from "./order-refund-snapshot.service";

export type GstReconRow = {
  scope: GstReconScope;
  sourceType: string;
  sourceId: string;
  reference: string | null;
  statuses: GstReconStatus[];
  primaryStatus: GstReconStatus;
  details: Record<string, unknown>;
};

function primaryOf(statuses: GstReconStatus[]): GstReconStatus {
  const priority: GstReconStatus[] = [
    "RCM_DATA_GAP",
    "GST_DATA_GAP",
    "PLACE_OF_SUPPLY_MISMATCH",
    "AMOUNT_MISMATCH",
    "RATE_MISMATCH",
    "MISSING_JOURNAL",
    "PARTIAL_REFUND_GST_DATA_GAP",
    "MISSING_TAX_DOCUMENT",
    "PDF_JOURNAL_TAX_DIVERGENCE",
    "SHIPPING_GST_DATA_GAP",
    "GATEWAY_GST_PROVISIONAL",
    "ITC_UNVERIFIED",
    "BUYER_GSTIN_MISSING",
    "TAX_CLASS_DEFAULTED",
    "HSN_DEFAULTED",
    "MATCHED"
  ];
  for (const p of priority) {
    if (statuses.includes(p)) return p;
  }
  return statuses[0] ?? "MATCHED";
}

function journalGstTotals(lines: Array<{ account: { code: string }; debitInPaise: number; creditInPaise: number }>) {
  let cgst = 0;
  let sgst = 0;
  let igst = 0;
  let inputCgst = 0;
  let inputSgst = 0;
  let inputIgst = 0;
  for (const l of lines) {
    const netCredit = l.creditInPaise - l.debitInPaise;
    const netDebit = l.debitInPaise - l.creditInPaise;
    if (l.account.code === "2100") cgst += netCredit;
    if (l.account.code === "2101") sgst += netCredit;
    if (l.account.code === "2102") igst += netCredit;
    if (l.account.code === "2200") inputCgst += netDebit;
    if (l.account.code === "2201") inputSgst += netDebit;
    if (l.account.code === "2202") inputIgst += netDebit;
  }
  return { cgst, sgst, igst, inputCgst, inputSgst, inputIgst };
}

async function reconcileSales(limit: number): Promise<GstReconRow[]> {
  const events = await prisma.accountingPostingEvent.findMany({
    where: { eventType: ORDER_PAID_EVENT_TYPE, status: "POSTED" },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      journalEntry: {
        include: { lines: { include: { account: { select: { code: true } } } } }
      }
    }
  });

  const rows: GstReconRow[] = [];
  for (const ev of events) {
    const statuses: GstReconStatus[] = [];
    const payload = (ev.payloadJson ?? {}) as Record<string, unknown>;
    const diagnostics = (payload.diagnostics ?? {}) as Record<string, unknown>;
    const warnings = Array.isArray(diagnostics.warnings)
      ? (diagnostics.warnings as string[])
      : [];

    if (!ev.journalEntry) {
      statuses.push("MISSING_JOURNAL");
    } else {
      const totals = journalGstTotals(ev.journalEntry.lines);
      const snapC = Number(diagnostics.outputCgstPaise ?? 0);
      const snapS = Number(diagnostics.outputSgstPaise ?? 0);
      const snapI = Number(diagnostics.outputIgstPaise ?? 0);
      if (Math.abs(totals.cgst - snapC) > 2 || Math.abs(totals.sgst - snapS) > 2 || Math.abs(totals.igst - snapI) > 2) {
        statuses.push("AMOUNT_MISMATCH");
      } else {
        statuses.push("MATCHED");
      }
    }

    if (diagnostics.placeOfSupplyError) statuses.push("PLACE_OF_SUPPLY_MISMATCH");
    if (diagnostics.buyerGstinMissing) statuses.push("BUYER_GSTIN_MISSING");
    if (warnings.includes("PDF_JOURNAL_TAX_DIVERGENCE") || Number(diagnostics.pdfJournalTaxDivergencePaise ?? 0) !== 0) {
      statuses.push("PDF_JOURNAL_TAX_DIVERGENCE");
    }
    if (warnings.includes(SHIPPING_GST_POLICY) || diagnostics.shippingGstWarning) {
      statuses.push("SHIPPING_GST_DATA_GAP");
    }
    if (warnings.includes("TAX_CLASS_DEFAULTED")) statuses.push("TAX_CLASS_DEFAULTED");
    if (warnings.includes("HSN_DEFAULTED")) statuses.push("HSN_DEFAULTED");

    rows.push({
      scope: "SALES",
      sourceType: "ORDER",
      sourceId: ev.sourceId,
      reference: typeof payload.orderNumber === "string" ? payload.orderNumber : null,
      statuses: [...new Set(statuses)],
      primaryStatus: primaryOf(statuses),
      details: {
        supplyType: diagnostics.supplyType,
        outputCgstPaise: diagnostics.outputCgstPaise,
        outputSgstPaise: diagnostics.outputSgstPaise,
        outputIgstPaise: diagnostics.outputIgstPaise,
        pdfJournalTaxDivergencePaise: diagnostics.pdfJournalTaxDivergencePaise,
        sellerStateCode: diagnostics.sellerStateCode,
        placeOfSupplyCode: diagnostics.placeOfSupplyCode
      }
    });
  }
  return rows;
}

async function reconcileFullRefunds(limit: number): Promise<GstReconRow[]> {
  const events = await prisma.accountingPostingEvent.findMany({
    where: { eventType: ORDER_REFUNDED_FULL_EVENT_TYPE, status: "POSTED" },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      journalEntry: {
        include: { lines: { include: { account: { select: { code: true } } } } }
      }
    }
  });

  const rows: GstReconRow[] = [];
  for (const ev of events) {
    const statuses: GstReconStatus[] = [];
    if (!ev.journalEntry) {
      statuses.push("MISSING_JOURNAL");
    } else {
      statuses.push("MATCHED");
    }
    rows.push({
      scope: "FULL_REFUNDS",
      sourceType: "ORDER_REFUND",
      sourceId: ev.sourceId,
      reference: null,
      statuses,
      primaryStatus: primaryOf(statuses),
      details: { note: "Full refund inverts original ORDER_PAID including GST" }
    });
  }

  // Sample partial refunds as DATA_GAP (commerce refunds that are not full)
  const partialPayments = await prisma.payment.findMany({
    where: { status: "PARTIALLY_REFUNDED" },
    take: Math.min(20, limit),
    select: { id: true, orderId: true, order: { select: { orderNumber: true } } }
  });
  for (const p of partialPayments) {
    rows.push({
      scope: "FULL_REFUNDS",
      sourceType: "PAYMENT",
      sourceId: p.id,
      reference: p.order.orderNumber,
      statuses: ["PARTIAL_REFUND_GST_DATA_GAP"],
      primaryStatus: "PARTIAL_REFUND_GST_DATA_GAP",
      details: { orderId: p.orderId }
    });
  }

  return rows;
}

async function reconcileVendorBills(limit: number): Promise<GstReconRow[]> {
  const bills = await prisma.vendorBill.findMany({
    where: { status: { in: ["OPEN", "PAID"] } },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      billNumber: true,
      reverseCharge: true,
      taxInPaise: true,
      referenceNumber: true
    }
  });
  const rows: GstReconRow[] = [];
  for (const bill of bills) {
    const statuses: GstReconStatus[] = [];
    if (bill.reverseCharge) {
      statuses.push("RCM_DATA_GAP");
      rows.push({
        scope: "VENDOR_BILLS",
        sourceType: "VENDOR_BILL",
        sourceId: bill.id,
        reference: bill.billNumber,
        statuses,
        primaryStatus: "RCM_DATA_GAP",
        details: { taxInPaise: bill.taxInPaise }
      });
      continue;
    }
    const event = await getPostingEvent(
      VENDOR_BILL_POSTED_EVENT_TYPE,
      vendorBillPostedUniqueKey(bill.id)
    );
    if (!event || event.status !== "POSTED") {
      statuses.push("MISSING_JOURNAL");
    } else {
      statuses.push("MATCHED");
      if (bill.taxInPaise > 0) statuses.push("ITC_UNVERIFIED");
    }
    if (!bill.referenceNumber?.trim() && bill.taxInPaise > 0) {
      statuses.push("MISSING_TAX_DOCUMENT");
    }
    const itc = await prisma.accountingItcEvidence.findUnique({
      where: {
        sourceType_sourceId: { sourceType: "VENDOR_BILL", sourceId: bill.id }
      },
      select: { status: true, assessmentCode: true, totalGstInPaise: true }
    });
    if (itc) {
      if (itc.status === "ELIGIBLE") {
        const i = statuses.indexOf("ITC_UNVERIFIED");
        if (i >= 0) statuses.splice(i, 1);
      } else if (itc.status === "BLOCKED" || itc.status === "DATA_GAP") {
        statuses.push("GST_DATA_GAP");
      }
    }
    rows.push({
      scope: "VENDOR_BILLS",
      sourceType: "VENDOR_BILL",
      sourceId: bill.id,
      reference: bill.billNumber,
      statuses: [...new Set(statuses)],
      primaryStatus: primaryOf(statuses),
      details: {
        taxInPaise: bill.taxInPaise,
        itcStatus: itc?.status ?? "UNVERIFIED_PENDING_TAX_INVOICE",
        itcAssessmentCode: itc?.assessmentCode ?? null,
        eligibleInputGstInPaise: itc?.status === "ELIGIBLE" ? itc.totalGstInPaise : 0,
        recognizedInputGstInPaise: bill.taxInPaise
      }
    });
  }
  return rows;
}

async function reconcileExpenses(limit: number): Promise<GstReconRow[]> {
  const expenses = await prisma.expense.findMany({
    where: { status: { not: "DRAFT" } },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      reverseCharge: true,
      taxInPaise: true,
      invoiceNumber: true,
      referenceNumber: true
    }
  });
  const rows: GstReconRow[] = [];
  for (const exp of expenses) {
    const statuses: GstReconStatus[] = [];
    if (exp.reverseCharge) {
      statuses.push("RCM_DATA_GAP");
    } else {
      const event = await getPostingEvent(
        EXPENSE_RECORDED_EVENT_TYPE,
        expenseRecordedUniqueKey(exp.id)
      );
      if (!event || event.status !== "POSTED") statuses.push("MISSING_JOURNAL");
      else {
        statuses.push("MATCHED");
        if (exp.taxInPaise > 0) statuses.push("ITC_UNVERIFIED");
      }
      if (exp.taxInPaise > 0 && !exp.invoiceNumber?.trim() && !exp.referenceNumber?.trim()) {
        statuses.push("MISSING_TAX_DOCUMENT");
      }
    }
    rows.push({
      scope: "EXPENSES",
      sourceType: "EXPENSE",
      sourceId: exp.id,
      reference: exp.invoiceNumber ?? exp.referenceNumber,
      statuses: [...new Set(statuses)],
      primaryStatus: primaryOf(statuses),
      details: { taxInPaise: exp.taxInPaise }
    });
  }
  return rows;
}

async function reconcileGateway(limit: number): Promise<GstReconRow[]> {
  const settlements = await prisma.accountingGatewaySettlement.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      providerSettlementId: true,
      taxInPaise: true,
      feeInPaise: true,
      gstItcStatus: true,
      journalEntryId: true,
      status: true
    }
  });
  return settlements.map((s) => {
    const statuses: GstReconStatus[] = ["GATEWAY_GST_PROVISIONAL", "ITC_UNVERIFIED"];
    if (s.status === "POSTED" && s.journalEntryId) statuses.push("MATCHED");
    else if (s.status !== "POSTED") statuses.push("MISSING_JOURNAL");
    return {
      scope: "GATEWAY_FEES" as const,
      sourceType: "GATEWAY_SETTLEMENT",
      sourceId: s.id,
      reference: s.providerSettlementId,
      statuses,
      primaryStatus: primaryOf(statuses),
      details: {
        taxInPaise: s.taxInPaise,
        feeInPaise: s.feeInPaise,
        gstItcStatus: s.gstItcStatus,
        posting: "fee+tax → 5100 (never 2200-2202)"
      }
    };
  });
}

export async function buildGstReconciliation(opts?: {
  scope?: GstReconScope | "ALL";
  status?: string;
  limit?: number;
}): Promise<{ rows: GstReconRow[]; count: number; version: string }> {
  const limit = Math.min(Math.max(opts?.limit ?? 50, 1), 200);
  const scope = opts?.scope ?? "ALL";
  let rows: GstReconRow[] = [];
  if (scope === "ALL" || scope === "SALES") rows = rows.concat(await reconcileSales(limit));
  if (scope === "ALL" || scope === "FULL_REFUNDS") rows = rows.concat(await reconcileFullRefunds(limit));
  if (scope === "ALL" || scope === "VENDOR_BILLS") rows = rows.concat(await reconcileVendorBills(limit));
  if (scope === "ALL" || scope === "EXPENSES") rows = rows.concat(await reconcileExpenses(limit));
  if (scope === "ALL" || scope === "GATEWAY_FEES") rows = rows.concat(await reconcileGateway(limit));

  if (opts?.status?.trim()) {
    const st = opts.status.trim().toUpperCase();
    rows = rows.filter((r) => r.statuses.includes(st as GstReconStatus) || r.primaryStatus === st);
  }

  return { rows, count: rows.length, version: "gst_recon_v1" };
}

export async function buildGstDataGaps(opts?: { limit?: number }) {
  const recon = await buildGstReconciliation({ scope: "ALL", limit: opts?.limit ?? 100 });
  const gapStatuses = new Set<GstReconStatus>([
    "GST_DATA_GAP",
    "PLACE_OF_SUPPLY_MISMATCH",
    "MISSING_JOURNAL",
    "MISSING_TAX_DOCUMENT",
    "AMOUNT_MISMATCH",
    "PARTIAL_REFUND_GST_DATA_GAP",
    "RCM_DATA_GAP",
    "SHIPPING_GST_DATA_GAP",
    "PDF_JOURNAL_TAX_DIVERGENCE",
    "GATEWAY_GST_PROVISIONAL",
    "BUYER_GSTIN_MISSING",
    "ITC_UNVERIFIED",
    "TAX_CLASS_DEFAULTED",
    "HSN_DEFAULTED"
  ]);
  const rows = recon.rows.filter((r) => r.statuses.some((s) => gapStatuses.has(s)));
  return { rows, count: rows.length, version: "gst_data_gaps_v1" };
}

export async function buildGstOverview(opts: { from?: string; to?: string; month?: string }) {
  const { buildGstLedger } = await import("./gst-ledger.service");
  const { buildItcSummary } = await import("./itc.service");
  const { isAccountingItcVerificationEnabled } = await import("./accounting-flag");
  const ledger = await buildGstLedger(opts);
  const gaps = await buildGstDataGaps({ limit: 50 });
  let itcSummary = null;
  if (isAccountingItcVerificationEnabled()) {
    itcSummary = await buildItcSummary({ month: opts.month });
  }
  return {
    period: { from: ledger.from, to: ledger.to },
    aggregates: ledger.aggregates,
    dataGapCount: gaps.count,
    shippingGstPolicy: SHIPPING_GST_POLICY,
    itcSummary,
    flags: {
      note: "Input GST recognized (GL) ≠ ITC eligible (evidence). Never label recognized as available ITC."
    }
  };
}

/** Helper for tests — check partial refund eligibility remains DATA_GAP. */
export async function assertPartialRefundGstDataGap(orderId: string): Promise<boolean> {
  try {
    const ctx = await loadOrderRefundContextByOrderId(orderId);
    const elig = evaluateFullRefundEligibility(ctx);
    return !elig.eligible || !elig.autoPostable;
  } catch {
    return true;
  }
}
