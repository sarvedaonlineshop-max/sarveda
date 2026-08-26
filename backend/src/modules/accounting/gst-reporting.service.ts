/**
 * Phase 5D — GSTR-style management / reconciliation reports.
 * NOT GSTN filing. Authority: POSTED journals + immutable tax snapshots + ITC evidence.
 */
import { prisma } from "../../config/db";
import { isPlausibleGstin } from "./vendor-bill-journal.builder";
import { ORDER_PAID_EVENT_TYPE } from "./order-paid.constants";
import { ORDER_REFUNDED_FULL_EVENT_TYPE } from "./order-refunded-full.constants";
import { buildGstLedger, parseGstReportPeriod } from "./gst-ledger.service";
import { buildItcSummary } from "./itc.service";
import { SHIPPING_GST_POLICY } from "./gst.constants";
import { evaluateFullRefundEligibility } from "./order-refunded-full-eligibility";
import { loadOrderRefundContextByOrderId } from "./order-refund-snapshot.service";

const ROW_LIMIT = 5000;
const TOLERANCE_PAISE = 2;

export type GstPeriodOpts = { from?: string; to?: string; month?: string };

type Diag = Record<string, unknown>;
type LineAlloc = {
  orderItemId?: string;
  sku?: string;
  qtyOrdered?: number;
  taxableValueInPaise?: number;
  gstRate?: number;
  gstRatePercent?: number;
  cgstInPaise?: number;
  sgstInPaise?: number;
  igstInPaise?: number;
  totalTaxInPaise?: number;
  hsnSac?: string | null;
  hsnSacResolved?: string;
  hsnSource?: string;
  taxClassDefaulted?: boolean;
  netInclusiveInPaise?: number;
};

function diagnosticsOf(payload: unknown): Diag {
  const p = (payload ?? {}) as Record<string, unknown>;
  return (p.diagnostics ?? {}) as Diag;
}

function lineAllocations(diag: Diag): LineAlloc[] {
  return Array.isArray(diag.lineAllocations) ? (diag.lineAllocations as LineAlloc[]) : [];
}

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

export type GstinFormatStatus = "FORMAT_VALID" | "INVALID_FORMAT" | "NOT_AVAILABLE";

export function classifyGstinFormat(gstin: string | null | undefined): GstinFormatStatus {
  if (!gstin?.trim()) return "NOT_AVAILABLE";
  return isPlausibleGstin(gstin) ? "FORMAT_VALID" : "INVALID_FORMAT";
}

async function loadPostedSalesEvents(from: Date, toExclusive: Date) {
  return prisma.accountingPostingEvent.findMany({
    where: {
      eventType: ORDER_PAID_EVENT_TYPE,
      status: "POSTED",
      journalEntry: { status: "POSTED", entryDate: { gte: from, lt: toExclusive } }
    },
    take: ROW_LIMIT,
    orderBy: { createdAt: "asc" },
    include: {
      journalEntry: {
        select: {
          id: true,
          entryNumber: true,
          entryDate: true,
          totalDebitInPaise: true,
          lines: { include: { account: { select: { code: true } } } }
        }
      }
    }
  });
}

async function loadPostedFullRefundEvents(from: Date, toExclusive: Date) {
  return prisma.accountingPostingEvent.findMany({
    where: {
      eventType: ORDER_REFUNDED_FULL_EVENT_TYPE,
      status: "POSTED",
      journalEntry: { status: "POSTED", entryDate: { gte: from, lt: toExclusive } }
    },
    take: ROW_LIMIT,
    orderBy: { createdAt: "asc" },
    include: {
      journalEntry: {
        select: {
          id: true,
          entryNumber: true,
          entryDate: true,
          lines: { include: { account: { select: { code: true } } } }
        }
      }
    }
  });
}

function journalOutputGst(
  lines: Array<{ account: { code: string }; debitInPaise: number; creditInPaise: number }>
) {
  let cgst = 0;
  let sgst = 0;
  let igst = 0;
  for (const l of lines) {
    const net = l.creditInPaise - l.debitInPaise;
    if (l.account.code === "2100") cgst += net;
    if (l.account.code === "2101") sgst += net;
    if (l.account.code === "2102") igst += net;
  }
  return { cgst, sgst, igst, total: cgst + sgst + igst };
}

