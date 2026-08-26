import type {
  AccountingBankStatementLineMatchStatus,
  AccountingBankStatementMatchConfidence,
  AccountingBankStatementMatchType
} from "@prisma/client";

import { prisma } from "../../config/db";

import { writeAccountingAuditLog } from "./accounting-audit.service";
import {
  BankStatementImportNotFoundError,
  BankStatementLineNotFoundError,
  BankStatementMatchError
} from "./accounting-errors";
import {
  normalizeStatementReference,
  STATEMENT_EXACT_DATE_TOLERANCE_DAYS,
  STATEMENT_HIGH_DATE_TOLERANCE_DAYS,
  STATEMENT_JOURNAL_SEARCH_DAYS,
  STATEMENT_POSSIBLE_DATE_TOLERANCE_DAYS
} from "./bank-statement.constants";
import type { StatementMatchCandidate } from "./bank-statement.types";
import { getAccountingAccountByCode } from "./seed-coa";

type BankJournalLeg = {
  journalEntryId: string;
  entryNumber: string;
  entryDate: Date;
  bankGlAccountCode: string;
  debitInPaise: number;
  creditInPaise: number;
  matchType: AccountingBankStatementMatchType;
  sourceEntityType: string | null;
  sourceEntityId: string | null;
  reference: string | null;
  memo: string | null;
};

function daysBetween(a: Date, b: Date): number {
  const ms = Math.abs(a.getTime() - b.getTime());
  return Math.floor(ms / 86400000);
}

function statementAmountInPaise(line: { debitInPaise: number; creditInPaise: number }): number {
  return line.debitInPaise > 0 ? line.debitInPaise : line.creditInPaise;
}

function statementIsCredit(line: { debitInPaise: number; creditInPaise: number }): boolean {
  return line.creditInPaise > 0;
}

function journalDirectionMatchesStatement(
  line: { debitInPaise: number; creditInPaise: number },
  leg: BankJournalLeg
): boolean {
  const creditLine = statementIsCredit(line);
  if (creditLine) return leg.debitInPaise > 0 && leg.debitInPaise === statementAmountInPaise(line);
  return leg.creditInPaise > 0 && leg.creditInPaise === statementAmountInPaise(line);
}

function referencesMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = normalizeStatementReference(a);
  const nb = normalizeStatementReference(b);
  return na.length >= 6 && nb.length >= 6 && na === nb;
}

function referencesPartiallyMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = normalizeStatementReference(a);
  const nb = normalizeStatementReference(b);
  if (na.length < 6 || nb.length < 6) return false;
  return na.includes(nb) || nb.includes(na);
}

async function loadPostedBankJournalLegs(
  bankGlAccountCode: string,
  from: Date,
  to: Date
): Promise<BankJournalLeg[]> {
  const acct = await getAccountingAccountByCode(bankGlAccountCode);
  if (!acct) return [];

  const lines = await prisma.accountingJournalLine.findMany({
    where: {
      accountId: acct.id,
      journalEntry: {
        status: "POSTED",
        entryDate: { gte: from, lte: to }
      }
    },
    include: {
      journalEntry: {
        include: {
          postingEvent: true,
          gatewaySettlement: true,
          vendorPayment: true,
          bankTransfer: {
            include: {
              sourceBankAccount: true,
              destinationBankAccount: true
            }
          }
        }
      }
    }
  });

  const legs: BankJournalLeg[] = [];
  for (const jl of lines) {
    const je = jl.journalEntry;
    let matchType: AccountingBankStatementMatchType = "JOURNAL_OTHER";
    let sourceEntityType: string | null = null;
    let sourceEntityId: string | null = null;
    let reference: string | null = null;

    if (je.gatewaySettlement) {
      matchType = "RAZORPAY_SETTLEMENT";
      sourceEntityType = "AccountingGatewaySettlement";
      sourceEntityId = je.gatewaySettlement.id;
      reference = je.gatewaySettlement.utr;
    } else if (je.vendorPayment) {
      matchType = "VENDOR_PAYMENT";
      sourceEntityType = "AccountingVendorPayment";
      sourceEntityId = je.vendorPayment.id;
      reference = je.vendorPayment.utr;
    } else if (je.bankTransfer) {
      matchType = "BANK_TRANSFER";
      sourceEntityType = "AccountingBankTransfer";
      sourceEntityId = je.bankTransfer.id;
      reference = je.bankTransfer.reference;
    } else if (je.postingEvent?.eventType === "BANK_OPENING_BALANCE") {
      matchType = "BANK_OPENING";
      sourceEntityType = "AccountingBankAccount";
      sourceEntityId = je.postingEvent.sourceId;
    } else if (je.postingEvent?.eventType === "EXPENSE_RECORDED") {
      matchType = "EXPENSE";
      sourceEntityType = "Expense";
      sourceEntityId = je.postingEvent.sourceId;
    }

    legs.push({
      journalEntryId: je.id,
      entryNumber: je.entryNumber,
      entryDate: je.entryDate,
      bankGlAccountCode,
      debitInPaise: jl.debitInPaise,
      creditInPaise: jl.creditInPaise,
      matchType,
      sourceEntityType,
      sourceEntityId,
      reference,
      memo: je.memo
    });
  }

  return legs;
}

