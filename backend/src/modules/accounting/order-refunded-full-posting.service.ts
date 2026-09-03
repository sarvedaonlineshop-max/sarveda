import type { Prisma } from "@prisma/client";

import { prisma } from "../../config/db";

import { assertDocumentDateAllowedForPosting } from "./accounting-cutover";
import {
  OrderRefundedFullJournalImbalanceError,
  RefundNotEligibleForPostingError,
  SaleJournalRequiredError
} from "./accounting-errors";
import { evaluateFullRefundEligibility } from "./order-refunded-full-eligibility";
import { buildOrderRefundedFullJournal } from "./order-refunded-full-journal.builder";
import {
  ORDER_REFUNDED_FULL_DOCUMENT_TYPE_ORDER,
  ORDER_REFUNDED_FULL_DOCUMENT_TYPE_REFUND,
  ORDER_REFUNDED_FULL_EVENT_TYPE,
  ORDER_REFUNDED_FULL_SOURCE_TYPE,
  orderRefundedFullUniqueKey
} from "./order-refunded-full.constants";
import type {
  FullRefundEligibilityResult,
  OrderRefundContext,
  OrderRefundedFullJournalProposal
} from "./order-refunded-full.types";
import {
  loadOrderRefundContext,
  loadOrderRefundContextByOrderId
} from "./order-refund-snapshot.service";
import { getAccountingAccountByCode } from "./seed-coa";
import { getPostingEvent, postJournalFromEvent } from "./posting-event.service";
import { assertRefundPostingPersistenceAllowed } from "./production-guard";

export type OrderRefundedFullPreviewResult = {
  context: OrderRefundContext;
  eligibility: FullRefundEligibilityResult;
  proposal: OrderRefundedFullJournalProposal | null;
  buildError?: { message: string; code: string };
  postingEvent: Awaited<ReturnType<typeof getPostingEvent>>;
  originalSale: OrderRefundContext["originalSale"];
};

export async function previewOrderRefundedFull(
  ctx: OrderRefundContext
): Promise<OrderRefundedFullPreviewResult> {
  const eligibility = evaluateFullRefundEligibility(ctx);
  const uniqueKey = orderRefundedFullUniqueKey(ctx.orderId);
  const postingEvent = await getPostingEvent(ORDER_REFUNDED_FULL_EVENT_TYPE, uniqueKey);

  if (!eligibility.autoPostable) {
    return {
      context: ctx,
      eligibility,
      proposal: null,
      postingEvent,
      originalSale: ctx.originalSale
    };
  }

  const refund = ctx.refunds.find((r) => r.id === eligibility.candidateRefundId);
  if (!refund || !ctx.originalSale) {
    return {
      context: ctx,
      eligibility: {
        ...eligibility,
        autoPostable: false,
        code: "DATA_GAP",
        reason: "Candidate refund or original sale missing after eligibility"
      },
      proposal: null,
      postingEvent,
      originalSale: ctx.originalSale
    };
  }

  try {
    const proposal = buildOrderRefundedFullJournal({
      orderId: ctx.orderId,
      orderNumber: ctx.orderNumber,
      currency: ctx.currency,
      provider: ctx.provider,
      accountingDate: refund.createdAt,
      refund,
      originalSale: ctx.originalSale
    });
    return {
      context: ctx,
      eligibility,
      proposal,
      postingEvent,
      originalSale: ctx.originalSale
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const code =
      err instanceof OrderRefundedFullJournalImbalanceError
        ? err.code
        : "ORDER_REFUNDED_FULL_BUILD_FAILED";
    return {
      context: ctx,
      eligibility,
      proposal: null,
      buildError: { message, code },
      postingEvent,
      originalSale: ctx.originalSale
    };
  }
}

async function resolveAccountIds(codes: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(codes)];
  const map = new Map<string, string>();
  for (const code of unique) {
    const acct = await getAccountingAccountByCode(code);
    if (!acct) {
      throw new RefundNotEligibleForPostingError(
        `Missing chart of accounts entry: ${code}`,
        "MISSING_ACCOUNT"
      );
    }
    map.set(code, acct.id);
  }
  return map;
}

export type PostOrderRefundedFullResult = {
  duplicate: boolean;
  proposal: OrderRefundedFullJournalProposal;
  event: Awaited<ReturnType<typeof postJournalFromEvent>>["event"];
  journal: Awaited<ReturnType<typeof postJournalFromEvent>>["journal"];
};

/**
 * Persist ORDER_REFUNDED_FULL journal via posting-event idempotency path.
 * Does NOT touch commerce tables.
 */