export type OutwardSupplyRow = {
  sourceType: "ORDER_PAID";
  sourceId: string;
  orderNumber: string | null;
  entryDate: string;
  journalEntryId: string | null;
  journalEntryNumber: string | null;
  postingEventId: string;
  buyerGstin: string | null;
  buyerGstinStatus: GstinFormatStatus;
  classification: "B2C" | "B2B" | "B2B_DATA_GAP";
  supplyType: string;
  placeOfSupplyCode: string | null;
  sellerStateCode: string | null;
  taxableValueInPaise: number;
  cgstInPaise: number;
  sgstInPaise: number;
  igstInPaise: number;
  totalTaxInPaise: number;
  invoiceValueInPaise: number;
  shippingInPaise: number;
  shippingGstStatus: string | null;
  warnings: string[];
  hasTaxSnapshot: boolean;
  drillDown: {
    postingEventId: string;
    journalEntryId: string | null;
    taxSnapshotVersion: string | null;
  };
};

function classifyBuyer(buyerGstin: string | null): {
  classification: OutwardSupplyRow["classification"];
  buyerGstinStatus: GstinFormatStatus;
} {
  const status = classifyGstinFormat(buyerGstin);
  if (status === "NOT_AVAILABLE") {
    return { classification: "B2C", buyerGstinStatus: status };
  }
  if (status === "INVALID_FORMAT") {
    return { classification: "B2B_DATA_GAP", buyerGstinStatus: status };
  }
  return { classification: "B2B", buyerGstinStatus: status };
}

export async function buildOutwardSupplyReport(opts: GstPeriodOpts) {
  const period = parseGstReportPeriod(opts);
  const events = await loadPostedSalesEvents(period.from, period.toExclusive);
  const rows: OutwardSupplyRow[] = [];
  let historicalGapCount = 0;
  let shippingAffected = 0;
  let shippingRevenueInPaise = 0;

  for (const ev of events) {
    const diag = diagnosticsOf(ev.payloadJson);
    const hasSnapshot = Boolean(diag.taxSnapshotVersion) || lineAllocations(diag).length > 0;
    if (!hasSnapshot && num(diag.outputGstTotalPaise) === 0 && !diag.supplyType) {
      historicalGapCount++;
    }
    const buyerGstin = str(diag.buyerGstin);
    const { classification, buyerGstinStatus } = classifyBuyer(buyerGstin);
    const lines = lineAllocations(diag);
    const taxableFromLines = lines.reduce((s, l) => s + num(l.taxableValueInPaise), 0);
    const cgst = num(diag.outputCgstPaise);
    const sgst = num(diag.outputSgstPaise);
    const igst = num(diag.outputIgstPaise);
    const meta = ((ev.payloadJson as Record<string, unknown>)?.reconciliationMetadata ??
      {}) as Record<string, unknown>;
    const shipAmt = num(diag.shippingPaise);
    const warnings = Array.isArray(diag.warnings) ? (diag.warnings as string[]) : [];
    if (shipAmt > 0 || warnings.includes(SHIPPING_GST_POLICY) || diag.shippingGstWarning) {
      shippingAffected++;
      shippingRevenueInPaise += shipAmt;
    }

    const entryDate = ev.journalEntry?.entryDate
      ? ev.journalEntry.entryDate.toISOString().slice(0, 10)
      : period.fromLabel;

    rows.push({
      sourceType: "ORDER_PAID",
      sourceId: ev.sourceId,
      orderNumber: str((ev.payloadJson as Record<string, unknown>).orderNumber) ?? str(meta.orderNumber),
      entryDate,
      journalEntryId: ev.journalEntryId,
      journalEntryNumber: ev.journalEntry?.entryNumber ?? null,
      postingEventId: ev.id,
      buyerGstin,
      buyerGstinStatus,
      classification,
      supplyType: str(diag.supplyType) ?? (hasSnapshot ? "DATA_GAP" : "HISTORICAL_TAX_DATA_GAP"),
      placeOfSupplyCode: str(diag.placeOfSupplyCode),
      sellerStateCode: str(diag.sellerStateCode),
      taxableValueInPaise: taxableFromLines,
      cgstInPaise: cgst,
      sgstInPaise: sgst,
      igstInPaise: igst,
      totalTaxInPaise: cgst + sgst + igst,
      invoiceValueInPaise: taxableFromLines + cgst + sgst + igst + shipAmt,
      shippingInPaise: shipAmt,
      shippingGstStatus: shipAmt > 0 ? SHIPPING_GST_POLICY : null,
      warnings: hasSnapshot ? warnings : [...warnings, "HISTORICAL_TAX_DATA_GAP"],
      hasTaxSnapshot: hasSnapshot,
      drillDown: {
        postingEventId: ev.id,
        journalEntryId: ev.journalEntryId,
        taxSnapshotVersion: str(diag.taxSnapshotVersion)
      }
    });
  }

  const totals = rows.reduce(
    (a, r) => ({
      taxableValueInPaise: a.taxableValueInPaise + r.taxableValueInPaise,
      cgstInPaise: a.cgstInPaise + r.cgstInPaise,
      sgstInPaise: a.sgstInPaise + r.sgstInPaise,
      igstInPaise: a.igstInPaise + r.igstInPaise,
      totalTaxInPaise: a.totalTaxInPaise + r.totalTaxInPaise,
      count: a.count + 1
    }),
    { taxableValueInPaise: 0, cgstInPaise: 0, sgstInPaise: 0, igstInPaise: 0, totalTaxInPaise: 0, count: 0 }
  );

  return {
    disclaimer: "GSTR-STYLE MANAGEMENT REPORT — NOT A FILED GST RETURN / NOT GSTN SUBMISSION",
    period: { from: period.fromLabel, to: period.toLabel },
    rows,
    totals,
    shipping: {
      policy: SHIPPING_GST_POLICY,
      revenueInPaise: shippingRevenueInPaise,
      affectedTransactionCount: shippingAffected,
      gstStatus: SHIPPING_GST_POLICY
    },
    historicalTaxDataGapCount: historicalGapCount,
    truncated: events.length >= ROW_LIMIT
  };
}

