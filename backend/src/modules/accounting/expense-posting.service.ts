import type { Prisma } from "@prisma/client";

import { prisma } from "../../config/db";

import {
  ExpenseJournalImbalanceError,
  ExpenseNotEligibleForPostingError
} from "./accounting-errors";
import { classifyExpenseBillDuplicate } from "./expense-duplicate";
import { evaluateExpenseEligibility, isExpenseEligibleForPosting } from "./expense-eligibility";
import { buildExpenseRecordedJournal } from "./expense-journal.builder";
import {
  EXPENSE_DOCUMENT_TYPE,
  EXPENSE_RECORDED_EVENT_TYPE,
  EXPENSE_RECORDED_SOURCE_TYPE,
  expenseRecordedUniqueKey
} from "./expense.constants";
import { loadExpenseSnapshotById } from "./expense-snapshot.service";
import type { ExpenseJournalProposal, ExpenseSnapshot } from "./expense.types";
import { getPostingEvent, postJournalFromEvent } from "./posting-event.service";
import { assertExpensePostingPersistenceAllowed } from "./production-guard";
import { getAccountingAccountByCode } from "./seed-coa";

export type ExpensePreviewResult = {
  snapshot: ExpenseSnapshot;
  eligibility: Awaited<ReturnType<typeof evaluateExpenseEligibility>>;
  proposal: ExpenseJournalProposal | null;
  buildError?: { message: string; code: string };
  postingEvent: Awaited<ReturnType<typeof getPostingEvent>>;
  sourceChangedAfterPost: boolean;
  duplicate: Awaited<ReturnType<typeof classifyExpenseBillDuplicate>>;
};

