import type { Prisma } from "@prisma/client";

import { prisma } from "../../config/db";
import { logger } from "../../config/logger";

import { assertDocumentDateAllowedForPosting } from "./accounting-cutover";
import {
  OrderCancelledJournalImbalanceError,
  OrderNotEligibleForPostingError
} from "./accounting-errors";
import { isAccountingSalesPostingEnabled } from "./accounting-flag";
import { evaluateCodOrderCancelledEligibility } from "./order-cancelled-eligibility";
import { buildOrderCancelledJournal } from "./order-cancelled-journal.builder";
import {
  ORDER_CANCELLED_DOCUMENT_TYPE,
  ORDER_CANCELLED_EVENT_TYPE,
  ORDER_CANCELLED_SOURCE_TYPE,
  orderCancelledUniqueKey
} from "./order-cancelled.constants";
import type {
  CodOrderCancelledEligibilityResult,
  OrderCancelledJournalProposal
} from "./order-cancelled.types";
import {
  ORDER_REFUNDED_FULL_EVENT_TYPE,
  orderRefundedFullUniqueKey
} from "./order-refunded-full.constants";
import type { OrderRefundContext } from "./order-refunded-full.types";
import {
  loadOrderRefundContext,
  loadOrderRefundContextByOrderId
} from "./order-refund-snapshot.service";
import { getAccountingAccountByCode } from "./seed-coa";
import { getPostingEvent, postJournalFromEvent } from "./posting-event.service";
import { assertSalesPostingPersistenceAllowed } from "./production-guard";

export type PostOrderCancelledPostedResult = {
  skipped: false;
  duplicate: boolean;
  proposal: OrderCancelledJournalProposal;
  event: Awaited<ReturnType<typeof postJournalFromEvent>>["event"];
  journal: Awaited<ReturnType<typeof postJournalFromEvent>>["journal"];
};

export type PostOrderCancelledSkippedResult = {
  skipped: true;
  code: CodOrderCancelledEligibilityResult["code"];
  reason: string;
};

export type PostOrderCancelledResult =
  | PostOrderCancelledPostedResult
  | PostOrderCancelledSkippedResult;

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

async function loadCancelledAt(orderId: string): Promise<Date> {
  const row = await prisma.orderStatusHistory.findFirst({
    where: { orderId, toStatus: "CANCELLED" },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true }
  });
  return row?.createdAt ?? new Date();
}

async function alreadyReversedAsRefund(orderId: string): Promise<boolean> {
  const existing = await getPostingEvent(
    ORDER_REFUNDED_FULL_EVENT_TYPE,
    orderRefundedFullUniqueKey(orderId)
  );
  return existing?.status === "POSTED";
}

/**
 * Persist ORDER_CANCELLED journal via posting-event idempotency path.
 * Does NOT touch commerce tables (inventory, payments, notifications).
 */