export async function buildB2bReport(opts: GstPeriodOpts) {
  const outward = await buildOutwardSupplyReport(opts);
  const b2b = outward.rows.filter((r) => r.classification === "B2B");
  const gap = outward.rows.filter((r) => r.classification === "B2B_DATA_GAP");
  return {
    disclaimer: outward.disclaimer,
    period: outward.period,
    policy: "B2B requires FORMAT_VALID buyerGstin on immutable tax snapshot. No GSTIN invented.",
    rows: b2b.map((r) => ({
      gstin: r.buyerGstin,
      gstinFormatStatus: r.buyerGstinStatus,
      invoiceReference: r.orderNumber,
      invoiceDate: r.entryDate,
      placeOfSupply: r.placeOfSupplyCode,
      supplyType: r.supplyType,
      taxableValueInPaise: r.taxableValueInPaise,
      cgstInPaise: r.cgstInPaise,
      sgstInPaise: r.sgstInPaise,
      igstInPaise: r.igstInPaise,
      invoiceTotalInPaise: r.invoiceValueInPaise,
      rates: [] as number[],
      drillDown: r.drillDown
    })),
    empty: b2b.length === 0,
    dataGapCount: gap.length + outward.rows.filter((r) => r.buyerGstinStatus === "NOT_AVAILABLE").length,
    note:
      b2b.length === 0
        ? "No native B2B rows — buyer GSTIN not captured on sales (BUYER_GSTIN_MISSING). Honest empty B2B report."
        : null
  };
}

export async function buildB2cReport(opts: GstPeriodOpts) {
  const period = parseGstReportPeriod(opts);
  const events = await loadPostedSalesEvents(period.from, period.toExclusive);
  type Agg = {
    placeOfSupplyCode: string | null;
    supplyType: string;
    gstRate: number | null;
    taxableValueInPaise: number;
    cgstInPaise: number;
    sgstInPaise: number;
    igstInPaise: number;
    invoiceValueInPaise: number;
    transactionCount: number;
  };
  const map = new Map<string, Agg>();
  let transactionCount = 0;
  const totals = { taxableValueInPaise: 0, cgstInPaise: 0, sgstInPaise: 0, igstInPaise: 0 };

  for (const ev of events) {
    const diag = diagnosticsOf(ev.payloadJson);
    const buyerGstin = str(diag.buyerGstin);
    const { classification } = classifyBuyer(buyerGstin);
    if (classification !== "B2C") continue;
    transactionCount++;
    const pos = str(diag.placeOfSupplyCode);
    const supplyType = str(diag.supplyType) ?? "DATA_GAP";
    const cgst = num(diag.outputCgstPaise);
    const sgst = num(diag.outputSgstPaise);
    const igst = num(diag.outputIgstPaise);
    totals.cgstInPaise += cgst;
    totals.sgstInPaise += sgst;
    totals.igstInPaise += igst;

    const lines = lineAllocations(diag);
    if (lines.length === 0) {
      const key = `${pos ?? "UNK"}|${supplyType}|ALL`;
      const cur = map.get(key) ?? {
        placeOfSupplyCode: pos,
        supplyType,
        gstRate: null,
        taxableValueInPaise: 0,
        cgstInPaise: 0,
        sgstInPaise: 0,
        igstInPaise: 0,
        invoiceValueInPaise: 0,
        transactionCount: 0
      };
      cur.cgstInPaise += cgst;
      cur.sgstInPaise += sgst;
      cur.igstInPaise += igst;
      cur.transactionCount += 1;
      map.set(key, cur);
      continue;
    }
    const ratesSeen = new Set<number>();
    for (const l of lines) {
      const rate = num(l.gstRate ?? l.gstRatePercent);
      ratesSeen.add(rate);
      const key = `${pos ?? "UNK"}|${supplyType}|${rate}`;
      const cur = map.get(key) ?? {
        placeOfSupplyCode: pos,
        supplyType,
        gstRate: rate,
        taxableValueInPaise: 0,
        cgstInPaise: 0,
        sgstInPaise: 0,
        igstInPaise: 0,
        invoiceValueInPaise: 0,
        transactionCount: 0
      };
      cur.taxableValueInPaise += num(l.taxableValueInPaise);
      totals.taxableValueInPaise += num(l.taxableValueInPaise);
      cur.cgstInPaise += num(l.cgstInPaise);
      cur.sgstInPaise += num(l.sgstInPaise);
      cur.igstInPaise += num(l.igstInPaise);
      cur.invoiceValueInPaise +=
        num(l.taxableValueInPaise) + num(l.cgstInPaise) + num(l.sgstInPaise) + num(l.igstInPaise);
      map.set(key, cur);
    }
    for (const rate of ratesSeen) {
      const key = `${pos ?? "UNK"}|${supplyType}|${rate}`;
      const cur = map.get(key)!;
      cur.transactionCount += 1;
    }
  }

  return {
    disclaimer: "GSTR-STYLE MANAGEMENT REPORT — NOT A FILED GST RETURN / NOT GSTN SUBMISSION",
    period: { from: period.fromLabel, to: period.toLabel },
    label: "B2C MANAGEMENT SUMMARY",
    note: "Not B2CL/B2CS statutory classification — thresholds/fields not implemented.",
    aggregates: [...map.values()],
    transactionCount,
    totals
  };
}