export async function postOrderRefundedFull(
  ctx: OrderRefundContext,
  opts?: { postedByUserId?: string; forcePersist?: boolean }
): Promise<PostOrderRefundedFullResult> {
  if (!opts?.forcePersist) {
    assertRefundPostingPersistenceAllowed();
  }

  const eligibility = evaluateFullRefundEligibility(ctx);
  if (eligibility.code === "SALE_JOURNAL_REQUIRED") {
    throw new SaleJournalRequiredError(ctx.orderId);
  }
  if (!eligibility.autoPostable) {
    throw new RefundNotEligibleForPostingError(eligibility.reason, eligibility.code);
  }

  const refund = ctx.refunds.find((r) => r.id === eligibility.candidateRefundId);
  if (!refund || !ctx.originalSale) {
    throw new RefundNotEligibleForPostingError(
      "Candidate refund or original sale missing",
      "DATA_GAP"
    );
  }

  // Forward-only cutover: use order placedAt (same boundary as ORDER_PAID), not refund timestamp alone.
  assertDocumentDateAllowedForPosting(ctx.orderPlacedAt);

  const proposal = buildOrderRefundedFullJournal({
    orderId: ctx.orderId,
    orderNumber: ctx.orderNumber,
    currency: ctx.currency,
    provider: ctx.provider,
    accountingDate: refund.createdAt,
    refund,
    originalSale: ctx.originalSale
  });

  if (!proposal.balanced) {
    throw new OrderRefundedFullJournalImbalanceError(
      proposal.totalDebitPaise,
      proposal.totalCreditPaise,
      proposal.imbalancePaise
    );
  }

  const accountIds = await resolveAccountIds(proposal.lines.map((l) => l.accountCode));
  const uniqueKey = orderRefundedFullUniqueKey(ctx.orderId);

  const payloadJson = {
    calcVersion: proposal.calcVersion,
    orderNumber: ctx.orderNumber,
    provider: ctx.provider,
    refundId: refund.id,
    providerRefundId: refund.providerRefundId,
    originalUniqueKey: proposal.originalSaleUniqueKey,
    originalJournalEntryId: proposal.originalJournalEntryId,
    originalCalcVersion: proposal.originalCalcVersion,
    diagnostics: proposal.diagnostics,
    reconciliationMetadata: proposal.reconciliationMetadata
  } as Prisma.InputJsonValue;

  const result = await postJournalFromEvent({
    eventType: ORDER_REFUNDED_FULL_EVENT_TYPE,
    sourceType: ORDER_REFUNDED_FULL_SOURCE_TYPE,
    sourceId: ctx.orderId,
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
          documentType: ORDER_REFUNDED_FULL_DOCUMENT_TYPE_ORDER,
          documentId: ctx.orderId,
          journalEntryId: result.journal.id
        }
      },
      create: {
        documentType: ORDER_REFUNDED_FULL_DOCUMENT_TYPE_ORDER,
        documentId: ctx.orderId,
        journalEntryId: result.journal.id,
        zohoDocumentId: ctx.zohoCreditNoteId ?? null,
        zohoDocumentType: ctx.zohoCreditNoteId ? "credit_note" : null
      },
      update: {
        zohoDocumentId: ctx.zohoCreditNoteId ?? null,
        zohoDocumentType: ctx.zohoCreditNoteId ? "credit_note" : null
      }
    });

    await prisma.accountingDocumentLink.upsert({
      where: {
        documentType_documentId_journalEntryId: {
          documentType: ORDER_REFUNDED_FULL_DOCUMENT_TYPE_REFUND,
          documentId: refund.id,
          journalEntryId: result.journal.id
        }
      },
      create: {
        documentType: ORDER_REFUNDED_FULL_DOCUMENT_TYPE_REFUND,
        documentId: refund.id,
        journalEntryId: result.journal.id,
        zohoDocumentId: refund.providerRefundId,
        zohoDocumentType: refund.providerRefundId ? "gateway_refund" : null
      },
      update: {
        zohoDocumentId: refund.providerRefundId,
        zohoDocumentType: refund.providerRefundId ? "gateway_refund" : null
      }
    });
  }

  // Stamp commerce Refund marker when native journal is (or already was) POSTED.
  // Idempotent: only fills accountingPostedAt when still null — does not create journals.
  await prisma.refund.updateMany({
    where: { id: refund.id, accountingPostedAt: null },
    data: {
      accountingPostedAt: new Date(),
      settlementStage: "COMPLETE",
      settlementError: null
    }
  });

  return {
    duplicate: result.duplicate,
    proposal,
    event: result.event,
    journal: result.journal
  };
}

export async function previewOrderRefundedFullByIdentifier(identifier: {
  orderId?: string;
  orderNumber?: string;
  refundId?: string;
}): Promise<OrderRefundedFullPreviewResult> {
  const ctx = await loadOrderRefundContext(identifier);
  return previewOrderRefundedFull(ctx);
}

export async function postOrderRefundedFullByIdentifier(
  identifier: { orderId?: string; orderNumber?: string; refundId?: string },
  opts?: { postedByUserId?: string; forcePersist?: boolean }
): Promise<PostOrderRefundedFullResult> {
  const ctx = await loadOrderRefundContext(identifier);
  return postOrderRefundedFull(ctx, opts);
}

export async function previewOrderRefundedFullByOrderId(
  orderId: string
): Promise<OrderRefundedFullPreviewResult> {
  const ctx = await loadOrderRefundContextByOrderId(orderId);
  return previewOrderRefundedFull(ctx);
}
