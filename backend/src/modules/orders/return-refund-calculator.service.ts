import type { ReturnShippingRefundPolicy } from "@prisma/client";

import { allocateOrderDiscountPaise } from "../accounting/discount-allocation";
import { prisma } from "../../config/db";
import { pickCapturedPaymentForRefund } from "../payments/payment-selection";

export type ReturnItemRefundPreview = {
  merchandiseRefundPaise: number;
  shippingRefundPaise: number;
  /** Reserved for future policy components; currently 0 (GST inclusive in merchandise). */
  otherAdjustmentPaise: number;
  totalRefundPaise: number;
  shippingPolicy: ReturnShippingRefundPolicy;
  explanation: string;
  /** Gross share of line before order discount (qty-scaled). */
  grossItemValuePaise: number;
  /** Allocated order discount share for this qty. */
  allocatedDiscountPaise: number;
};

/**
 * Authoritative refund amount for one order line + qty on a post-delivery return.
 * Does not hit gateway; used before executeAuthoritativePartialRefund.
 */
export function caseMerchandiseCeilingPaise(
  lineTotalInPaise: number,
  qtyOrdered: number,
  qtySelected: number,
  alreadyRefundedInPaise = 0
): number {
  if (qtyOrdered <= 0 || qtySelected <= 0) return 0;
  const full = Math.round((lineTotalInPaise * Math.min(qtySelected, qtyOrdered)) / qtyOrdered);
  return Math.max(0, full - alreadyRefundedInPaise);
}

/**
 * Existing SHIPPING_REFUNDABLE rule (seller fault):
 * - Full shipping when returning the entire single-line order quantity.
 * - Otherwise proportional: round(orderShipping * qtyReturned / sum(qtyOrdered across lines)).
 * - SHIPPING_RETAINED / MANUAL_REVIEW / keep-item → 0 shipping in this calculator.
 */
export function calculateSellerFaultShippingRefundPaise(opts: {
  shippingPolicy: ReturnShippingRefundPolicy;
  keepItem?: boolean;
  orderShippingInPaise: number;
  qtyReturned: number;
  lineQtyOrdered: number;
  orderLineCount: number;
  orderTotalQtyOrdered: number;
}): number {
  if (
    opts.keepItem ||
    opts.shippingPolicy !== "SHIPPING_REFUNDABLE" ||
    opts.orderShippingInPaise <= 0 ||
    opts.qtyReturned <= 0
  ) {
    return 0;
  }
  if (opts.qtyReturned === opts.lineQtyOrdered && opts.orderLineCount === 1) {
    return opts.orderShippingInPaise;
  }
  return Math.round(
    (opts.orderShippingInPaise * opts.qtyReturned) / Math.max(1, opts.orderTotalQtyOrdered)
  );
}

export async function calculateReturnItemRefund(opts: {
  orderId: string;
  orderItemId: string;
  qty: number;
  shippingPolicy: ReturnShippingRefundPolicy;
  /** When true (KEEP_ITEM_PARTIAL_REFUND), merchandise only — no physical return shipping component. */
  keepItem?: boolean;
}): Promise<ReturnItemRefundPreview> {
  const order = await prisma.order.findUnique({
    where: { id: opts.orderId },
    include: { items: true, payments: { orderBy: { createdAt: "desc" } } }
  });
  if (!order) {
    throw Object.assign(new Error("Order not found"), { statusCode: 404, code: "NOT_FOUND" });
  }

  const item = order.items.find((i) => i.id === opts.orderItemId);
  if (!item || opts.qty <= 0 || opts.qty > item.qtyOrdered) {
    throw Object.assign(new Error("Invalid return quantity"), { statusCode: 400, code: "BAD_QTY" });
  }

  const allocationItems = order.items.map((i) => ({
    lineTotalInPaise: i.lineTotalInPaise,
    unitPriceInPaise: i.unitPriceInPaise,
    qtyOrdered: i.qtyOrdered
  }));
  const { lineDiscountsPaise } = allocateOrderDiscountPaise(allocationItems, order.discountInPaise);
  const itemIndex = order.items.findIndex((i) => i.id === opts.orderItemId);
  const lineDiscount = lineDiscountsPaise[itemIndex] ?? 0;
  const lineNet = item.lineTotalInPaise - lineDiscount;
  const perUnitNet = Math.round(lineNet / item.qtyOrdered);
  const merchandiseRefundPaise = perUnitNet * opts.qty;
  const grossItemValuePaise = Math.round((item.lineTotalInPaise * opts.qty) / item.qtyOrdered);
  const allocatedDiscountPaise = Math.round((lineDiscount * opts.qty) / item.qtyOrdered);

  const orderTotalQtyOrdered = order.items.reduce((s, i) => s + i.qtyOrdered, 0);
  const shippingRefundPaise = calculateSellerFaultShippingRefundPaise({
    shippingPolicy: opts.shippingPolicy,
    keepItem: opts.keepItem,
    orderShippingInPaise: order.shippingInPaise,
    qtyReturned: opts.qty,
    lineQtyOrdered: item.qtyOrdered,
    orderLineCount: order.items.length,
    orderTotalQtyOrdered
  });

  const otherAdjustmentPaise = 0;

  const pick = pickCapturedPaymentForRefund(order.payments);
  const remaining =
    pick.ok && pick.payment
      ? Math.max(0, pick.payment.amountInPaise - (pick.payment.refundedInPaise ?? 0))
      : order.grandTotalInPaise;

  let totalRefundPaise = merchandiseRefundPaise + shippingRefundPaise + otherAdjustmentPaise;
  if (totalRefundPaise > remaining) {
    totalRefundPaise = remaining;
  }

  const explanation =
    opts.shippingPolicy === "SHIPPING_REFUNDABLE" && shippingRefundPaise > 0
      ? `Merchandise ${merchandiseRefundPaise / 100} + shipping ${shippingRefundPaise / 100}`
      : opts.shippingPolicy === "SHIPPING_RETAINED"
        ? `Merchandise ${merchandiseRefundPaise / 100}; shipping retained`
        : `Merchandise ${merchandiseRefundPaise / 100}; shipping policy ${opts.shippingPolicy}`;

  return {
    merchandiseRefundPaise,
    shippingRefundPaise,
    otherAdjustmentPaise,
    totalRefundPaise,
    shippingPolicy: opts.shippingPolicy,
    explanation,
    grossItemValuePaise,
    allocatedDiscountPaise
  };
}
