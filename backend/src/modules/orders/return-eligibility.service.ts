import type {
  OrderStatus,
  PaymentStatus,
  Prisma,
  ReturnLineReviewDecision
} from "@prisma/client";

import { prisma } from "../../config/db";
import { orderHasActiveRtoShipment } from "./rto-workflow.service";
import { getReturnWindowDays } from "./return-replacement.constants";
import { getReturnedQuantityForOrderItem } from "./order-inventory-restock.service";
import { resolveDeliveredAt } from "./order-service-request.service";

export type ReturnEligibilityResult = {
  eligible: boolean;
  blockCode?: string;
  customerMessage?: string;
  deliveredAt?: Date;
  returnWindowEndsAt?: Date;
  returnWindowExpired?: boolean;
  maxReturnableQty?: number;
};

type OrderRow = {
  id: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  customerId?: string | null;
  email: string;
  shipments: Array<{ status: string; deliveredAt: Date | null }>;
  statusHistory: Array<{ toStatus: string; createdAt: Date }>;
  payments: Array<{ provider: string; status: string }>;
};

type DbClient = Prisma.TransactionClient | typeof prisma;

/** Case statuses that can still hold per-line return commitments. */
const COMMITMENT_CASE_STATUSES = new Set([
  "PENDING_APPROVAL",
  "MORE_INFO_REQUIRED",
  "PARTIALLY_APPROVED",
  "APPROVED",
  "NEEDS_DISCUSSION"
]);

export function resolveDeliveredAtFromOrder(order: {
  status: OrderStatus;
  shipments: Array<{ status: string; deliveredAt: Date | null }>;
  statusHistory: Array<{ toStatus: string; createdAt: Date }>;
}): Date | null {
  // Same canonical resolution as My Orders / canRequestRefund (earliest shipment or history).
  return resolveDeliveredAt(order);
}

function isPaidForReturn(paymentStatus: PaymentStatus, payments: OrderRow["payments"]): boolean {
  if (["CAPTURED", "PARTIALLY_REFUNDED", "REFUNDED"].includes(paymentStatus)) return true;
  return payments.some((p) => p.provider === "COD" && p.status === "CAPTURED");
}

/**
 * Per-line qty that is unavailable for a new return request.
 * Uses reviewDecision (not case status alone). REJECTED is locked for launch.
 */
export function unavailableReturnQtyFromCaseLines(
  lines: Array<{
    qtySelected: number;
    reviewDecision: ReturnLineReviewDecision | string;
    caseStatus: string;
  }>
): number {
  let unavailable = 0;
  for (const line of lines) {
    const decision = line.reviewDecision;
    const status = line.caseStatus;

    // Launch: rejected qty stays locked (no silent resubmit).
    if (decision === "REJECTED" || status === "REJECTED") {
      unavailable += line.qtySelected;
      continue;
    }

    if (!COMMITMENT_CASE_STATUSES.has(status)) {
      continue;
    }

    // PENDING / MORE_INFO_REQUIRED / APPROVED all reduce availability on open/partial/approved cases.
    if (
      decision === "PENDING" ||
      decision === "MORE_INFO_REQUIRED" ||
      decision === "APPROVED"
    ) {
      unavailable += line.qtySelected;
    }
  }
  return unavailable;
}

async function caseUnavailableQtyForOrderItem(
  orderItemId: string,
  db: DbClient = prisma
): Promise<number> {
  const lines = await db.orderServiceRequestItem.findMany({
    where: {
      orderItemId,
      request: { type: "REFUND_AFTER_DELIVERY" }
    },
    select: {
      qtySelected: true,
      reviewDecision: true,
      request: { select: { status: true } }
    }
  });

  return unavailableReturnQtyFromCaseLines(
    lines.map((line) => ({
      qtySelected: line.qtySelected,
      reviewDecision: line.reviewDecision,
      caseStatus: line.request.status
    }))
  );
}

