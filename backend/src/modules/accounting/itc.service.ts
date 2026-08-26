import type { AccountingItcStatus, Prisma } from "@prisma/client";

import { prisma } from "../../config/db";
import { writeAccountingAuditLog } from "./accounting-audit.service";
import {
  GATEWAY_ITC_RECLASSIFICATION_BOUNDARY,
  ITC_CLAIMED_UNAVAILABLE_CODE,
  type ItcStatus
} from "./itc.constants";
import type { ItcSummary, ItcSummaryBucket } from "./itc.types";

type Db = Prisma.TransactionClient | typeof prisma;

function emptyBucket(): ItcSummaryBucket {
  return { cgstInPaise: 0, sgstInPaise: 0, igstInPaise: 0, totalGstInPaise: 0, count: 0 };
}

function addTo(
  bucket: ItcSummaryBucket,
  row: { cgstInPaise: number; sgstInPaise: number; igstInPaise: number; totalGstInPaise: number }
) {
  bucket.cgstInPaise += row.cgstInPaise;
  bucket.sgstInPaise += row.sgstInPaise;
  bucket.igstInPaise += row.igstInPaise;
  bucket.totalGstInPaise += row.totalGstInPaise;
  bucket.count += 1;
}

export class ItcTransitionError extends Error {
  constructor(
    message: string,
    public code: string
  ) {
    super(message);
    this.name = "ItcTransitionError";
  }
}

const ALLOWED: Record<ItcStatus, ItcStatus[]> = {
  UNVERIFIED_PENDING_TAX_INVOICE: ["ELIGIBLE", "BLOCKED", "DATA_GAP"],
  DATA_GAP: ["ELIGIBLE", "BLOCKED", "UNVERIFIED_PENDING_TAX_INVOICE"],
  BLOCKED: ["DATA_GAP", "UNVERIFIED_PENDING_TAX_INVOICE", "ELIGIBLE"],
  ELIGIBLE: ["BLOCKED", "DATA_GAP"],
  REVERSED: [],
  CLAIMED: []
};

async function transitionStatus(opts: {
  evidenceId: string;
  newStatus: ItcStatus;
  actorUserId?: string | null;
  reason: string;
  requireReason?: boolean;
}) {
  if (opts.requireReason !== false && !opts.reason?.trim()) {
    throw new ItcTransitionError("Reason/note is required for this transition", "REASON_REQUIRED");
  }
  if (opts.newStatus === "CLAIMED") {
    throw new ItcTransitionError(
      "CLAIMED requires GST filing/period lock workflow (not available in Phase 5C)",
      ITC_CLAIMED_UNAVAILABLE_CODE
    );
  }

  return prisma.$transaction(async (tx) => {
    const row = await tx.accountingItcEvidence.findUnique({ where: { id: opts.evidenceId } });
    if (!row) {
      throw new ItcTransitionError("ITC evidence not found", "NOT_FOUND");
    }
    const oldStatus = row.status as ItcStatus;
    const allowed = ALLOWED[oldStatus] ?? [];
    if (!allowed.includes(opts.newStatus)) {
      throw new ItcTransitionError(
        `Cannot transition ${oldStatus} → ${opts.newStatus}`,
        "INVALID_TRANSITION"
      );
    }
    if (opts.newStatus === "ELIGIBLE" && oldStatus === "BLOCKED" && !opts.reason.trim()) {
      throw new ItcTransitionError("Override from BLOCKED requires reason", "REASON_REQUIRED");
    }

    const updated = await tx.accountingItcEvidence.update({
      where: { id: row.id },
      data: {
        status: opts.newStatus as AccountingItcStatus,
        verificationNotes: opts.reason.trim(),
        verifiedAt: opts.newStatus === "ELIGIBLE" ? new Date() : row.verifiedAt,
        verifiedByUserId:
          opts.newStatus === "ELIGIBLE" ? (opts.actorUserId ?? null) : row.verifiedByUserId
      }
    });

    await tx.accountingItcStatusHistory.create({
      data: {
        evidenceId: row.id,
        oldStatus: oldStatus as AccountingItcStatus,
        newStatus: opts.newStatus as AccountingItcStatus,
        actorUserId: opts.actorUserId ?? null,
        reason: opts.reason.trim()
      }
    });

    await writeAccountingAuditLog(
      {
        actorUserId: opts.actorUserId,
        action: "ITC_STATUS_CHANGED",
        entityType: "AccountingItcEvidence",
        entityId: row.id,
        beforeJson: { status: oldStatus },
        afterJson: {
          status: opts.newStatus,
          reason: opts.reason.trim(),
          glUnchanged: true,
          gatewayBoundary:
            row.sourceType === "GATEWAY_SETTLEMENT"
              ? GATEWAY_ITC_RECLASSIFICATION_BOUNDARY
              : undefined
        }
      },
      tx
    );

    return updated;
  });
}

export async function verifyItcEvidence(opts: {
  evidenceId: string;
  actorUserId?: string | null;
  reason: string;
}) {
  return transitionStatus({
    evidenceId: opts.evidenceId,
    newStatus: "ELIGIBLE",
    actorUserId: opts.actorUserId,
    reason: opts.reason || "Verified eligible by admin"
  });
}

export async function blockItcEvidence(opts: {
  evidenceId: string;
  actorUserId?: string | null;
  reason: string;
}) {
  return transitionStatus({
    evidenceId: opts.evidenceId,
    newStatus: "BLOCKED",
    actorUserId: opts.actorUserId,
    reason: opts.reason,
    requireReason: true
  });
}