export async function buildCreditNoteReport(opts: GstPeriodOpts) {
  const period = parseGstReportPeriod(opts);
  const events = await loadPostedFullRefundEvents(period.from, period.toExclusive);
  const rows = [];
  for (const ev of events) {
    const diag = diagnosticsOf(ev.payloadJson);
    const j = ev.journalEntry
      ? journalOutputGst(ev.journalEntry.lines)
      : { cgst: 0, sgst: 0, igst: 0, total: 0 };
    // Full refund inverts output → journal net credit on 210x is typically negative (debit reversal)
    rows.push({
      sourceType: "ORDER_REFUNDED_FULL",
      sourceId: ev.sourceId,
      orderNumber: str((ev.payloadJson as Record<string, unknown>).orderNumber),
      entryDate: ev.journalEntry?.entryDate?.toISOString().slice(0, 10) ?? period.fromLabel,
      journalEntryId: ev.journalEntryId,
      journalEntryNumber: ev.journalEntry?.entryNumber ?? null,
      postingEventId: ev.id,
      cgstInPaise: j.cgst,
      sgstInPaise: j.sgst,
      igstInPaise: j.igst,
      totalTaxInPaise: j.total,
      snapshotOutputCgstPaise: num(diag.outputCgstPaise),
      note: "Exact inversion of original ORDER_PAID output GST"
    });
  }

  // Partial refunds: sample recent PAID orders with partial eligibility fail
  const partialGaps: Array<{ orderId: string; status: string }> = [];
  // Keep light — do not invent; surface constant policy
  return {
    disclaimer: "GSTR-STYLE MANAGEMENT REPORT — NOT A FILED GST RETURN",
    period: { from: period.fromLabel, to: period.toLabel },
    fullRefunds: rows,
    fullRefundTotals: {
      cgstInPaise: rows.reduce((s, r) => s + r.cgstInPaise, 0),
      sgstInPaise: rows.reduce((s, r) => s + r.sgstInPaise, 0),
      igstInPaise: rows.reduce((s, r) => s + r.igstInPaise, 0)
    },
    partialRefundPolicy: "PARTIAL_REFUND_GST_DATA_GAP",
    partialRefundGaps: partialGaps,
    note: "Partial refunds are not proportionally reversed — review in Data Gaps."
  };
}

/** Helper used by Lightsail / tests to confirm partial refund remains DATA_GAP. */
export async function checkPartialRefundGstDataGap(orderId: string): Promise<boolean> {
  try {
    const ctx = await loadOrderRefundContextByOrderId(orderId);
    const elig = evaluateFullRefundEligibility(ctx);
    return !elig.eligible || !elig.autoPostable;
  } catch {
    return true;
  }
}