/** Customer-facing qty rejection used by submit guard. */
export function qtyExceedsAvailableMessage(remaining: number): string {
  if (remaining <= 0) {
    return "No units are currently eligible for a new return request.";
  }
  return remaining === 1
    ? "Only 1 unit is currently eligible for a new return request."
    : `Only ${remaining} units are currently eligible for a new return request.`;
}

/**
 * Authoritative post-delivery return/replacement eligibility for one order line + qty.
 * Pass `db` (transaction client) when rechecking under a row lock.
 */
export async function getReturnEligibility(opts: {
  order: OrderRow;
  orderItemId: string;
  qtyRequested: number;
  customerId?: string;
  customerEmail?: string;
  db?: DbClient;
}): Promise<ReturnEligibilityResult> {
  const db = opts.db ?? prisma;
  const deliveredAt =
    resolveDeliveredAtFromOrder(opts.order) ?? resolveDeliveredAt(opts.order as Parameters<typeof resolveDeliveredAt>[0]);

  if (opts.order.status !== "DELIVERED" || !deliveredAt) {
    return {
      eligible: false,
      blockCode: "NOT_DELIVERED",
      customerMessage: "Returns and replacements are available only after delivery."
    };
  }

  if (await orderHasActiveRtoShipment(opts.order.id)) {
    return {
      eligible: false,
      blockCode: "RTO_ACTIVE",
      customerMessage: "This order has an active return-to-origin shipment. Contact support."
    };
  }

  if (!isPaidForReturn(opts.order.paymentStatus, opts.order.payments)) {
    return {
      eligible: false,
      blockCode: "NOT_PAID",
      customerMessage: "This order is not eligible for return until payment is confirmed."
    };
  }

  const windowDays = getReturnWindowDays();
  const returnWindowEndsAt = new Date(deliveredAt.getTime() + windowDays * 24 * 60 * 60 * 1000);
  const returnWindowExpired = Date.now() > returnWindowEndsAt.getTime();

  if (returnWindowExpired) {
    return {
      eligible: false,
      blockCode: "RETURN_WINDOW_EXPIRED",
      customerMessage: `The ${windowDays}-day return window after delivery has ended.`,
      deliveredAt,
      returnWindowEndsAt,
      returnWindowExpired: true
    };
  }

  const pending = await db.orderServiceRequest.findFirst({
    where: { orderId: opts.order.id, status: "PENDING_APPROVAL", type: "REFUND_AFTER_DELIVERY" }
  });
  if (pending) {
    return {
      eligible: false,
      blockCode: "REQUEST_PENDING",
      customerMessage: "A return or replacement request is already waiting for review.",
      deliveredAt,
      returnWindowEndsAt
    };
  }

  const item = await db.orderItem.findFirst({
    where: { id: opts.orderItemId, orderId: opts.order.id }
  });
  if (!item) {
    return {
      eligible: false,
      blockCode: "ITEM_NOT_FOUND",
      customerMessage: "Item not found on this order."
    };
  }

  const alreadyReturned = await getReturnedQuantityForOrderItem(db, opts.orderItemId);
  const caseUnavailable = await caseUnavailableQtyForOrderItem(opts.orderItemId, db);
  // Restock events outside a case still consume returnable units; case lines use per-line decisions.
  const maxReturnableQty = Math.max(0, item.qtyOrdered - Math.max(alreadyReturned, caseUnavailable));

  if (opts.qtyRequested <= 0 || opts.qtyRequested > maxReturnableQty) {
    return {
      eligible: false,
      blockCode: "QTY_EXCEEDS_AVAILABLE",
      customerMessage: `You can return or replace at most ${maxReturnableQty} unit(s) of this item.`,
      deliveredAt,
      returnWindowEndsAt,
      maxReturnableQty
    };
  }

  return {
    eligible: true,
    deliveredAt,
    returnWindowEndsAt,
    returnWindowExpired: false,
    maxReturnableQty
  };
}
