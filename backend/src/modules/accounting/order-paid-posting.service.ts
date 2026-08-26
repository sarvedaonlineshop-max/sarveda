import type { Prisma } from "@prisma/client";

import { prisma } from "../../config/db";

import {
  OrderNotEligibleForPostingError,
  OrderPaidJournalImbalanceError
} from "./accounting-errors";
import { isOrderEligibleForOrderPaidPosting } from "./order-eligibility";
import { buildOrderPaidJournal } from "./order-paid-journal.builder";
import type { OrderPaidJournalProposal, OrderPaidSnapshot } from "./order-paid-journal.types";
import {
  ORDER_PAID_DOCUMENT_TYPE,
  ORDER_PAID_EVENT_TYPE,
  ORDER_PAID_SOURCE_TYPE,
  orderPaidUniqueKey
} from "./order-paid.constants";
import { getAccountingAccountByCode } from "./seed-coa";
import { postJournalFromEvent, getPostingEvent } from "./posting-event.service";
import { assertDocumentDateAllowedForPosting } from "./accounting-cutover";
import { assertSalesPostingPersistenceAllowed } from "./production-guard";

export type OrderPaidPreviewResult = {
  snapshot: OrderPaidSnapshot;
  eligibility: ReturnType<typeof isOrderEligibleForOrderPaidPosting>;
  proposal: OrderPaidJournalProposal | null;
  buildError?: { message: string; code: string };
  postingEvent: Awaited<ReturnType<typeof getPostingEvent>>;
};

export async function previewOrderPaidJournal(snapshot: OrderPaidSnapshot): Promise<OrderPaidPreviewResult> {
  const eligibility = isOrderEligibleForOrderPaidPosting(snapshot);
  const uniqueKey = orderPaidUniqueKey(snapshot.orderId);
  const postingEvent = await getPostingEvent(ORDER_PAID_EVENT_TYPE, uniqueKey);

  if (!eligibility.eligible) {
    return { snapshot, eligibility, proposal: null, postingEvent };
  }

  try {
    const proposal = buildOrderPaidJournal(snapshot);
    return { snapshot, eligibility, proposal, postingEvent };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const code =
      err instanceof OrderPaidJournalImbalanceError ? err.code : "ORDER_PAID_BUILD_FAILED";
    return {
      snapshot,
      eligibility,
      proposal: null,
      buildError: { message, code },
      postingEvent
    };
  }
}

async function resolveAccountIds(codes: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(codes)];
  const map = new Map<string, string>();
  for (const code of unique) {
    const acct = await getAccountingAccountByCode(code);
    if (!acct) {
      throw new OrderNotEligibleForPostingError(
        `Missing chart of accounts entry: ${code}`,
        "MISSING_ACCOUNT"
      );
    }
    map.set(code, acct.id);
  }
  return map;
}

export type PostOrderPaidResult = {
  duplicate: boolean;
  proposal: OrderPaidJournalProposal;
  event: Awaited<ReturnType<typeof postJournalFromEvent>>["event"];
  journal: Awaited<ReturnType<typeof postJournalFromEvent>>["journal"];
};

/**
 * Persist ORDER_PAID journal via posting-event idempotency path.
 * Does NOT touch commerce tables.
 */
export async function postOrderPaidJournal(
  snapshot: OrderPaidSnapshot,
  opts?: { postedByUserId?: string; forcePersist?: boolean; allowPreCutover?: boolean }
): Promise<PostOrderPaidResult> {
  if (!opts?.forcePersist) {
    assertSalesPostingPersistenceAllowed();
  }

  const eligibility = isOrderEligibleForOrderPaidPosting(snapshot);
  if (!eligibility.eligible) {
    throw new OrderNotEligibleForPostingError(eligibility.reason ?? "Not eligible", eligibility.code);
  }

  assertDocumentDateAllowedForPosting(snapshot.placedAt, {
    allowPreCutover: opts?.allowPreCutover
  });

  const proposal = buildOrderPaidJournal(snapshot);
  if (proposal.taxPostingBlock) {
    throw new OrderNotEligibleForPostingError(
      proposal.taxPostingBlock.reason,
      proposal.taxPostingBlock.code
    );
  }
  if (!proposal.balanced) {
    throw new OrderPaidJournalImbalanceError(
      proposal.totalDebitPaise,
      proposal.totalCreditPaise,
      proposal.imbalancePaise
    );
  }

  const accountIds = await resolveAccountIds(proposal.lines.map((l) => l.accountCode));
  const uniqueKey = orderPaidUniqueKey(snapshot.orderId);

  const payloadJson = {
    calcVersion: proposal.calcVersion,
    orderNumber: snapshot.orderNumber,
    provider: snapshot.payment.provider,
    diagnostics: proposal.diagnostics,
    reconciliationMetadata: proposal.reconciliationMetadata
  } as Prisma.InputJsonValue;

  const result = await postJournalFromEvent({
    eventType: ORDER_PAID_EVENT_TYPE,
    sourceType: ORDER_PAID_SOURCE_TYPE,
    sourceId: snapshot.orderId,
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
          documentType: ORDER_PAID_DOCUMENT_TYPE,
          documentId: snapshot.orderId,
          journalEntryId: result.journal.id
        }
      },
      create: {
        documentType: ORDER_PAID_DOCUMENT_TYPE,
        documentId: snapshot.orderId,
        journalEntryId: result.journal.id,
        zohoDocumentId: snapshot.zohoInvoiceId ?? null,
        zohoDocumentType: snapshot.zohoInvoiceId ? "invoice" : null
      },
      update: {
        zohoDocumentId: snapshot.zohoInvoiceId ?? null,
        zohoDocumentType: snapshot.zohoInvoiceId ? "invoice" : null
      }
    });
  }

  return {
    duplicate: result.duplicate,
    proposal,
    event: result.event,
    journal: result.journal
  };
}

export async function previewOrderPaidByIdentifier(identifier: {
  orderId?: string;
  orderNumber?: string;
}): Promise<OrderPaidPreviewResult> {
  const { loadOrderPaidSnapshot } = await import("./order-snapshot.service");
  const snapshot = await loadOrderPaidSnapshot(identifier);
  return previewOrderPaidJournal(snapshot);
}

export async function postOrderPaidByIdentifier(
  identifier: { orderId?: string; orderNumber?: string },
  opts?: { postedByUserId?: string; forcePersist?: boolean }
): Promise<PostOrderPaidResult> {
  const { loadOrderPaidSnapshot } = await import("./order-snapshot.service");
  const snapshot = await loadOrderPaidSnapshot(identifier);
  return postOrderPaidJournal(snapshot, opts);
}