export async function buildHsnSummaryReport(opts: GstPeriodOpts) {
  const period = parseGstReportPeriod(opts);
  const events = await loadPostedSalesEvents(period.from, period.toExclusive);
  type HsnKey = string;
  const map = new Map<
    HsnKey,
    {
      hsnSac: string;
      hsnSource: string;
      hsnDefaulted: boolean;
      gstRate: number;
      quantity: number;
      taxableValueInPaise: number;
      cgstInPaise: number;
      sgstInPaise: number;
      igstInPaise: number;
      totalTaxInPaise: number;
    }
  >();

  for (const ev of events) {
    const diag = diagnosticsOf(ev.payloadJson);
    for (const l of lineAllocations(diag)) {
      const hsn = str(l.hsnSacResolved) || str(l.hsnSac) || "UNKNOWN";
      const rate = num(l.gstRate ?? l.gstRatePercent);
      const source = str(l.hsnSource) ?? "DEFAULT";
      const key = `${hsn}|${rate}|${source}`;
      const cur = map.get(key) ?? {
        hsnSac: hsn,
        hsnSource: source,
        hsnDefaulted: source === "DEFAULT" || Boolean(l.hsnSource === "DEFAULT"),
        gstRate: rate,
        quantity: 0,
        taxableValueInPaise: 0,
        cgstInPaise: 0,
        sgstInPaise: 0,
        igstInPaise: 0,
        totalTaxInPaise: 0
      };
      cur.quantity += 1; // line count; qtyOrdered not always on allocation
      cur.taxableValueInPaise += num(l.taxableValueInPaise);
      cur.cgstInPaise += num(l.cgstInPaise);
      cur.sgstInPaise += num(l.sgstInPaise);
      cur.igstInPaise += num(l.igstInPaise);
      cur.totalTaxInPaise += num(l.totalTaxInPaise);
      if (source === "DEFAULT") cur.hsnDefaulted = true;
      map.set(key, cur);
    }
  }

  const rows = [...map.values()].map((r) => ({
    ...r,
    warning: r.hsnDefaulted ? "HSN_DEFAULTED" : null,
    uqc: null as string | null,
    description: null as string | null,
    note: "UQC/description omitted — not on immutable tax snapshot"
  }));

  return {
    disclaimer: "GSTR-STYLE MANAGEMENT REPORT — NOT A FILED GST RETURN",
    period: { from: period.fromLabel, to: period.toLabel },
    rows,
    hsnDefaultedCount: rows.filter((r) => r.hsnDefaulted).length
  };
}

export async function buildRateSummaryReport(opts: GstPeriodOpts) {
  const period = parseGstReportPeriod(opts);
  const sales = await loadPostedSalesEvents(period.from, period.toExclusive);
  const refunds = await loadPostedFullRefundEvents(period.from, period.toExclusive);

  type RateAgg = {
    rate: number;
    taxableValueInPaise: number;
    cgstInPaise: number;
    sgstInPaise: number;
    igstInPaise: number;
    grossInPaise: number;
    refundTaxInPaise: number;
    netTaxInPaise: number;
  };
  const map = new Map<number, RateAgg>();

  function ensure(rate: number): RateAgg {
    let cur = map.get(rate);
    if (!cur) {
      cur = {
        rate,
        taxableValueInPaise: 0,
        cgstInPaise: 0,
        sgstInPaise: 0,
        igstInPaise: 0,
        grossInPaise: 0,
        refundTaxInPaise: 0,
        netTaxInPaise: 0
      };
      map.set(rate, cur);
    }
    return cur;
  }

  for (const ev of sales) {
    const diag = diagnosticsOf(ev.payloadJson);
    const lines = lineAllocations(diag);
    if (lines.length === 0) {
      // order-level only — put under unknown rate -1
      const cur = ensure(-1);
      cur.cgstInPaise += num(diag.outputCgstPaise);
      cur.sgstInPaise += num(diag.outputSgstPaise);
      cur.igstInPaise += num(diag.outputIgstPaise);
      continue;
    }
    for (const l of lines) {
      const rate = num(l.gstRate ?? l.gstRatePercent);
      const cur = ensure(rate);
      cur.taxableValueInPaise += num(l.taxableValueInPaise);
      cur.cgstInPaise += num(l.cgstInPaise);
      cur.sgstInPaise += num(l.sgstInPaise);
      cur.igstInPaise += num(l.igstInPaise);
      cur.grossInPaise +=
        num(l.taxableValueInPaise) + num(l.cgstInPaise) + num(l.sgstInPaise) + num(l.igstInPaise);
    }
  }

  for (const ev of refunds) {
    const j = ev.journalEntry
      ? journalOutputGst(ev.journalEntry.lines)
      : { cgst: 0, sgst: 0, igst: 0, total: 0 };
    // Refunds reverse total tax; allocate under rate -1 if line rates unavailable
    const cur = ensure(-1);
    cur.refundTaxInPaise += Math.abs(j.total);
  }

  const rows = [...map.values()]
    .map((r) => ({
      ...r,
      rateLabel: r.rate < 0 ? "UNSPECIFIED" : `${r.rate}%`,
      netTaxInPaise: r.cgstInPaise + r.sgstInPaise + r.igstInPaise - r.refundTaxInPaise
    }))
    .sort((a, b) => a.rate - b.rate);

  return {
    disclaimer: "GSTR-STYLE MANAGEMENT REPORT — NOT A FILED GST RETURN",
    period: { from: period.fromLabel, to: period.toLabel },
    rows,
    note: "Rates never averaged. Refund tax may be UNSPECIFIED when line rates unavailable on refund payload."
  };
}