export async function markItcDataGap(opts: {
  evidenceId: string;
  actorUserId?: string | null;
  reason: string;
}) {
  return transitionStatus({
    evidenceId: opts.evidenceId,
    newStatus: "DATA_GAP",
    actorUserId: opts.actorUserId,
    reason: opts.reason,
    requireReason: true
  });
}

export async function getItcEvidenceById(id: string) {
  return prisma.accountingItcEvidence.findUnique({
    where: { id },
    include: {
      statusHistory: { orderBy: { createdAt: "asc" } }
    }
  });
}

export async function listItcEvidence(opts?: {
  status?: ItcStatus;
  sourceType?: string;
  vendorQuery?: string;
  month?: string;
  limit?: number;
  offset?: number;
}) {
  const limit = Math.min(Math.max(opts?.limit ?? 50, 1), 200);
  const offset = Math.max(opts?.offset ?? 0, 0);
  const where: Prisma.AccountingItcEvidenceWhereInput = {};
  if (opts?.status) where.status = opts.status as AccountingItcStatus;
  if (opts?.sourceType) {
    where.sourceType = opts.sourceType as Prisma.EnumAccountingItcSourceTypeFilter["equals"];
  }
  if (opts?.vendorQuery?.trim()) {
    const q = opts.vendorQuery.trim();
    where.OR = [
      { supplierName: { contains: q, mode: "insensitive" } },
      { supplierGstin: { contains: q, mode: "insensitive" } },
      { documentReference: { contains: q, mode: "insensitive" } }
    ];
  }
  if (opts?.month?.trim() && /^\d{4}-\d{2}$/.test(opts.month.trim())) {
    const [y, mo] = opts.month.trim().split("-").map(Number);
    const from = new Date(Date.UTC(y!, mo! - 1, 1));
    const to = new Date(Date.UTC(y!, mo!, 1));
    where.documentDate = { gte: from, lt: to };
  }

  const [rows, total] = await Promise.all([
    prisma.accountingItcEvidence.findMany({
      where,
      orderBy: [{ documentDate: "desc" }, { createdAt: "desc" }],
      take: limit,
      skip: offset
    }),
    prisma.accountingItcEvidence.count({ where })
  ]);
  return { rows, total, limit, offset };
}

/**
 * ITC summary — claimability buckets from evidence rows.
 * recognizedInputGst only sums rows with recognizedInInputGl=true (2200–2202).
 * Never derives "eligible" from GL balances alone.
 */
export async function buildItcSummary(_opts?: { month?: string }): Promise<ItcSummary> {
  const where: Prisma.AccountingItcEvidenceWhereInput = {};
  if (_opts?.month?.trim() && /^\d{4}-\d{2}$/.test(_opts.month.trim())) {
    const [y, mo] = _opts.month.trim().split("-").map(Number);
    const from = new Date(Date.UTC(y!, mo! - 1, 1));
    const to = new Date(Date.UTC(y!, mo!, 1));
    where.documentDate = { gte: from, lt: to };
  }

  const rows = await prisma.accountingItcEvidence.findMany({ where });
  const summary: ItcSummary = {
    recognizedInputGst: emptyBucket(),
    eligibleInputGst: emptyBucket(),
    blockedInputGst: emptyBucket(),
    unverifiedInputGst: emptyBucket(),
    dataGapInputGst: emptyBucket(),
    reversedInputGst: emptyBucket(),
    claimedInputGst: emptyBucket(),
    gatewayProvisionalGst: emptyBucket(),
    note: "Eligible totals come from ITC evidence status, not from 2200–2202 GL balances alone"
  };

  for (const r of rows) {
    if (r.sourceType === "GATEWAY_SETTLEMENT") {
      addTo(summary.gatewayProvisionalGst, {
        cgstInPaise: 0,
        sgstInPaise: 0,
        igstInPaise: 0,
        totalGstInPaise: r.totalGstInPaise
      });
      continue;
    }
    if (r.recognizedInInputGl) {
      addTo(summary.recognizedInputGst, r);
    }
    switch (r.status) {
      case "ELIGIBLE":
        if (r.recognizedInInputGl) addTo(summary.eligibleInputGst, r);
        break;
      case "BLOCKED":
        if (r.recognizedInInputGl) addTo(summary.blockedInputGst, r);
        break;
      case "UNVERIFIED_PENDING_TAX_INVOICE":
        if (r.recognizedInInputGl) addTo(summary.unverifiedInputGst, r);
        break;
      case "DATA_GAP":
        if (r.recognizedInInputGl) addTo(summary.dataGapInputGst, r);
        break;
      case "REVERSED":
        if (r.recognizedInInputGl) addTo(summary.reversedInputGst, r);
        break;
      case "CLAIMED":
        if (r.recognizedInInputGl) addTo(summary.claimedInputGst, r);
        break;
      default:
        break;
    }
  }

  return summary;
}

/** Assert GL journal lines unchanged (helper for tests / validation). */
export async function fingerprintJournal(journalEntryId: string | null | undefined, db: Db = prisma) {
  if (!journalEntryId) return null;
  const entry = await db.accountingJournalEntry.findUnique({
    where: { id: journalEntryId },
    include: { lines: { orderBy: { id: "asc" } } }
  });
  if (!entry) return null;
  return {
    entryId: entry.id,
    status: entry.status,
    totalDebitInPaise: entry.totalDebitInPaise,
    totalCreditInPaise: entry.totalCreditInPaise,
    lines: entry.lines.map((l) => ({
      accountId: l.accountId,
      debitInPaise: l.debitInPaise,
      creditInPaise: l.creditInPaise
    }))
  };
}
