import type { AccountingItcStatus, Prisma } from "@prisma/client";

import { prisma } from "../../config/db";

import { getPostingEvent } from "./posting-event.service";
import {
  VENDOR_BILL_POSTED_EVENT_TYPE,
  vendorBillPostedUniqueKey
} from "./vendor-bill.constants";
import { EXPENSE_RECORDED_EVENT_TYPE, expenseRecordedUniqueKey } from "./expense.constants";
import {
  assessExpenseItc,
  assessGatewayItc,
  assessVendorBillItc
} from "./itc-eligibility.service";
import { itcEvidenceUniqueKey, type ItcSourceType } from "./itc.constants";
import type { ItcEvidenceDraft } from "./itc.types";

type Db = Prisma.TransactionClient | typeof prisma;

function journalInputGst(
  lines: Array<{ account: { code: string }; debitInPaise: number; creditInPaise: number }>
) {
  let cgst = 0;
  let sgst = 0;
  let igst = 0;
  for (const l of lines) {
    const net = l.debitInPaise - l.creditInPaise;
    if (l.account.code === "2200") cgst += net;
    if (l.account.code === "2201") sgst += net;
    if (l.account.code === "2202") igst += net;
  }
  return { cgst, sgst, igst, total: cgst + sgst + igst };
}

async function draftVendorBill(billId: string): Promise<ItcEvidenceDraft | null> {
  const bill = await prisma.vendorBill.findUnique({
    where: { id: billId },
    include: {
      vendor: { select: { name: true, gstin: true, billingState: true } }
    }
  });
  if (!bill) return null;
  if (bill.status === "DRAFT" || bill.status === "VOID") return null;

  const event = await getPostingEvent(
    VENDOR_BILL_POSTED_EVENT_TYPE,
    vendorBillPostedUniqueKey(bill.id)
  );
  const payload = (event?.payloadJson ?? {}) as Record<string, unknown>;
  const diagnostics = (payload.diagnostics ?? {}) as Record<string, unknown>;
  const gst = (diagnostics.gst ?? {}) as Record<string, unknown>;
  const dataGapCodes = Array.isArray(gst.dataGapCodes)
    ? (gst.dataGapCodes as string[])
    : [];

  let journalCgst = 0;
  let journalSgst = 0;
  let journalIgst = 0;
  let journalEntryId: string | null = event?.journalEntryId ?? null;
  if (event?.status === "POSTED" && event.journalEntryId) {
    const entry = await prisma.accountingJournalEntry.findUnique({
      where: { id: event.journalEntryId },
      include: { lines: { include: { account: { select: { code: true } } } } }
    });
    if (entry) {
      const j = journalInputGst(entry.lines);
      journalCgst = j.cgst;
      journalSgst = j.sgst;
      journalIgst = j.igst;
    }
  }

  const snapC = Number(gst.cgstInPaise ?? 0);
  const snapS = Number(gst.sgstInPaise ?? 0);
  const snapI = Number(gst.igstInPaise ?? 0);
  const gstRecognized = Boolean(gst.gstRecognized) && journalCgst + journalSgst + journalIgst > 0;

  const assessment = assessVendorBillItc({
    reverseCharge: bill.reverseCharge,
    taxInPaise: bill.taxInPaise,
    referenceNumber: bill.referenceNumber,
    vendorGstin: bill.vendor.gstin,
    vendorBillingState: bill.vendor.billingState,
    gstRecognizedInJournal: gstRecognized,
    journalCgst,
    journalSgst,
    journalIgst,
    snapshotCgst: snapC,
    snapshotSgst: snapS,
    snapshotIgst: snapI,
    jurisdiction: typeof gst.jurisdiction === "string" ? gst.jurisdiction : null,
    postingDataGapCodes: dataGapCodes
  });

  const taxable =
    bill.subtotalInPaise - bill.discountInPaise + bill.adjustmentInPaise;

  return {
    sourceType: "VENDOR_BILL",
    sourceId: bill.id,
    uniqueKey: itcEvidenceUniqueKey("VENDOR_BILL", bill.id),
    documentReference: bill.referenceNumber?.trim() || bill.billNumber,
    supplierGstin: bill.vendor.gstin?.trim() || null,
    supplierName: bill.vendor.name,
    documentDate: bill.billDate,
    taxableValueInPaise: Math.max(0, taxable),
    cgstInPaise: journalCgst || snapC,
    sgstInPaise: journalSgst || snapS,
    igstInPaise: journalIgst || snapI,
    totalGstInPaise: (journalCgst || snapC) + (journalSgst || snapS) + (journalIgst || snapI),
    recognizedInInputGl: gstRecognized,
    postingEventId: event?.id ?? null,
    journalEntryId,
    assessment
  };
}