function scoreCandidate(
  line: {
    transactionDate: Date;
    reference: string | null;
    description: string;
    debitInPaise: number;
    creditInPaise: number;
  },
  leg: BankJournalLeg,
  bankAccountId: string,
  bankGlAccountCode: string
): StatementMatchCandidate | null {
  if (leg.bankGlAccountCode !== bankGlAccountCode) return null;
  if (!journalDirectionMatchesStatement(line, leg)) return null;

  const amount = statementAmountInPaise(line);
  const legAmount = leg.debitInPaise > 0 ? leg.debitInPaise : leg.creditInPaise;
  if (amount !== legAmount) return null;

  const dayDiff = daysBetween(line.transactionDate, leg.entryDate);
  const evidence: string[] = [];
  let confidence: AccountingBankStatementMatchConfidence = "POSSIBLE";

  const refMatch = referencesMatch(line.reference, leg.reference);
  const refPartial =
    !refMatch && referencesPartiallyMatch(line.reference, leg.reference ?? line.description);

  if (leg.matchType === "RAZORPAY_SETTLEMENT" && refMatch && dayDiff <= STATEMENT_EXACT_DATE_TOLERANCE_DAYS) {
    confidence = "EXACT";
    evidence.push("UTR_EXACT", "AMOUNT_EXACT", "DIRECTION_OK", "SETTLEMENT_NET");
  } else if (leg.matchType === "VENDOR_PAYMENT" && refMatch && dayDiff <= STATEMENT_EXACT_DATE_TOLERANCE_DAYS) {
    confidence = "EXACT";
    evidence.push("UTR_EXACT", "AMOUNT_EXACT", "DIRECTION_OK", "VENDOR_PAYMENT");
  } else if (leg.matchType === "BANK_TRANSFER" && refMatch && dayDiff <= STATEMENT_EXACT_DATE_TOLERANCE_DAYS) {
    confidence = "EXACT";
    evidence.push("TRANSFER_REF_EXACT", "AMOUNT_EXACT", "DIRECTION_OK");
  } else if (refMatch && dayDiff <= STATEMENT_EXACT_DATE_TOLERANCE_DAYS) {
    confidence = "EXACT";
    evidence.push("REFERENCE_EXACT", "AMOUNT_EXACT", "DIRECTION_OK");
  } else if (
    (refPartial || referencesPartiallyMatch(line.description, leg.reference)) &&
    dayDiff <= STATEMENT_HIGH_DATE_TOLERANCE_DAYS
  ) {
    confidence = "HIGH";
    evidence.push("REFERENCE_PARTIAL", "AMOUNT_EXACT", "DIRECTION_OK");
  } else if (dayDiff <= STATEMENT_POSSIBLE_DATE_TOLERANCE_DAYS) {
    confidence = "POSSIBLE";
    evidence.push("AMOUNT_EXACT", "DATE_PROXIMITY", "DIRECTION_OK");
  } else {
    return null;
  }

  return {
    journalEntryId: leg.journalEntryId,
    entryNumber: leg.entryNumber,
    matchType: leg.matchType,
    confidence,
    matchedAmountInPaise: amount,
    bankGlAccountCode,
    sourceEntityType: leg.sourceEntityType,
    sourceEntityId: leg.sourceEntityId,
    evidence
  };
}