export async function postOrderCancelled(
  ctx: OrderRefundContext,
  opts?: { postedByUserId?: string; forcePersist?: boolean }
): Promise<PostOrderCancelledResult> {
  if (!opts?.forcePersist) {
    assertSalesPostingPersistenceAllowed();
  }

  const eligibility = evaluateCodOrderCancelledEligibility(ctx);
  if (!eligibility.autoPostable) {
    return {
      skipped: true,
      code: eligibility.code,
      reason: eligibility.reason
    };
  }

  if (await alreadyReversedAsRefund(ctx.orderId)) {
    return {
      skipped: true,
      code: "ALREADY_REVERSED_AS_REFUND",
      reason: "ORDER_REFUNDED_FULL journal already posted — do not double-reverse the sale"
    };
  }

  if (!ctx.originalSale) {
    return {
      skipped: true,
      code: "NO_SALE_JOURNAL",
      reason: "No posted ORDER_PAID journal — nothing to reverse"
    };
  }

  assertDocumentDateAllowedForPosting(ctx.orderPlacedAt);

  const accountingDate = await loadCancelledAt(ctx.orderId);
  const proposal = buildOrderCancelledJournal({
    orderId: ctx.orderId,
    orderNumber: ctx.orderNumber,
    currency: ctx.currency,
    provider: ctx.provider,
    accountingDate,
    originalSale: ctx.originalSale
  });

  if (!proposal.balanced) {
    throw new OrderCancelledJournalImbalanceError(
      proposal.totalDebitPaise,
      proposal.totalCreditPaise,
      proposal.imbalancePaise
    );
  }

  const accountIds = await resolveAccountIds(proposal.lines.map((l) => l.accountCode));
  const uniqueKey = orderCancelledUniqueKey(ctx.orderId);

  const payloadJson = {
    calcVersion: proposal.calcVersion,
    orderNumber: ctx.orderNumber,
    provider: ctx.provider,
    originalUniqueKey: proposal.originalSaleUniqueKey,
    originalJournalEntryId: proposal.originalJournalEntryId,
    originalCalcVersion: proposal.originalCalcVersion,
    diagnostics: proposal.diagnostics,
    reconciliationMetadata: proposal.reconciliationMetadata
  } as Prisma.InputJsonValue;

  const result = await postJournalFromEvent({
    eventType: ORDER_CANCELLED_EVENT_TYPE,
    sourceType: ORDER_CANCELLED_SOURCE_TYPE,
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
          documentType: ORDER_CANCELLED_DOCUMENT_TYPE,
          documentId: ctx.orderId,
          journalEntryId: result.journal.id
        }
      },
      create: {
        documentType: ORDER_CANCELLED_DOCUMENT_TYPE,
        documentId: ctx.orderId,
        journalEntryId: result.journal.id,
        zohoDocumentId: null,
        zohoDocumentType: null
      },
      update: {}
    });
  }

  return {
    skipped: false,
    duplicate: result.duplicate,
    proposal,
    event: result.event,
    journal: result.journal
  };
}

export async function postOrderCancelledByIdentifier(
  identifier: { orderId?: string; orderNumber?: string },
  opts?: { postedByUserId?: string; forcePersist?: boolean }
): Promise<PostOrderCancelledResult> {
  const ctx = await loadOrderRefundContext(identifier);
  return postOrderCancelled(ctx, opts);
}

/** Commerce cancel hook — never throws; never creates a second journal. */
export async function tryPostCodOrderCancelledAccounting(orderId: string): Promise<void> {
  if (!isAccountingSalesPostingEnabled()) return;
  try {
    const result = await postOrderCancelledByIdentifier({ orderId });
    if (result.skipped) {
      logger.info("native_order_cancelled_posting_skipped", {
        orderId,
        code: result.code,
        reason: result.reason
      });
      return;
    }
    logger.info("native_order_cancelled_posted", {
      orderId,
      duplicate: result.duplicate,
      journalId: result.journal.id,
      entryNumber: result.journal.entryNumber
    });
  } catch (err) {
    logger.error("native_order_cancelled_posting_failed", { orderId, err });
  }
}

export async function previewOrderCancelledByIdentifier(identifier: {
  orderId?: string;
  orderNumber?: string;
}): Promise<{
  context: OrderRefundContext;
  eligibility: ReturnType<typeof evaluateCodOrderCancelledEligibility>;
  postingEvent: Awaited<ReturnType<typeof getPostingEvent>>;
}> {
  const context = identifier.orderId
    ? await loadOrderRefundContextByOrderId(identifier.orderId)
    : await loadOrderRefundContext(identifier);
  const uniqueKey = orderCancelledUniqueKey(context.orderId);
  return {
    context,
    eligibility: evaluateCodOrderCancelledEligibility(context),
    postingEvent: await getPostingEvent(ORDER_CANCELLED_EVENT_TYPE, uniqueKey)
  };
}