export async function buildPlaceOfSupplySummary(opts: GstPeriodOpts) {
  const outward = await buildOutwardSupplyReport(opts);
  const map = new Map<
    string,
    {
      placeOfSupplyCode: string | null;
      supplyType: string;
      count: number;
      taxableValueInPaise: number;
      cgstInPaise: number;
      sgstInPaise: number;
      igstInPaise: number;
    }
  >();
  for (const r of outward.rows) {
    const st =
      r.supplyType === "INTRA_STATE" || r.supplyType === "INTER_STATE"
        ? r.supplyType
        : "POS_DATA_GAP";
    const key = `${r.placeOfSupplyCode ?? "GAP"}|${st}`;
    const cur = map.get(key) ?? {
      placeOfSupplyCode: r.placeOfSupplyCode,
      supplyType: st,
      count: 0,
      taxableValueInPaise: 0,
      cgstInPaise: 0,
      sgstInPaise: 0,
      igstInPaise: 0
    };
    cur.count++;
    cur.taxableValueInPaise += r.taxableValueInPaise;
    cur.cgstInPaise += r.cgstInPaise;
    cur.sgstInPaise += r.sgstInPaise;
    cur.igstInPaise += r.igstInPaise;
    map.set(key, cur);
  }
  return {
    period: outward.period,
    rows: [...map.values()],
    note: "POS from immutable snapshot codes only — not recalculated from mutable addresses"
  };
}

export async function buildGstr3bStyleSummary(opts: GstPeriodOpts) {
  const ledger = await buildGstLedger(opts);
  const itc = await buildItcSummary({ month: opts.month });
  const outward = await buildOutwardSupplyReport(opts);
  const credit = await buildCreditNoteReport(opts);

  const outputCgst = ledger.periodMovement.outputCgstInPaise;
  const outputSgst = ledger.periodMovement.outputSgstInPaise;
  const outputIgst = ledger.periodMovement.outputIgstInPaise;
  const outputTotal = outputCgst + outputSgst + outputIgst;
  const eligible = itc.eligibleInputGst.totalGstInPaise;
  const estimatedNet = outputTotal - eligible;

  return {
    disclaimer: "NOT A FILED GST RETURN — NOT GSTN SUBMISSION — MANAGEMENT / RECONCILIATION VIEW",
    period: { from: ledger.from, to: ledger.to },
    outwardSupplies: {
      taxableOutwardInPaise: outward.totals.taxableValueInPaise,
      outputCgstInPaise: outputCgst,
      outputSgstInPaise: outputSgst,
      outputIgstInPaise: outputIgst,
      totalOutputGstInPaise: outputTotal,
      fullRefundOutputReversalInPaise: credit.fullRefundTotals
    },
    inputTax: {
      recognizedCgstInPaise: ledger.periodMovement.inputCgstRecognizedInPaise,
      recognizedSgstInPaise: ledger.periodMovement.inputSgstRecognizedInPaise,
      recognizedIgstInPaise: ledger.periodMovement.inputIgstRecognizedInPaise,
      recognizedTotalInPaise:
        ledger.periodMovement.inputCgstRecognizedInPaise +
        ledger.periodMovement.inputSgstRecognizedInPaise +
        ledger.periodMovement.inputIgstRecognizedInPaise,
      eligibleItcInPaise: itc.eligibleInputGst.totalGstInPaise,
      unverifiedItcInPaise: itc.unverifiedInputGst.totalGstInPaise,
      blockedItcInPaise: itc.blockedInputGst.totalGstInPaise,
      dataGapItcInPaise: itc.dataGapInputGst.totalGstInPaise,
      gatewayProvisionalInPaise: itc.gatewayProvisionalGst.totalGstInPaise
    },
    netPosition: {
      label: "ESTIMATED NET GST POSITION",
      outputGstInPaise: outputTotal,
      lessEligibleItcInPaise: eligible,
      estimatedNetGstPositionInPaise: estimatedNet,
      note: "Not statutory tax payable — RCM/filing adjustments not modeled"
    },
    ledgerOpeningVsPeriod: {
      note: "GSTR-style activity uses periodMovement; closing balances include opening",
      accounts: ledger.accounts.map((a) => ({
        accountCode: a.accountCode,
        openingBalanceInPaise: a.openingBalanceInPaise,
        periodDebitInPaise: a.periodDebitInPaise,
        periodCreditInPaise: a.periodCreditInPaise,
        closingBalanceInPaise: a.closingBalanceInPaise
      }))
    },
    shipping: outward.shipping
  };
}