async function findCandidatesForLine(
  line: {
    id: string;
    bankAccountId: string;
    transactionDate: Date;
    reference: string | null;
    description: string;
    debitInPaise: number;
    creditInPaise: number;
  },
  bankGlAccountCode: string
): Promise<StatementMatchCandidate[]> {
  const amount = statementAmountInPaise(line);
  const isCredit = statementIsCredit(line);
  const candidates: StatementMatchCandidate[] = [];
  const seen = new Set<string>();

  const push = (candidate: StatementMatchCandidate) => {
    if (seen.has(candidate.journalEntryId)) return;
    seen.add(candidate.journalEntryId);
    candidates.push(candidate);
  };

  if (isCredit) {
    const settlements = await prisma.accountingGatewaySettlement.findMany({
      where: {
        journalEntryId: { not: null },
        netInPaise: amount,
        targetBankAccountId: line.bankAccountId
      },
      include: { journalEntry: true }
    });
    for (const s of settlements) {
      if (!s.journalEntry || s.journalEntry.status !== "POSTED") continue;
      const dayDiff = daysBetween(line.transactionDate, s.settledAt);
      const refMatch = referencesMatch(line.reference, s.utr);
      let confidence: AccountingBankStatementMatchConfidence = "POSSIBLE";
      const evidence = ["AMOUNT_EXACT", "DIRECTION_OK", "SETTLEMENT_NET"];
      if (refMatch && dayDiff <= STATEMENT_EXACT_DATE_TOLERANCE_DAYS) {
        confidence = "EXACT";
        evidence.push("UTR_EXACT");
      } else if (
        (referencesPartiallyMatch(line.reference, s.utr) ||
          referencesPartiallyMatch(line.description, s.utr)) &&
        dayDiff <= STATEMENT_HIGH_DATE_TOLERANCE_DAYS
      ) {
        confidence = "HIGH";
        evidence.push("UTR_PARTIAL");
      } else if (dayDiff > STATEMENT_POSSIBLE_DATE_TOLERANCE_DAYS) {
        continue;
      } else {
        evidence.push("DATE_PROXIMITY");
      }
      push({
        journalEntryId: s.journalEntryId!,
        entryNumber: s.journalEntry.entryNumber,
        matchType: "RAZORPAY_SETTLEMENT",
        confidence,
        matchedAmountInPaise: amount,
        bankGlAccountCode,
        sourceEntityType: "AccountingGatewaySettlement",
        sourceEntityId: s.id,
        evidence
      });
    }
  } else {
    const payments = await prisma.accountingVendorPayment.findMany({
      where: {
        status: "POSTED",
        journalEntryId: { not: null },
        amountInPaise: amount,
        bankAccountId: line.bankAccountId
      },
      include: { journalEntry: true }
    });
    for (const p of payments) {
      if (!p.journalEntry || p.journalEntry.status !== "POSTED") continue;
      const dayDiff = daysBetween(line.transactionDate, p.paymentDate);
      const refMatch = referencesMatch(line.reference, p.utr);
      let confidence: AccountingBankStatementMatchConfidence = "POSSIBLE";
      const evidence = ["AMOUNT_EXACT", "DIRECTION_OK", "VENDOR_PAYMENT"];
      if (refMatch && dayDiff <= STATEMENT_EXACT_DATE_TOLERANCE_DAYS) {
        confidence = "EXACT";
        evidence.push("UTR_EXACT");
      } else if (dayDiff > STATEMENT_POSSIBLE_DATE_TOLERANCE_DAYS) {
        continue;
      } else {
        evidence.push("DATE_PROXIMITY");
      }
      push({
        journalEntryId: p.journalEntryId!,
        entryNumber: p.journalEntry.entryNumber,
        matchType: "VENDOR_PAYMENT",
        confidence,
        matchedAmountInPaise: amount,
        bankGlAccountCode,
        sourceEntityType: "AccountingVendorPayment",
        sourceEntityId: p.id,
        evidence
      });
    }
  }

  const transfers = await prisma.accountingBankTransfer.findMany({
    where: {
      status: "POSTED",
      journalEntryId: { not: null },
      amountInPaise: amount
    },
    include: {
      journalEntry: true,
      sourceBankAccount: true,
      destinationBankAccount: true
    }
  });
  for (const t of transfers) {
    if (!t.journalEntry || t.journalEntry.status !== "POSTED") continue;
    const legBank =
      isCredit && t.destinationBankAccountId === line.bankAccountId
        ? t.destinationBankAccount.glAccountCode
        : !isCredit && t.sourceBankAccountId === line.bankAccountId
          ? t.sourceBankAccount.glAccountCode
          : null;
    if (!legBank) continue;
    const dayDiff = daysBetween(line.transactionDate, t.transferDate);
    const refMatch = referencesMatch(line.reference, t.reference);
    let confidence: AccountingBankStatementMatchConfidence = "POSSIBLE";
    const evidence = ["AMOUNT_EXACT", "DIRECTION_OK", "BANK_TRANSFER"];
    if (refMatch && dayDiff <= STATEMENT_EXACT_DATE_TOLERANCE_DAYS) {
      confidence = "EXACT";
      evidence.push("TRANSFER_REF_EXACT");
    } else if (dayDiff > STATEMENT_POSSIBLE_DATE_TOLERANCE_DAYS) {
      continue;
    } else {
      evidence.push("DATE_PROXIMITY");
    }
    push({
      journalEntryId: t.journalEntryId!,
      entryNumber: t.journalEntry.entryNumber,
      matchType: "BANK_TRANSFER",
      confidence,
      matchedAmountInPaise: amount,
      bankGlAccountCode: legBank,
      sourceEntityType: "AccountingBankTransfer",
      sourceEntityId: t.id,
      evidence
    });
  }

  const from = new Date(line.transactionDate);
  from.setUTCDate(from.getUTCDate() - STATEMENT_JOURNAL_SEARCH_DAYS);
  const to = new Date(line.transactionDate);
  to.setUTCDate(to.getUTCDate() + STATEMENT_JOURNAL_SEARCH_DAYS);

  const legs = await loadPostedBankJournalLegs(bankGlAccountCode, from, to);
  for (const leg of legs) {
    if (leg.matchType === "VENDOR_PAYMENT" || leg.matchType === "RAZORPAY_SETTLEMENT" || leg.matchType === "BANK_TRANSFER") {
      continue;
    }
    const scored = scoreCandidate(line, leg, line.bankAccountId, bankGlAccountCode);
    if (scored) push(scored);
  }

  // Same bank account: a journal may only be CONFIRMED on one statement line.
  // Cross-account reuse (e.g. transfer debit + credit legs) remains allowed.
  const claimedOnSameBank = await prisma.accountingBankStatementMatch.findMany({
    where: {
      status: "CONFIRMED",
      statementLine: { bankAccountId: line.bankAccountId, id: { not: line.id } }
    },
    select: { journalEntryId: true }
  });
  const claimedIds = new Set(claimedOnSameBank.map((m) => m.journalEntryId));
  const available = candidates.filter((c) => !claimedIds.has(c.journalEntryId));

  const rank = { EXACT: 0, HIGH: 1, POSSIBLE: 2 } as const;
  available.sort(
    (a, b) => rank[a.confidence] - rank[b.confidence] || a.entryNumber.localeCompare(b.entryNumber)
  );

  return available;
}