export async function previewExpenseRecordedJournal(
  snapshot: ExpenseSnapshot,
  opts?: { acknowledgePossibleDuplicate?: boolean }
): Promise<ExpensePreviewResult> {
  const duplicate = await classifyExpenseBillDuplicate(snapshot);
  const eligibility = await evaluateExpenseEligibility(snapshot, {
    duplicateClass: duplicate.classification,
    acknowledgePossibleDuplicate: opts?.acknowledgePossibleDuplicate
  });
  const uniqueKey = expenseRecordedUniqueKey(snapshot.expenseId);
  const postingEvent = await getPostingEvent(EXPENSE_RECORDED_EVENT_TYPE, uniqueKey);

  let sourceChangedAfterPost = false;
  if (postingEvent?.status === "POSTED" && postingEvent.payloadJson) {
    const payload = postingEvent.payloadJson as Record<string, unknown>;
    const meta = (payload.reconciliationMetadata ?? {}) as Record<string, unknown>;
    const prior = typeof meta.sourceFingerprint === "string" ? meta.sourceFingerprint : null;
    if (prior && prior !== snapshot.sourceFingerprint) {
      sourceChangedAfterPost = true;
    }
  }

  try {
    const proposal = buildExpenseRecordedJournal(snapshot, {
      duplicateClass: duplicate.classification,
      duplicateBillIds: duplicate.billIds,
      failOnImbalance: false,
      failOnGstGap: false
    });
    return {
      snapshot,
      eligibility,
      proposal,
      postingEvent,
      sourceChangedAfterPost,
      duplicate
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const code =
      err instanceof ExpenseJournalImbalanceError
        ? err.code
        : "EXPENSE_BUILD_FAILED";
    return {
      snapshot,
      eligibility,
      proposal: null,
      buildError: { message, code },
      postingEvent,
      sourceChangedAfterPost,
      duplicate
    };
  }
}

async function resolveAccountIds(codes: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  for (const code of [...new Set(codes)]) {
    const acct = await getAccountingAccountByCode(code);
    if (!acct) {
      throw new ExpenseNotEligibleForPostingError(`Missing CoA: ${code}`, "MISSING_ACCOUNT");
    }
    map.set(code, acct.id);
  }
  return map;
}

export type PostExpenseResult = {
  duplicate: boolean;
  proposal: ExpenseJournalProposal;
  event: Awaited<ReturnType<typeof postJournalFromEvent>>["event"];
  journal: Awaited<ReturnType<typeof postJournalFromEvent>>["journal"];
};

export async function postExpenseRecordedJournal(
  snapshot: ExpenseSnapshot,
  opts?: {
    postedByUserId?: string;
    forcePersist?: boolean;
    acknowledgePossibleDuplicate?: boolean;
    allowPreCutover?: boolean;
  }
): Promise<PostExpenseResult> {
  if (!opts?.forcePersist) {
    assertExpensePostingPersistenceAllowed();
  }

  const { assertDocumentDateAllowedForPosting } = await import("./accounting-cutover");
  assertDocumentDateAllowedForPosting(snapshot.expenseDate, {
    allowPreCutover: opts?.allowPreCutover
  });

  const duplicate = await classifyExpenseBillDuplicate(snapshot);
  const eligibility = isExpenseEligibleForPosting(snapshot, {
    duplicateClass: duplicate.classification,
    acknowledgePossibleDuplicate: opts?.acknowledgePossibleDuplicate
  });
  if (!eligibility.eligible && eligibility.code !== "ALREADY_POSTED") {
    throw new ExpenseNotEligibleForPostingError(
      eligibility.reason ?? eligibility.code,
      eligibility.code
    );
  }

  // GST gap: builder throws when failOnGstGap
  let proposal: ExpenseJournalProposal;
  try {
    proposal = buildExpenseRecordedJournal(snapshot, {
      duplicateClass: duplicate.classification,
      duplicateBillIds: duplicate.billIds,
      failOnImbalance: true,
      failOnGstGap: true
    });
  } catch (err) {
    if (err instanceof ExpenseJournalImbalanceError && err.code === "GST_DATA_GAP") {
      throw new ExpenseNotEligibleForPostingError(
        err.message,
        "GST_DATA_GAP"
      );
    }
    if (err instanceof ExpenseJournalImbalanceError && err.details?.reason === "GST_DATA_GAP") {
      throw new ExpenseNotEligibleForPostingError("GST evidence insufficient", "GST_DATA_GAP");
    }
    throw err;
  }

  const accountIds = await resolveAccountIds(proposal.lines.map((l) => l.accountCode));
  const uniqueKey = expenseRecordedUniqueKey(snapshot.expenseId);
  const payloadJson = {
    calcVersion: proposal.calcVersion,
    diagnostics: proposal.diagnostics,
    reconciliationMetadata: proposal.reconciliationMetadata
  } as Prisma.InputJsonValue;

  const result = await postJournalFromEvent({
    eventType: EXPENSE_RECORDED_EVENT_TYPE,
    sourceType: EXPENSE_RECORDED_SOURCE_TYPE,
    sourceId: snapshot.expenseId,
    uniqueKey,
    payloadJson,
    entryDate: proposal.accountingDate,
    memo: proposal.memo,
    currency: proposal.currency,
    postedByUserId: opts?.postedByUserId,
    lines: proposal.lines.map((line, index) => ({
      accountId: accountIds.get(line.accountCode)!,
      debitInPaise: line.debitInPaise,
      creditInPaise: line.creditInPaise,
      lineMemo: line.lineMemo,
      sortOrder: index
    }))
  });

  if (!result.duplicate) {
    await prisma.accountingDocumentLink.upsert({
      where: {
        documentType_documentId_journalEntryId: {
          documentType: EXPENSE_DOCUMENT_TYPE,
          documentId: snapshot.expenseId,
          journalEntryId: result.journal.id
        }
      },
      create: {
        documentType: EXPENSE_DOCUMENT_TYPE,
        documentId: snapshot.expenseId,
        journalEntryId: result.journal.id
      },
      update: {}
    });
  }

  return {
    duplicate: result.duplicate,
    proposal,
    event: result.event,
    journal: result.journal
  };
}

export async function previewExpenseById(
  expenseId: string,
  opts?: { acknowledgePossibleDuplicate?: boolean }
) {
  const snapshot = await loadExpenseSnapshotById(expenseId);
  return previewExpenseRecordedJournal(snapshot, opts);
}

export async function postExpenseById(
  expenseId: string,
  opts?: {
    postedByUserId?: string;
    forcePersist?: boolean;
    acknowledgePossibleDuplicate?: boolean;
  }
) {
  const snapshot = await loadExpenseSnapshotById(expenseId);
  return postExpenseRecordedJournal(snapshot, opts);
}