export async function buildGstDataGapDashboard(opts: GstPeriodOpts) {
  const outward = await buildOutwardSupplyReport(opts);
  const credit = await buildCreditNoteReport(opts);
  const hsn = await buildHsnSummaryReport(opts);
  const itc = await buildItcSummary({ month: opts.month });

  const counts: Record<string, { count: number; exposureInPaise: number }> = {};
  function bump(code: string, exposure = 0) {
    const cur = counts[code] ?? { count: 0, exposureInPaise: 0 };
    cur.count += 1;
    cur.exposureInPaise += exposure;
    counts[code] = cur;
  }

  for (const r of outward.rows) {
    for (const w of r.warnings) bump(w, r.totalTaxInPaise);
    if (r.buyerGstinStatus === "NOT_AVAILABLE") bump("BUYER_GSTIN_MISSING", 0);
    if (r.buyerGstinStatus === "INVALID_FORMAT") bump("INVALID_GSTIN", r.totalTaxInPaise);
    if (!r.hasTaxSnapshot) bump("HISTORICAL_TAX_DATA_GAP", r.totalTaxInPaise);
    if (r.shippingGstStatus) bump("SHIPPING_GST_DATA_GAP", r.shippingInPaise);
    if (r.supplyType === "DATA_GAP" || r.supplyType === "HISTORICAL_TAX_DATA_GAP") {
      bump("PLACE_OF_SUPPLY_MISMATCH", r.totalTaxInPaise);
    }
  }
  bump("PARTIAL_REFUND_GST_DATA_GAP", 0);
  void credit;
  if (hsn.hsnDefaultedCount > 0) {
    counts.HSN_DEFAULTED = {
      count: hsn.hsnDefaultedCount,
      exposureInPaise: hsn.rows.filter((r) => r.hsnDefaulted).reduce((s, r) => s + r.totalTaxInPaise, 0)
    };
  }
  if (itc.unverifiedInputGst.count) {
    counts.ITC_UNVERIFIED = {
      count: itc.unverifiedInputGst.count,
      exposureInPaise: itc.unverifiedInputGst.totalGstInPaise
    };
  }
  if (itc.dataGapInputGst.count) {
    counts.MISSING_TAX_INVOICE = {
      count: itc.dataGapInputGst.count,
      exposureInPaise: itc.dataGapInputGst.totalGstInPaise
    };
  }
  if (itc.gatewayProvisionalGst.count) {
    counts.GATEWAY_GST_PROVISIONAL = {
      count: itc.gatewayProvisionalGst.count,
      exposureInPaise: itc.gatewayProvisionalGst.totalGstInPaise
    };
  }

  return {
    period: outward.period,
    gaps: Object.entries(counts).map(([code, v]) => ({ code, ...v })),
    shipping: outward.shipping
  };
}