function deriveLineStatus(
  candidates: StatementMatchCandidate[],
  hasConfirmed: boolean
): AccountingBankStatementLineMatchStatus {
  if (hasConfirmed) return "MATCHED_EXACT";
  if (candidates.some((c) => c.confidence === "EXACT")) return "REVIEW_REQUIRED";
  if (candidates.some((c) => c.confidence === "HIGH")) return "REVIEW_REQUIRED";
  if (candidates.some((c) => c.confidence === "POSSIBLE")) return "POSSIBLE";
  return "UNMATCHED";
}

export async function runStatementMatchingForImport(importId: string) {
  const imp = await prisma.accountingBankStatementImport.findUnique({
    where: { id: importId },
    include: {
      bankAccount: true,
      lines: { where: { matchStatus: { not: "DUPLICATE" } } }
    }
  });
  if (!imp) throw new BankStatementImportNotFoundError(importId);

  for (const line of imp.lines) {
    await runStatementMatchingForLine(line.id, { skipAudit: true });
  }
}

export async function runStatementMatchingForLine(
  lineId: string,
  opts?: { skipAudit?: boolean; userId?: string }
) {
  const { assertStatementLineUnlocked } = await import("./bank-reconciliation.service");
  try {
    await assertStatementLineUnlocked(lineId);
  } catch {
    const line = await prisma.accountingBankStatementLine.findUnique({
      where: { id: lineId },
      include: { bankAccount: true, matches: { where: { status: "CONFIRMED" } } }
    });
    if (!line) throw new BankStatementLineNotFoundError(lineId);
    return { line, candidates: [] };
  }

  const line = await prisma.accountingBankStatementLine.findUnique({
    where: { id: lineId },
    include: { bankAccount: true, matches: { where: { status: "CONFIRMED" } } }
  });
  if (!line) throw new BankStatementLineNotFoundError(lineId);
  if (line.matchStatus === "DUPLICATE" || line.matchStatus === "IGNORED") {
    return { line, candidates: [] };
  }

  if (line.matches.some((m) => m.status === "CONFIRMED")) {
    return { line, candidates: [] };
  }

  await prisma.accountingBankStatementMatch.deleteMany({
    where: { statementLineId: lineId, status: { in: ["CANDIDATE", "REJECTED"] } }
  });

  const candidates = await findCandidatesForLine(line, line.bankAccount.glAccountCode);
  const exactCandidates = candidates.filter((c) => c.confidence === "EXACT");
  const autoConfirm =
    exactCandidates.length === 1 ? exactCandidates[0]! : null;

  for (const c of candidates) {
    await prisma.accountingBankStatementMatch.create({
      data: {
        statementLineId: lineId,
        journalEntryId: c.journalEntryId,
        matchType: c.matchType,
        confidence: c.confidence,
        status: autoConfirm && c.journalEntryId === autoConfirm.journalEntryId ? "CONFIRMED" : "CANDIDATE",
        matchedAmountInPaise: c.matchedAmountInPaise,
        bankGlAccountCode: c.bankGlAccountCode,
        sourceEntityType: c.sourceEntityType,
        sourceEntityId: c.sourceEntityId,
        evidenceJson: c.evidence,
        matchedAt: autoConfirm && c.journalEntryId === autoConfirm.journalEntryId ? new Date() : null
      }
    });
  }

  const newStatus = autoConfirm
    ? "MATCHED_EXACT"
    : deriveLineStatus(candidates, false);

  const updated = await prisma.accountingBankStatementLine.update({
    where: { id: lineId },
    data: { matchStatus: newStatus }
  });

  if (autoConfirm && !opts?.skipAudit) {
    await writeAccountingAuditLog({
      actorUserId: opts?.userId,
      action: "STATEMENT_MATCHED",
      entityType: "AccountingBankStatementLine",
      entityId: lineId,
      afterJson: {
        journalEntryId: autoConfirm.journalEntryId,
        confidence: "EXACT",
        auto: true
      }
    });
  }

  return { line: updated, candidates };
}

