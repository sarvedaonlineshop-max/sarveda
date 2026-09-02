import type { OrderStatus, PaymentStatus } from "@prisma/client";

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

export function resolveDeliveredAtFromOrder(order: {
  status: OrderStatus;
  shipments: Array<{ status: string; deliveredAt: Date | null }>;
  statusHistory: Array<{ toStatus: string; createdAt: Date }>;
}): Date | null {
  if (order.status !== "DELIVERED") return null;
  const shipmentDelivered = order.shipments.find((s) => s.deliveredAt)?.deliveredAt;
  if (shipmentDelivered) return shipmentDelivered;
  const hist = order.statusHistory.find((h) => h.toStatus === "DELIVERED");
  return hist?.createdAt ?? null;
}

function isPaidForReturn(paymentStatus: PaymentStatus, payments: OrderRow["payments"]): boolean {
  if (["CAPTURED", "PARTIALLY_REFUNDED", "REFUNDED"].includes(paymentStatus)) return true;
  return payments.some((p) => p.provider === "COD" && p.status === "CAPTURED");
}

/**
 * Authoritative post-delivery return/replacement eligibility for one order line + qty.
 */
export async function getReturnEligibility(opts: {
  order: OrderRow;
  orderItemId: string;
  qtyRequested: number;
  customerId?: string;
  customerEmail?: string;
}): Promise<ReturnEligibilityResult> {
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

  const pending = await prisma.orderServiceRequest.findFirst({
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

  const item = await prisma.orderItem.findFirst({
    where: { id: opts.orderItemId, orderId: opts.order.id }
  });
  if (!item) {
    return {
      eligible: false,
      blockCode: "ITEM_NOT_FOUND",
      customerMessage: "Item not found on this order."
    };
  }

  const alreadyReturned = await getReturnedQuantityForOrderItem(prisma, opts.orderItemId);
  const alreadyRefundedQty = await prisma.orderServiceRequestItem.aggregate({
    where: {
      orderItemId: opts.orderItemId,
      request: { type: "REFUND_AFTER_DELIVERY", status: { in: ["APPROVED", "PENDING_APPROVAL"] } },
      refundedAt: { not: null }
    },
    _sum: { qtySelected: true }
  });
  const requestItemIds = (
    await prisma.orderServiceRequestItem.findMany({
      where: { orderItemId: opts.orderItemId },
      select: { id: true }
    })
  ).map((r) => r.id);
  const replacedQty = await prisma.orderReplacementFulfillment.aggregate({
    where: {
      requestItemId: { in: requestItemIds },
      status: { in: ["REPLACEMENT_PENDING", "REPLACEMENT_SHIPPED", "REPLACEMENT_DELIVERED", "CLOSED"] }
    },
    _sum: { qty: true }
  });

  const committed =
    alreadyReturned +
    (alreadyRefundedQty._sum.qtySelected ?? 0) +
    (replacedQty._sum?.qty ?? 0);
  const maxReturnableQty = Math.max(0, item.qtyOrdered - committed);

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
