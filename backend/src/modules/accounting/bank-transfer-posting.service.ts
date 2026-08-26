import type { AccountingJournalEntry, AccountingPostingEvent, Prisma } from "@prisma/client";

import { prisma } from "../../config/db";

import {
  BankTransferJournalImbalanceError,
  BankTransferNotEligibleError
} from "./accounting-errors";
import { writeAccountingAuditLog } from "./accounting-audit.service";
import { getAccountingAccountByCode } from "./seed-coa";
import { getPostingEvent, postJournalFromEvent } from "./posting-event.service";
import { assertBankingPersistenceAllowed } from "./production-guard";
import {
  BANK_TRANSFER_DOCUMENT_TYPE,
  BANK_TRANSFER_MADE_EVENT_TYPE,
  BANK_TRANSFER_MADE_SOURCE_TYPE
} from "./bank-account.constants";
import { buildBankTransferJournal } from "./bank-transfer-journal.builder";
import {
  loadBankTransferSnapshot,
  validateTransferDraftInput
} from "./bank-transfer.service";
import type { BankTransferJournalProposal, BankTransferSnapshot } from "./bank-transfer.types";
import { assertEntryDateInOpenPeriod } from "./accounting-period.service";

export type BankTransferPreviewResult = {
  snapshot: BankTransferSnapshot;
  proposal: BankTransferJournalProposal | null;
  buildError?: { message: string; code: string };
  postingEvent: Awaited<ReturnType<typeof getPostingEvent>>;
  sourceChangedAfterPost: boolean;
};

export async function previewBankTransfer(transferId: string): Promise<BankTransferPreviewResult> {
  const snapshot = await loadBankTransferSnapshot(transferId);
  const postingEvent = await getPostingEvent(
    BANK_TRANSFER_MADE_EVENT_TYPE,
    `bank_transfer:${transferId}`
  );

  let sourceChangedAfterPost = false;
  if (postingEvent?.status === "POSTED" && postingEvent.payloadJson) {
    const payload = postingEvent.payloadJson as Record<string, unknown>;
    const meta = (payload.reconciliationMetadata ?? {}) as Record<string, unknown>;
    const prior = typeof meta.sourceFingerprint === "string" ? meta.sourceFingerprint : null;
    if (prior && prior !== snapshot.sourcePayloadHash) {
      sourceChangedAfterPost = true;
    }
  }

  try {
    if (snapshot.status === "DRAFT") {
      await validateTransferDraftInput({
        transferDate: snapshot.transferDate,
        amountInPaise: snapshot.amountInPaise,
        currency: snapshot.currency,
        transferKind: snapshot.transferKind,
        sourceBankAccountId: snapshot.sourceBankAccountId,
        destinationBankAccountId: snapshot.destinationBankAccountId,
        reference: snapshot.reference
      });
    }
    const proposal = buildBankTransferJournal(snapshot, { failOnImbalance: false });
    return { snapshot, proposal, postingEvent, sourceChangedAfterPost };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const code =
      err instanceof BankTransferNotEligibleError
        ? err.code
        : err instanceof BankTransferJournalImbalanceError
          ? err.code
          : "BANK_TRANSFER_BUILD_FAILED";
    return {
      snapshot,
      proposal: null,
      buildError: { message, code },
      postingEvent,
      sourceChangedAfterPost
    };
  }
}

async function resolveAccountIds(codes: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  for (const code of [...new Set(codes)]) {
    const acct = await getAccountingAccountByCode(code);
    if (!acct) {
      throw new BankTransferNotEligibleError(`Missing CoA: ${code}`, "MISSING_ACCOUNT");
    }
    map.set(code, acct.id);
  }
  return map;
}

export type PostBankTransferResult = {
  duplicate: boolean;
  proposal: BankTransferJournalProposal;
  event: AccountingPostingEvent;
  journal: AccountingJournalEntry & {
    lines: Array<{
      id: string;
      debitInPaise: number;
      creditInPaise: number;
      accountId: string;
      sortOrder: number;
      lineMemo: string | null;
    }>;
  };
};

