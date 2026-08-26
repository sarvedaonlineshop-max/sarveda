import type { PaymentProvider, PaymentStatus } from "@prisma/client";

import { prisma } from "../../config/db";

import { OrderSnapshotNotFoundError } from "./accounting-errors";
import type { OrderPaidTaxDiagnostics, ProposedJournalLine } from "./order-paid-journal.types";
import {
  ORDER_PAID_CALC_VERSION,
  ORDER_PAID_EVENT_TYPE,
  orderPaidUniqueKey
} from "./order-paid.constants";
import type {
  OrderRefundContext,
  OriginalSaleJournalSnapshot,
  RefundRowSnapshot
} from "./order-refunded-full.types";

function pickPrimaryPayment<
  T extends { provider: PaymentProvider; status: PaymentStatus; createdAt: Date }
>(payments: T[]): T | null {
  if (payments.length === 0) return null;
  const cod = payments.find((p) => p.provider === "COD");
  if (cod) return cod;
  const capturedOrRefunded = payments
    .filter((p) =>
      ["CAPTURED", "REFUNDED", "PARTIALLY_REFUNDED"].includes(p.status)
    )
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  if (capturedOrRefunded[0]) return capturedOrRefunded[0];
  return payments.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null;
}

function extractZohoCreditNote(rawPayload: unknown): {
  zohoCreditNoteId: string | null;
  zohoCreditNoteNumber: string | null;
} {
  if (!rawPayload || typeof rawPayload !== "object") {
    return { zohoCreditNoteId: null, zohoCreditNoteNumber: null };
  }
  const raw = rawPayload as Record<string, unknown>;
  const id = typeof raw.zohoCreditNoteId === "string" ? raw.zohoCreditNoteId : null;
  const no =
    typeof raw.zohoCreditNoteNumber === "string" ? raw.zohoCreditNoteNumber : null;
  return { zohoCreditNoteId: id, zohoCreditNoteNumber: no };
}

async function loadOriginalSaleJournal(
  orderId: string
): Promise<OriginalSaleJournalSnapshot | null> {
  const uniqueKey = orderPaidUniqueKey(orderId);
  const event = await prisma.accountingPostingEvent.findUnique({
    where: {
      eventType_uniqueKey: {
        eventType: ORDER_PAID_EVENT_TYPE,
        uniqueKey
      }
    },
    include: {
      journalEntry: {
        include: {
          lines: {
            include: { account: true },
            orderBy: { sortOrder: "asc" }
          }
        }
      }
    }
  });

  if (!event || event.status !== "POSTED" || !event.journalEntry) {
    return null;
  }

  const payload =
    event.payloadJson && typeof event.payloadJson === "object"
      ? (event.payloadJson as Record<string, unknown>)
      : {};

  const calcVersion =
    typeof payload.calcVersion === "string" ? payload.calcVersion : ORDER_PAID_CALC_VERSION;

  const diagnostics =
    payload.diagnostics && typeof payload.diagnostics === "object"
      ? (payload.diagnostics as OrderPaidTaxDiagnostics)
      : null;

  const reconciliationMetadata =
    payload.reconciliationMetadata && typeof payload.reconciliationMetadata === "object"
      ? (payload.reconciliationMetadata as Record<string, unknown>)
      : null;

  const lines: ProposedJournalLine[] = event.journalEntry.lines.map((line) => ({
    accountCode: line.account.code,
    accountName: line.account.name,
    debitInPaise: line.debitInPaise,
    creditInPaise: line.creditInPaise,
    lineMemo: line.lineMemo ?? undefined,
    amountSource: "posted_ORDER_PAID_journal_line"
  }));

  return {
    postingEventId: event.id,
    uniqueKey,
    journalEntryId: event.journalEntry.id,
    journalEntryNumber: event.journalEntry.entryNumber,
    calcVersion,
    lines,
    diagnostics,
    reconciliationMetadata
  };
}

function toRefundRow(r: {
  id: string;
  paymentId: string;
  amountInPaise: number;
  status: string;
  providerRefundId: string | null;
  reason: string | null;
  createdAt: Date;
}): RefundRowSnapshot {
  return {
    id: r.id,
    paymentId: r.paymentId,
    amountInPaise: r.amountInPaise,
    status: r.status,
    providerRefundId: r.providerRefundId,
    reason: r.reason,
    createdAt: r.createdAt
  };
}

const orderRefundInclude = {
  payments: {
    orderBy: { createdAt: "desc" as const },
    include: {
      refunds: {
        orderBy: [{ createdAt: "asc" as const }, { id: "asc" as const }]
      }
    }
  }
};

type OrderWithRefunds = NonNullable<
  Awaited<
    ReturnType<
      typeof prisma.order.findFirst<{
        include: {
          payments: {
            orderBy: { createdAt: "desc" };
            include: {
              refunds: {
                orderBy: Array<{ createdAt?: "asc"; id?: "asc" }>;
              };
            };
          };
        };
      }>
    >
  >
>;

