import type { Prisma } from "@prisma/client";

import { prisma } from "../../config/db";

import { assertDocumentDateAllowedForPosting } from "./accounting-cutover";
import { OrderRefundedPartialJournalImbalanceError } from "./accounting-errors";
import {
  buildOrderSupplementaryPaidJournal,
  type SupplementaryPaidSpec
} from "./order-supplementary-paid-journal.builder";
import {
  ORDER_SUPPLEMENTARY_PAID_DOCUMENT_TYPE,
  ORDER_SUPPLEMENTARY_PAID_EVENT_TYPE,
  ORDER_SUPPLEMENTARY_PAID_SOURCE_TYPE,
  orderSupplementaryPaidUniqueKey
} from "./order-supplementary-paid.constants";
import { ORDER_PAID_EVENT_TYPE, orderPaidUniqueKey } from "./order-paid.constants";
import { getAccountingAccountByCode } from "./seed-coa";
import { postJournalFromEvent, getPostingEvent } from "./posting-event.service";
import { assertRefundPostingPersistenceAllowed } from "./production-guard";

async function resolveAccountIds(codes: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  for (const code of [...new Set(codes)]) {
    const account = await getAccountingAccountByCode(code);
    if (!account) {
      throw new Error(`Account ${code} not found in chart of accounts`);
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
    return (diag as Record<string, unknown>).supplyType === "INTER_STATE";
  }
  return false;
}

export async function postOrderSupplementaryPaid(
  spec: SupplementaryPaidSpec,
  opts?: { postedByUserId?: string; forcePersist?: boolean }
): Promise<{ duplicate: boolean }> {
  if (!opts?.forcePersist) {
    assertRefundPostingPersistenceAllowed();
  }

  const order = await prisma.order.findUnique({
    where: { id: spec.orderId },
    select: { placedAt: true, createdAt: true }
  });
  if (!order) throw new Error("Order not found");

  assertDocumentDateAllowedForPosting(order.placedAt ?? order.createdAt);

  const specWithInterState = {
    ...spec,
    interState: spec.interState || (await loadInterStateFromOriginalSale(spec.orderId))
  };

  const proposal = buildOrderSupplementaryPaidJournal(specWithInterState);
  if (!proposal.balanced) {
    throw new OrderRefundedPartialJournalImbalanceError(
      proposal.totalDebitPaise,
      proposal.totalCreditPaise,
      proposal.imbalancePaise
    );
  }

  const uniqueKey = orderSupplementaryPaidUniqueKey(spec.orderId, spec.supplementaryPaymentId);
  const existing = await getPostingEvent(ORDER_SUPPLEMENTARY_PAID_EVENT_TYPE, uniqueKey);
  if (existing?.status === "POSTED" && existing.journalEntryId) {
    return { duplicate: true };
  }

  const accountIds = await resolveAccountIds(proposal.lines.map((l) => l.accountCode));
  const payloadJson = {
    calcVersion: proposal.calcVersion,
    orderNumber: spec.orderNumber,
    provider: spec.provider,
    supplementaryPaymentId: spec.supplementaryPaymentId,
    sourceId: spec.sourceId,
    totalAmountPaise: spec.totalAmountPaise
  } as Prisma.InputJsonValue;

  const result = await postJournalFromEvent({
    eventType: ORDER_SUPPLEMENTARY_PAID_EVENT_TYPE,
    sourceType: ORDER_SUPPLEMENTARY_PAID_SOURCE_TYPE,
    sourceId: spec.supplementaryPaymentId,
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
          documentType: ORDER_SUPPLEMENTARY_PAID_DOCUMENT_TYPE,
          documentId: spec.supplementaryPaymentId,
          journalEntryId: result.journal.id
        }
      },
      create: {
        documentType: ORDER_SUPPLEMENTARY_PAID_DOCUMENT_TYPE,
        documentId: spec.supplementaryPaymentId,
        journalEntryId: result.journal.id
      },
      update: {}
    });
  }

  return { duplicate: result.duplicate };
}