export async function confirmStatementMatch(input: {
  lineId: string;
  journalEntryId: string;
  userId?: string;
  note?: string;
}) {
  const { assertStatementLineUnlocked } = await import("./bank-reconciliation.service");
  await assertStatementLineUnlocked(input.lineId);

  const line = await prisma.accountingBankStatementLine.findUnique({
    where: { id: input.lineId },
    include: { bankAccount: true }
  });
  if (!line) throw new BankStatementLineNotFoundError(input.lineId);

  const match = await prisma.accountingBankStatementMatch.findFirst({
    where: {
      statementLineId: input.lineId,
      journalEntryId: input.journalEntryId,
      status: { in: ["CANDIDATE", "CONFIRMED"] }
    }
  });
  if (!match) {
    throw new BankStatementMatchError("Candidate match not found", "MATCH_NOT_FOUND");
  }

  const amount = statementAmountInPaise(line);
  if (match.matchedAmountInPaise !== amount) {
    throw new BankStatementMatchError("Matched amount must equal statement line amount", "AMOUNT_MISMATCH");
  }

  const sameBankClaim = await prisma.accountingBankStatementMatch.findFirst({
    where: {
      journalEntryId: input.journalEntryId,
      status: "CONFIRMED",
      statementLine: { bankAccountId: line.bankAccountId, id: { not: input.lineId } }
    },
    select: { id: true, statementLineId: true }
  });
  if (sameBankClaim) {
    throw new BankStatementMatchError(
      "Journal already confirmed on another line for this bank account",
      "JOURNAL_ALREADY_MATCHED_SAME_BANK"
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.accountingBankStatementMatch.updateMany({
      where: { statementLineId: input.lineId, status: "CONFIRMED" },
      data: { status: "REJECTED" }
    });
    await tx.accountingBankStatementMatch.update({
      where: { id: match.id },
      data: {
        status: "CONFIRMED",
        matchedByUserId: input.userId ?? null,
        matchedAt: new Date(),
        evidenceJson: {
          ...(match.evidenceJson as object),
          manualNote: input.note ?? null
        }
      }
    });
    await tx.accountingBankStatementLine.update({
      where: { id: input.lineId },
      data: { matchStatus: "MATCHED_MANUAL" }
    });
  });

  await writeAccountingAuditLog({
    actorUserId: input.userId,
    action: "STATEMENT_MATCHED",
    entityType: "AccountingBankStatementLine",
    entityId: input.lineId,
    afterJson: { journalEntryId: input.journalEntryId, manual: true }
  });

  return prisma.accountingBankStatementLine.findUniqueOrThrow({
    where: { id: input.lineId },
    include: { matches: { include: { journalEntry: true } } }
  });
}