async function buildContextFromOrder(order: OrderWithRefunds): Promise<OrderRefundContext> {
  const payment = pickPrimaryPayment(order.payments);
  if (!payment) {
    throw new OrderSnapshotNotFoundError(order.id);
  }

  const zohoCn = extractZohoCreditNote(payment.rawPayload);
  const allRefunds = order.payments.flatMap((p) => p.refunds.map(toRefundRow));
  const originalSale = await loadOriginalSaleJournal(order.id);

  return {
    orderId: order.id,
    orderNumber: order.orderNumber,
    currency: order.currency,
    orderStatus: order.status,
    paymentStatus: order.paymentStatus,
    grandTotalInPaise: order.grandTotalInPaise,
    provider: payment.provider,
    paymentId: payment.id,
    paymentAmountInPaise: payment.amountInPaise,
    paymentStatusDetail: payment.status,
    refundedInPaise: payment.refundedInPaise,
    refunds: allRefunds,
    zohoInvoiceId: order.zohoInvoiceId,
    zohoInvoiceNo: order.zohoInvoiceNo,
    zohoCreditNoteId: zohoCn.zohoCreditNoteId,
    zohoCreditNoteNumber: zohoCn.zohoCreditNoteNumber,
    orderPlacedAt: order.placedAt ?? order.createdAt,
    originalSale
  };
}

export async function loadOrderRefundContextByOrderId(
  orderId: string
): Promise<OrderRefundContext> {
  const order = await prisma.order.findFirst({
    where: { id: orderId, deletedAt: null },
    include: orderRefundInclude
  });
  if (!order) throw new OrderSnapshotNotFoundError(orderId);
  return buildContextFromOrder(order);
}

export async function loadOrderRefundContextByOrderNumber(
  orderNumber: string
): Promise<OrderRefundContext> {
  const order = await prisma.order.findFirst({
    where: { orderNumber: orderNumber.trim(), deletedAt: null },
    include: orderRefundInclude
  });
  if (!order) throw new OrderSnapshotNotFoundError(orderNumber);
  return buildContextFromOrder(order);
}

export async function loadOrderRefundContext(identifier: {
  orderId?: string;
  orderNumber?: string;
  refundId?: string;
}): Promise<OrderRefundContext> {
  if (identifier.refundId?.trim()) {
    const refund = await prisma.refund.findUnique({
      where: { id: identifier.refundId.trim() },
      include: { payment: { select: { orderId: true } } }
    });
    if (!refund) throw new OrderSnapshotNotFoundError(identifier.refundId);
    return loadOrderRefundContextByOrderId(refund.payment.orderId);
  }
  if (identifier.orderId?.trim()) {
    return loadOrderRefundContextByOrderId(identifier.orderId.trim());
  }
  if (identifier.orderNumber?.trim()) {
    return loadOrderRefundContextByOrderNumber(identifier.orderNumber.trim());
  }
  throw new OrderSnapshotNotFoundError("orderId, orderNumber, or refundId required");
}

export type RefundDiscoveryCandidate = {
  refundId: string;
  orderId: string;
  orderNumber: string;
  amountInPaise: number;
  status: string;
  providerRefundId: string | null;
  createdAt: Date;
  provider: PaymentProvider;
};

/** Read-only Refund-table scan — deterministic order by createdAt, id. */
export async function findRefundDiscoveryCandidates(opts: {
  orderId?: string;
  orderNumber?: string;
  refundId?: string;
  since?: Date;
  until?: Date;
  limit: number;
}): Promise<RefundDiscoveryCandidate[]> {
  if (opts.refundId?.trim()) {
    const refund = await prisma.refund.findUnique({
      where: { id: opts.refundId.trim() },
      include: {
        payment: {
          select: {
            provider: true,
            order: { select: { id: true, orderNumber: true, deletedAt: true } }
          }
        }
      }
    });
    if (!refund || refund.payment.order.deletedAt) return [];
    return [
      {
        refundId: refund.id,
        orderId: refund.payment.order.id,
        orderNumber: refund.payment.order.orderNumber,
        amountInPaise: refund.amountInPaise,
        status: refund.status,
        providerRefundId: refund.providerRefundId,
        createdAt: refund.createdAt,
        provider: refund.payment.provider
      }
    ];
  }

  const where = {
    amountInPaise: { gt: 0 },
    ...(opts.since && opts.until && !opts.orderId && !opts.orderNumber
      ? { createdAt: { gte: opts.since, lt: opts.until } }
      : {}),
    payment: {
      order: {
        deletedAt: null,
        ...(opts.orderId ? { id: opts.orderId } : {}),
        ...(opts.orderNumber ? { orderNumber: opts.orderNumber.trim() } : {})
      }
    }
  };

  const refunds = await prisma.refund.findMany({
    where,
    include: {
      payment: {
        select: {
          provider: true,
          order: { select: { id: true, orderNumber: true } }
        }
      }
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: opts.limit
  });

  // Deduplicate by order for discovery loop (process each order once)
  const seenOrders = new Set<string>();
  const candidates: RefundDiscoveryCandidate[] = [];
  for (const r of refunds) {
    if (seenOrders.has(r.payment.order.id)) continue;
    seenOrders.add(r.payment.order.id);
    candidates.push({
      refundId: r.id,
      orderId: r.payment.order.id,
      orderNumber: r.payment.order.orderNumber,
      amountInPaise: r.amountInPaise,
      status: r.status,
      providerRefundId: r.providerRefundId,
      createdAt: r.createdAt,
      provider: r.payment.provider
    });
  }
  return candidates;
}
