import type { ReturnShippingRefundPolicy } from "@prisma/client";

import { allocateOrderDiscountPaise } from "../accounting/discount-allocation";
import { prisma } from "../../config/db";
import { pickCapturedPaymentForRefund } from "../payments/payment-selection";

export type ReturnItemRefundPreview = {
  merchandiseRefundPaise: number;
  shippingRefundPaise: number;
  totalRefundPaise: number;
  shippingPolicy: ReturnShippingRefundPolicy;
  explanation: string;
};

/**
 * Authoritative refund amount for one order line + qty on a post-delivery return.
 * Does not hit gateway; used before executeAuthoritativePartialRefund.
 */
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

  let shippingRefundPaise = 0;
  if (
    !opts.keepItem &&
    opts.shippingPolicy === "SHIPPING_REFUNDABLE" &&
    order.shippingInPaise > 0
  ) {
    // Refund customer shipping when Sarveda fault — proportional if partial order return.
    const totalQty = order.items.reduce((s, i) => s + i.qtyOrdered, 0);
    shippingRefundPaise = Math.round((order.shippingInPaise * opts.qty) / Math.max(1, totalQty));
    if (opts.qty === item.qtyOrdered && order.items.length === 1) {
      shippingRefundPaise = order.shippingInPaise;
    }
  }

  const pick = pickCapturedPaymentForRefund(order.payments);
  const remaining =
    pick.ok && pick.payment
      ? Math.max(0, pick.payment.amountInPaise - (pick.payment.refundedInPaise ?? 0))
      : order.grandTotalInPaise;

  let totalRefundPaise = merchandiseRefundPaise + shippingRefundPaise;
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
    totalRefundPaise,
    shippingPolicy: opts.shippingPolicy,
    explanation
  };
}
