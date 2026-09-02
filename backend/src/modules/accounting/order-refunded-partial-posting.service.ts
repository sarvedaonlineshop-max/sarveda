import type { Prisma } from "@prisma/client";

import { prisma } from "../../config/db";

import { assertDocumentDateAllowedForPosting } from "./accounting-cutover";
import {
  OrderRefundedPartialJournalImbalanceError,
  RefundNotEligibleForPostingError
} from "./accounting-errors";
import { buildOrderRefundedPartialJournal } from "./order-refunded-partial-journal.builder";
import {
  ORDER_REFUNDED_PARTIAL_DOCUMENT_TYPE_ORDER,
  ORDER_REFUNDED_PARTIAL_DOCUMENT_TYPE_REFUND,
  ORDER_REFUNDED_PARTIAL_EVENT_TYPE,
  ORDER_REFUNDED_PARTIAL_SOURCE_TYPE,
  orderRefundedPartialUniqueKey
} from "./order-refunded-partial.constants";
import type {
  OrderRefundedPartialJournalProposal,
  PartialRefundSpec
} from "./order-refunded-partial.types";
import { getAccountingAccountByCode } from "./seed-coa";
import { postJournalFromEvent, getPostingEvent } from "./posting-event.service";
import { assertRefundPostingPersistenceAllowed } from "./production-guard";
import { ORDER_PAID_EVENT_TYPE, orderPaidUniqueKey } from "./order-paid.constants";

async function resolveAccountIds(codes: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  for (const code of [...new Set(codes)]) {
    const account = await getAccountingAccountByCode(code);
    if (!account) {
      throw new RefundNotEligibleForPostingError(
        `Account ${code} not found in chart of accounts`,
        "ACCOUNT_NOT_FOUND"
      );
    }
    map.set(code, account.id);
  }
  return map;
}

async function loadInterStateFromOriginalSale(orderId: string): Promise<boolean> {
  const uniqueKey = orderPaidUniqueKey(orderId);
  const event = await prisma.accountingPostingEvent.findUnique({
    where: { eventType_uniqueKey: { eventType: ORDER_PAID_EVENT_TYPE, uniqueKey } }
  });
  if (!event?.payloadJson || typeof event.payloadJson !== "object") return false;
  const diag = (event.payloadJson as Record<string, unknown>).diagnostics;
  if (diag && typeof diag === "object") {
    const supplyType = (diag as Record<string, unknown>).supplyType;
    return supplyType === "INTER_STATE";
  }
  return false;
}

export type PostOrderRefundedPartialResult = {
  duplicate: boolean;
  proposal: OrderRefundedPartialJournalProposal;
  event: Awaited<ReturnType<typeof postJournalFromEvent>>["event"];
  journal: Awaited<ReturnType<typeof postJournalFromEvent>>["journal"];
};

export async function postOrderRefundedPartial(
  spec: PartialRefundSpec,
  opts?: { postedByUserId?: string; forcePersist?: boolean }
): Promise<PostOrderRefundedPartialResult> {
  if (!opts?.forcePersist) {
    assertRefundPostingPersistenceAllowed();
  }

  const order = await prisma.order.findUnique({
    where: { id: spec.orderId },
    select: { placedAt: true, createdAt: true }
  });
  if (!order) {
    throw new RefundNotEligibleForPostingError("Order not found", "NOT_FOUND");
  }

  assertDocumentDateAllowedForPosting(order.placedAt ?? order.createdAt);

  const specWithInterState = {
    ...spec,
    interState: spec.interState || (await loadInterStateFromOriginalSale(spec.orderId))
  };

  const proposal = buildOrderRefundedPartialJournal(specWithInterState);
  if (!proposal.balanced) {
    throw new OrderRefundedPartialJournalImbalanceError(
      proposal.totalDebitPaise,
      proposal.totalCreditPaise,
      proposal.imbalancePaise
    );
  }

  const accountIds = await resolveAccountIds(proposal.lines.map((l) => l.accountCode));
  const uniqueKey = orderRefundedPartialUniqueKey(spec.orderId, spec.refundId);

  const existing = await getPostingEvent(ORDER_REFUNDED_PARTIAL_EVENT_TYPE, uniqueKey);
  if (existing?.status === "POSTED" && existing.journalEntryId) {
    const journal = await prisma.accountingJournalEntry.findUniqueOrThrow({
      where: { id: existing.journalEntryId },
      include: { lines: true }
    });
    return { duplicate: true, proposal, event: existing, journal } as PostOrderRefundedPartialResult;
  }

  const payloadJson = {
    calcVersion: proposal.calcVersion,
    orderNumber: spec.orderNumber,
    provider: spec.provider,
    refundId: spec.refundId,
    providerRefundId: spec.providerRefundId,
    sourceType: spec.sourceType,
    sourceId: spec.sourceId,
    diagnostics: proposal.diagnostics,
    reconciliationMetadata: proposal.reconciliationMetadata
  } as Prisma.InputJsonValue;

  const result = await postJournalFromEvent({
    eventType: ORDER_REFUNDED_PARTIAL_EVENT_TYPE,
    sourceType: ORDER_REFUNDED_PARTIAL_SOURCE_TYPE,
    sourceId: spec.refundId,
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
          documentType: ORDER_REFUNDED_PARTIAL_DOCUMENT_TYPE_ORDER,
          documentId: spec.orderId,
          journalEntryId: result.journal.id
        }
      },
      create: {
        documentType: ORDER_REFUNDED_PARTIAL_DOCUMENT_TYPE_ORDER,
        documentId: spec.orderId,
        journalEntryId: result.journal.id
      },
      update: {}
    });
    await prisma.accountingDocumentLink.upsert({
      where: {
        documentType_documentId_journalEntryId: {
          documentType: ORDER_REFUNDED_PARTIAL_DOCUMENT_TYPE_REFUND,
          documentId: spec.refundId,
          journalEntryId: result.journal.id
        }
      },
      create: {
        documentType: ORDER_REFUNDED_PARTIAL_DOCUMENT_TYPE_REFUND,
        documentId: spec.refundId,
        journalEntryId: result.journal.id
      },
      update: {}
    });
  }

  return { duplicate: result.duplicate, proposal, event: result.event, journal: result.journal };
}