export async function postBankTransfer(
  transferId: string,
  opts?: { postedByUserId?: string; forcePersist?: boolean; allowPreCutover?: boolean }
): Promise<PostBankTransferResult> {
  if (!opts?.forcePersist) {
    assertBankingPersistenceAllowed();
  }

  const snapshot = await loadBankTransferSnapshot(transferId);
  if (snapshot.status === "POSTED") {
    const postingEvent = await getPostingEvent(
      BANK_TRANSFER_MADE_EVENT_TYPE,
      `bank_transfer:${transferId}`
    );
    if (postingEvent?.status === "POSTED" && postingEvent.journalEntryId) {
      const journal = await prisma.accountingJournalEntry.findUniqueOrThrow({
        where: { id: postingEvent.journalEntryId },
        include: { lines: { include: { account: true }, orderBy: { sortOrder: "asc" } } }
      });
      const proposal = buildBankTransferJournal(snapshot, { failOnImbalance: false });
      // Duplicate path: reuse the already-posted event row; shape matches postJournalFromEvent result.
      return {
        duplicate: true,
        proposal,
        event: postingEvent,
        journal
      };
    }
  }
  if (snapshot.status !== "DRAFT") {
    throw new BankTransferNotEligibleError(`Transfer status ${snapshot.status}`, "INVALID_STATUS");
  }

  const { assertDocumentDateAllowedForPosting } = await import("./accounting-cutover");
  assertDocumentDateAllowedForPosting(snapshot.transferDate, {
    allowPreCutover: opts?.allowPreCutover
  });

  const preview = await previewBankTransfer(transferId);
  if (preview.sourceChangedAfterPost) {
    throw new BankTransferNotEligibleError(
      "Transfer changed after prior post attempt",
      "SOURCE_CHANGED"
    );
  }
  if (!preview.proposal?.balanced) {
    throw new BankTransferNotEligibleError(
      preview.buildError?.message ?? "Unbalanced transfer journal",
      preview.buildError?.code ?? "UNBALANCED"
    );
  }

  await assertEntryDateInOpenPeriod(preview.proposal.accountingDate);

  const proposal = preview.proposal;
  const accountIds = await resolveAccountIds(proposal.lines.map((l) => l.accountCode));

  const payloadJson = {
    calcVersion: proposal.calcVersion,
    transferId,
    transferNumber: snapshot.transferNumber,
    reconciliationMetadata: proposal.reconciliationMetadata,
    diagnostics: proposal.diagnostics
  } as Prisma.InputJsonValue;

  const result = await postJournalFromEvent({
    eventType: BANK_TRANSFER_MADE_EVENT_TYPE,
    sourceType: BANK_TRANSFER_MADE_SOURCE_TYPE,
    sourceId: transferId,
    uniqueKey: proposal.uniqueKey,
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
    await prisma.$transaction(async (tx) => {
      await tx.accountingBankTransfer.update({
        where: { id: transferId },
        data: {
          status: "POSTED",
          postingEventId: result.event.id,
          journalEntryId: result.journal.id,
          lastError: null
        }
      });
      await tx.accountingDocumentLink.upsert({
        where: {
          documentType_documentId_journalEntryId: {
            documentType: BANK_TRANSFER_DOCUMENT_TYPE,
            documentId: transferId,
            journalEntryId: result.journal.id
          }
        },
        create: {
          documentType: BANK_TRANSFER_DOCUMENT_TYPE,
          documentId: transferId,
          journalEntryId: result.journal.id
        },
        update: {}
      });
    });

    await writeAccountingAuditLog({
      actorUserId: opts?.postedByUserId,
      action: "BANK_TRANSFER_POSTED",
      entityType: "BANK_TRANSFER",
      entityId: transferId,
      afterJson: {
        transferNumber: snapshot.transferNumber,
        journalEntryNumber: result.journal.entryNumber
      }
    });
  }

  return { duplicate: result.duplicate, proposal, event: result.event, journal: result.journal };
}