export async function unmatchStatementLine(input: { lineId: string; userId?: string }) {
  const { assertStatementLineUnlocked } = await import("./bank-reconciliation.service");
  await assertStatementLineUnlocked(input.lineId);

  const line = await prisma.accountingBankStatementLine.findUnique({ where: { id: input.lineId } });
  if (!line) throw new BankStatementLineNotFoundError(input.lineId);

  await prisma.$transaction(async (tx) => {
    await tx.accountingBankStatementMatch.updateMany({
      where: { statementLineId: input.lineId, status: "CONFIRMED" },
      data: { status: "REJECTED" }
    });
    await tx.accountingBankStatementLine.update({
      where: { id: input.lineId },
      data: { matchStatus: "UNMATCHED" }
    });
  });

  await writeAccountingAuditLog({
    actorUserId: input.userId,
    action: "STATEMENT_UNMATCHED",
    entityType: "AccountingBankStatementLine",
    entityId: input.lineId
  });

  return runStatementMatchingForLine(input.lineId, { userId: input.userId });
}

export async function rejectStatementCandidate(input: {
  lineId: string;
  matchId: string;
  userId?: string;
}) {
  const { assertStatementLineUnlocked } = await import("./bank-reconciliation.service");
  await assertStatementLineUnlocked(input.lineId);

  const existing = await prisma.accountingBankStatementMatch.findFirst({
    where: { id: input.matchId, statementLineId: input.lineId }
  });
  if (!existing) {
    throw new BankStatementMatchError("Match not found", "MATCH_NOT_FOUND");
  }
  if (existing.status === "CONFIRMED") {
    throw new BankStatementMatchError(
      "Cannot reject a confirmed match — unmatch the line first",
      "CONFIRMED_MATCH_REJECT_FORBIDDEN"
    );
  }

  await prisma.accountingBankStatementMatch.updateMany({
    where: { id: input.matchId, statementLineId: input.lineId, status: "CANDIDATE" },
    data: { status: "REJECTED" }
  });
  return runStatementMatchingForLine(input.lineId, { userId: input.userId });
}

export async function getStatementLineCandidates(lineId: string) {
  const line = await prisma.accountingBankStatementLine.findUnique({
    where: { id: lineId },
    include: {
      matches: {
        include: { journalEntry: { select: { id: true, entryNumber: true, entryDate: true, memo: true } } }
      }
    }
  });
  if (!line) throw new BankStatementLineNotFoundError(lineId);
  return line;
}