async function draftExpense(expenseId: string): Promise<ItcEvidenceDraft | null> {
  const exp = await prisma.expense.findUnique({
    where: { id: expenseId },
    include: {
      vendor: { select: { name: true, gstin: true, billingState: true, billingCountry: true } }
    }
  });
  if (!exp || exp.status === "DRAFT") return null;

  const event = await getPostingEvent(
    EXPENSE_RECORDED_EVENT_TYPE,
    expenseRecordedUniqueKey(exp.id)
  );
  const payload = (event?.payloadJson ?? {}) as Record<string, unknown>;
  const diagnostics = (payload.diagnostics ?? {}) as Record<string, unknown>;
  const gst = (diagnostics.gst ?? {}) as Record<string, unknown>;
  const dataGapCodes = Array.isArray(gst.dataGapCodes)
    ? (gst.dataGapCodes as string[])
    : [];

  let journalCgst = 0;
  let journalSgst = 0;
  let journalIgst = 0;
  let journalEntryId: string | null = event?.journalEntryId ?? null;
  if (event?.status === "POSTED" && event.journalEntryId) {
    const entry = await prisma.accountingJournalEntry.findUnique({
      where: { id: event.journalEntryId },
      include: { lines: { include: { account: { select: { code: true } } } } }
    });
    if (entry) {
      const j = journalInputGst(entry.lines);
      journalCgst = j.cgst;
      journalSgst = j.sgst;
      journalIgst = j.igst;
    }
  }

  const snapC = Number(gst.cgstInPaise ?? 0);
  const snapS = Number(gst.sgstInPaise ?? 0);
  const snapI = Number(gst.igstInPaise ?? 0);
  const gstRecognized = Boolean(gst.gstRecognized) && journalCgst + journalSgst + journalIgst > 0;
  const inv =
    exp.invoiceNumber?.trim() || exp.referenceNumber?.trim() || null;

  const assessment = assessExpenseItc({
    reverseCharge: exp.reverseCharge,
    taxInPaise: exp.taxInPaise,
    invoiceOrReference: inv,
    vendorId: exp.vendorId,
    vendorGstin: exp.vendor?.gstin,
    gstRecognizedInJournal: gstRecognized,
    journalCgst,
    journalSgst,
    journalIgst,
    snapshotCgst: snapC,
    snapshotSgst: snapS,
    snapshotIgst: snapI,
    postingDataGapCodes: dataGapCodes,
    hsnSac: exp.hsnSac
  });

  const taxable = exp.taxInclusive
    ? Math.max(0, exp.amountInPaise - exp.taxInPaise)
    : exp.amountInPaise;

  return {
    sourceType: "EXPENSE",
    sourceId: exp.id,
    uniqueKey: itcEvidenceUniqueKey("EXPENSE", exp.id),
    documentReference: inv,
    supplierGstin: exp.vendor?.gstin?.trim() || null,
    supplierName: exp.vendor?.name ?? null,
    documentDate: exp.expenseDate,
    taxableValueInPaise: taxable,
    cgstInPaise: journalCgst || snapC,
    sgstInPaise: journalSgst || snapS,
    igstInPaise: journalIgst || snapI,
    totalGstInPaise: (journalCgst || snapC) + (journalSgst || snapS) + (journalIgst || snapI),
    recognizedInInputGl: gstRecognized,
    postingEventId: event?.id ?? null,
    journalEntryId,
    assessment
  };
}

async function draftGateway(settlementId: string): Promise<ItcEvidenceDraft | null> {
  const s = await prisma.accountingGatewaySettlement.findUnique({
    where: { id: settlementId }
  });
  if (!s) return null;
  if (s.taxInPaise <= 0) return null;

  const assessment = assessGatewayItc({
    taxInPaise: s.taxInPaise,
    feeInPaise: s.feeInPaise,
    settlementPosted: s.status === "POSTED" && Boolean(s.journalEntryId)
  });

  return {
    sourceType: "GATEWAY_SETTLEMENT",
    sourceId: s.id,
    uniqueKey: itcEvidenceUniqueKey("GATEWAY_SETTLEMENT", s.id),
    documentReference: s.utr || s.providerSettlementId,
    supplierGstin: null,
    supplierName: `Razorpay settlement ${s.providerSettlementId}`,
    documentDate: s.settledAt,
    taxableValueInPaise: 0,
    cgstInPaise: 0,
    sgstInPaise: 0,
    igstInPaise: 0,
    totalGstInPaise: s.taxInPaise,
    recognizedInInputGl: false,
    postingEventId: s.postingEventId,
    journalEntryId: s.journalEntryId,
    assessment
  };
}