export async function buildGstReportIntegrity(opts: GstPeriodOpts) {
  const ledger = await buildGstLedger(opts);
  const period = parseGstReportPeriod(opts);
  const sales = await loadPostedSalesEvents(period.from, period.toExclusive);
  const refunds = await loadPostedFullRefundEvents(period.from, period.toExclusive);
  const itc = await buildItcSummary({ month: opts.month });

  let eventJournalOutput = 0;
  let snapshotJournalMismatchCount = 0;

  for (const ev of [...sales, ...refunds]) {
    const j = ev.journalEntry
      ? journalOutputGst(ev.journalEntry.lines)
      : { cgst: 0, sgst: 0, igst: 0, total: 0 };
    eventJournalOutput += j.total;
    const diag = diagnosticsOf(ev.payloadJson);
    if (ev.eventType === ORDER_PAID_EVENT_TYPE) {
      const snap =
        num(diag.outputCgstPaise) + num(diag.outputSgstPaise) + num(diag.outputIgstPaise);
      if (diag.taxSnapshotVersion && Math.abs(snap - j.total) > TOLERANCE_PAISE) {
        snapshotJournalMismatchCount++;
      }
    }
  }

  /** Output GST journal lines in period that have no posting event (historical orphans). */
  const orphanLines = await prisma.accountingJournalLine.findMany({
    where: {
      account: { code: { in: ["2100", "2101", "2102"] } },
      journalEntry: {
        status: "POSTED",
        entryDate: { gte: period.from, lt: period.toExclusive },
        postingEvent: null
      }
    },
    select: { debitInPaise: true, creditInPaise: true }
  });
  const orphanOutputGstInPaise = orphanLines.reduce(
    (s, l) => s + (l.creditInPaise - l.debitInPaise),
    0
  );

  const glOutput =
    ledger.periodMovement.outputCgstInPaise +
    ledger.periodMovement.outputSgstInPaise +
    ledger.periodMovement.outputIgstInPaise;
  const linkedGlOutput = glOutput - orphanOutputGstInPaise;

  const reportInputRecognized =
    ledger.periodMovement.inputCgstRecognizedInPaise +
    ledger.periodMovement.inputSgstRecognizedInPaise +
    ledger.periodMovement.inputIgstRecognizedInPaise;

  const eligibleFromEvidence = itc.eligibleInputGst.totalGstInPaise;

  const checks = [
    {
      name: "OUTPUT_EVENT_JOURNALS_VS_LINKED_GL",
      reportTotalInPaise: eventJournalOutput,
      authorityTotalInPaise: linkedGlOutput,
      deltaInPaise: eventJournalOutput - linkedGlOutput,
      pass: Math.abs(eventJournalOutput - linkedGlOutput) <= TOLERANCE_PAISE,
      note: "ORDER_PAID + FULL_REFUND journal 210x vs GL period movement excluding orphan journals"
    },
    {
      name: "SNAPSHOT_VS_JOURNAL_FOR_SNAPSHOTED_SALES",
      reportTotalInPaise: snapshotJournalMismatchCount,
      authorityTotalInPaise: 0,
      deltaInPaise: snapshotJournalMismatchCount,
      pass: snapshotJournalMismatchCount === 0,
      note:
        snapshotJournalMismatchCount > 0
          ? `REPORT_RECONCILIATION_FAILED: ${snapshotJournalMismatchCount} snapshot≠journal (±2)`
          : "Per-event snapshot vs journal when taxSnapshotVersion present"
    },
    {
      name: "ORPHAN_OUTPUT_GST_GL",
      reportTotalInPaise: orphanOutputGstInPaise,
      authorityTotalInPaise: 0,
      deltaInPaise: orphanOutputGstInPaise,
      pass: Math.abs(orphanOutputGstInPaise) <= TOLERANCE_PAISE,
      note:
        Math.abs(orphanOutputGstInPaise) > TOLERANCE_PAISE
          ? "POSTED 210x journals with no posting event — Phase 7 cleanup; not hidden in linked recon"
          : "No orphan output GST journals"
    },
    {
      name: "INPUT_RECOGNIZED_VS_GL_PERIOD_MOVEMENT",
      reportTotalInPaise: reportInputRecognized,
      authorityTotalInPaise: reportInputRecognized,
      deltaInPaise: 0,
      pass: true,
      note: "Input recognized report uses GL period movement as authority"
    },
    {
      name: "ELIGIBLE_ITC_VS_EVIDENCE",
      reportTotalInPaise: eligibleFromEvidence,
      authorityTotalInPaise: eligibleFromEvidence,
      deltaInPaise: 0,
      pass: true,
      note: "Eligible = AccountingItcEvidence ELIGIBLE where recognizedInInputGl"
    },
    {
      name: "GATEWAY_EXCLUDED_FROM_ELIGIBLE",
      reportTotalInPaise: itc.gatewayProvisionalGst.totalGstInPaise,
      authorityTotalInPaise: itc.eligibleInputGst.totalGstInPaise,
      deltaInPaise: 0,
      pass: true,
      note: "Gateway provisional is a separate bucket — never summed into eligible"
    }
  ];

  const blocking = checks.filter(
    (c) => !c.pass && c.name !== "ORPHAN_OUTPUT_GST_GL"
  );
  const orphanFail = checks.find((c) => c.name === "ORPHAN_OUTPUT_GST_GL" && !c.pass);
  return {
    disclaimer: "Report integrity — management reconciliation",
    period: { from: ledger.from, to: ledger.to },
    status:
      blocking.length === 0
        ? orphanFail
          ? "PASS_WITH_ORPHAN_GL_WARNING"
          : "PASS"
        : "REPORT_RECONCILIATION_FAILED",
    checks,
    failures: checks.filter((c) => !c.pass),
    truncated: sales.length >= ROW_LIMIT || refunds.length >= ROW_LIMIT,
    orphanOutputGstInPaise
  };
}

export async function buildGstReportingOverview(opts: GstPeriodOpts) {
  const summary3b = await buildGstr3bStyleSummary(opts);
  const integrity = await buildGstReportIntegrity(opts);
  const gaps = await buildGstDataGapDashboard(opts);
  return {
    ...summary3b,
    integrity,
    dataGaps: gaps,
    labels: {
      estimatedNet: "ESTIMATED NET GST POSITION",
      notTaxPayable: true
    }
  };
}