async function upsertDraft(draft: ItcEvidenceDraft, db: Db = prisma) {
  const status = draft.assessment.suggestedStatus as AccountingItcStatus;
  const data = {
    documentReference: draft.documentReference,
    supplierGstin: draft.supplierGstin,
    supplierName: draft.supplierName,
    documentDate: draft.documentDate,
    taxableValueInPaise: draft.taxableValueInPaise,
    cgstInPaise: draft.cgstInPaise,
    sgstInPaise: draft.sgstInPaise,
    igstInPaise: draft.igstInPaise,
    totalGstInPaise: draft.totalGstInPaise,
    recognizedInInputGl: draft.recognizedInInputGl,
    postingEventId: draft.postingEventId,
    journalEntryId: draft.journalEntryId,
    assessmentCode: draft.assessment.assessmentCode,
    assessmentJson: draft.assessment as unknown as Prisma.InputJsonValue,
    evidenceWarnings: draft.assessment.warnings as unknown as Prisma.InputJsonValue
  };

  const existing = await db.accountingItcEvidence.findUnique({
    where: { uniqueKey: draft.uniqueKey }
  });

  if (existing) {
    /** Do not overwrite terminal human decisions on rediscovery. */
    const locked: AccountingItcStatus[] = ["ELIGIBLE", "BLOCKED", "CLAIMED", "REVERSED"];
    const nextStatus = locked.includes(existing.status) ? existing.status : status;
    return db.accountingItcEvidence.update({
      where: { id: existing.id },
      data: {
        ...data,
        status: nextStatus
      }
    });
  }

  return prisma.$transaction(async (tx) => {
    const row = await tx.accountingItcEvidence.create({
      data: {
        sourceType: draft.sourceType,
        sourceId: draft.sourceId,
        uniqueKey: draft.uniqueKey,
        status,
        ...data
      }
    });
    await tx.accountingItcStatusHistory.create({
      data: {
        evidenceId: row.id,
        oldStatus: null,
        newStatus: status,
        actorUserId: null,
        reason: `discovery:${draft.assessment.assessmentCode}`
      }
    });
    return row;
  });
}

export async function discoverItcEvidence(opts?: {
  sourceType?: ItcSourceType | "ALL";
  limit?: number;
}): Promise<{
  scanned: number;
  created: number;
  updated: number;
  skipped: number;
  ids: string[];
}> {
  const limit = Math.min(Math.max(opts?.limit ?? 100, 1), 500);
  const scope = opts?.sourceType ?? "ALL";
  let scanned = 0;
  let created = 0;
  let updated = 0;
  let skipped = 0;
  const ids: string[] = [];

  if (scope === "ALL" || scope === "VENDOR_BILL") {
    const bills = await prisma.vendorBill.findMany({
      where: { status: { in: ["OPEN", "PAID"] }, taxInPaise: { gt: 0 } },
      orderBy: { billDate: "desc" },
      take: limit,
      select: { id: true }
    });
    for (const b of bills) {
      scanned++;
      const draft = await draftVendorBill(b.id);
      if (!draft) {
        skipped++;
        continue;
      }
      const before = await prisma.accountingItcEvidence.findUnique({
        where: { uniqueKey: draft.uniqueKey }
      });
      const row = await upsertDraft(draft);
      ids.push(row.id);
      if (before) updated++;
      else created++;
    }
  }

  if (scope === "ALL" || scope === "EXPENSE") {
    const expenses = await prisma.expense.findMany({
      where: { status: { not: "DRAFT" }, taxInPaise: { gt: 0 } },
      orderBy: { expenseDate: "desc" },
      take: limit,
      select: { id: true }
    });
    for (const e of expenses) {
      scanned++;
      const draft = await draftExpense(e.id);
      if (!draft) {
        skipped++;
        continue;
      }
      const before = await prisma.accountingItcEvidence.findUnique({
        where: { uniqueKey: draft.uniqueKey }
      });
      const row = await upsertDraft(draft);
      ids.push(row.id);
      if (before) updated++;
      else created++;
    }
  }

  if (scope === "ALL" || scope === "GATEWAY_SETTLEMENT") {
    const settlements = await prisma.accountingGatewaySettlement.findMany({
      where: { taxInPaise: { gt: 0 } },
      orderBy: { settledAt: "desc" },
      take: limit,
      select: { id: true }
    });
    for (const s of settlements) {
      scanned++;
      const draft = await draftGateway(s.id);
      if (!draft) {
        skipped++;
        continue;
      }
      const before = await prisma.accountingItcEvidence.findUnique({
        where: { uniqueKey: draft.uniqueKey }
      });
      const row = await upsertDraft(draft);
      ids.push(row.id);
      if (before) updated++;
      else created++;
    }
  }

  return { scanned, created, updated, skipped, ids };
}

export async function discoverItcForSource(
  sourceType: ItcSourceType,
  sourceId: string
) {
  let draft: ItcEvidenceDraft | null = null;
  if (sourceType === "VENDOR_BILL") draft = await draftVendorBill(sourceId);
  else if (sourceType === "EXPENSE") draft = await draftExpense(sourceId);
  else draft = await draftGateway(sourceId);
  if (!draft) return null;
  return upsertDraft(draft);
}
