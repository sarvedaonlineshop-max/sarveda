import { randomUUID } from "crypto";

import { OrderInventoryRestockDisposition } from "@prisma/client";
import { z } from "zod";

import { allocateOrderDiscountPaise } from "../accounting/discount-allocation";
import { prisma } from "../../config/db";
import { logger } from "../../config/logger";
import { orderItemWarehouseUnits } from "../inventory/order-item-fulfillment";
import { executeAuthoritativePartialRefund } from "../payments/partial-refund-settlement.service";
import { pickCapturedPaymentForRefund } from "../payments/payment-selection";
import {
  adminApplyInventoryRestock,
  getReturnedQuantityForOrderItem
} from "./order-inventory-restock.service";
import { calculateReturnItemRefund } from "./return-refund-calculator.service";

export const adminLineRefundBodySchema = z.object({
  lines: z
    .array(
      z.object({
        orderItemId: z.string().uuid(),
        quantity: z.number().int().positive().max(1000)
      })
    )
    .min(1)
    .max(50),
  refundShipping: z.boolean().optional().default(false),
  restock: z.boolean().optional().default(false),
  reason: z.string().trim().max(500).optional(),
  idempotencyKey: z.string().trim().min(8).max(128).optional()
});

export type AdminLineRefundBody = z.infer<typeof adminLineRefundBodySchema>;

export type LineRefundOptionRow = {
  orderItemId: string;
  name: string;
  sku: string;
  qtyOrdered: number;
  unitPriceInPaise: number;
  /** Net of allocated order discount — the amount actually refunded per unit. */
  perUnitRefundInPaise: number;
  maxRefundQty: number;
  restockableQty: number;
};

export type LineRefundOptions = {
  orderNumber: string;
  currency: string;
  eligible: boolean;
  ineligibleReason: string | null;
  paymentMethod: string | null;
  originallyCollectedInPaise: number;
  alreadyRefundedInPaise: number;
  remainingRefundableInPaise: number;
  shippingInPaise: number;
  restockAvailable: boolean;
  restockUnavailableReason: string | null;
  lines: LineRefundOptionRow[];
};

function badRequest(message: string, code: string, statusCode = 400): Error {
  return Object.assign(new Error(message), { statusCode, code });
}

async function loadOrderForLineRefund(orderId: string) {
  const order = await prisma.order.findFirst({
    where: { id: orderId, deletedAt: null },
    include: {
      items: true,
      shipments: true,
      payments: { orderBy: { createdAt: "desc" } }
    }
  });
  if (!order) {
    throw badRequest("Order not found", "NOT_FOUND", 404);
  }
  return order;
}

/** Per-unit refund value for a line, net of allocated order discount. */
function perUnitRefundInPaise(
  items: Array<{ id: string; lineTotalInPaise: number; unitPriceInPaise: number; qtyOrdered: number }>,
  discountInPaise: number,
  index: number
): number {
  const { lineDiscountsPaise } = allocateOrderDiscountPaise(items, discountInPaise);
  const item = items[index];
  const lineNet = item.lineTotalInPaise - (lineDiscountsPaise[index] ?? 0);
  return Math.round(lineNet / Math.max(1, item.qtyOrdered));
}

/**
 * Everything the admin refund panel needs to offer a line-item partial refund.
 * Amounts here match what the execute call will charge to the gateway.
 */
export async function loadLineRefundOptions(orderId: string): Promise<LineRefundOptions> {
  const order = await loadOrderForLineRefund(orderId);
  const pick = pickCapturedPaymentForRefund(order.payments);
  const payment = pick.ok ? pick.payment : null;
  const collected = payment?.amountInPaise ?? 0;
  const refunded = payment?.refundedInPaise ?? 0;
  const remaining = Math.max(0, collected - refunded);

  const hasShipment = order.shipments.length > 0;
  const allocationItems = order.items.map((i) => ({
    id: i.id,
    lineTotalInPaise: i.lineTotalInPaise,
    unitPriceInPaise: i.unitPriceInPaise,
    qtyOrdered: i.qtyOrdered
  }));

  const lines: LineRefundOptionRow[] = [];
  for (const [index, item] of order.items.entries()) {
    const alreadyReturned = item.variantId
      ? await getReturnedQuantityForOrderItem(prisma, item.id)
      : 0;
    const warehouseUnits = item.variantId ? orderItemWarehouseUnits(item) : 0;
    lines.push({
      orderItemId: item.id,
      name: item.nameSnapshot,
      sku: item.skuSnapshot,
      qtyOrdered: item.qtyOrdered,
      unitPriceInPaise: item.unitPriceInPaise,
      perUnitRefundInPaise: perUnitRefundInPaise(allocationItems, order.discountInPaise, index),
      maxRefundQty: item.qtyOrdered,
      restockableQty: Math.max(0, warehouseUnits - alreadyReturned)
    });
  }

  const ineligibleReason = !payment
    ? pick.ok
      ? "No captured payment on this order."
      : pick.message
    : remaining <= 0
      ? "This payment has already been fully refunded."
      : null;

  return {
    orderNumber: order.orderNumber,
    currency: order.currency,
    eligible: ineligibleReason === null,
    ineligibleReason,
    paymentMethod: payment?.provider ?? null,
    originallyCollectedInPaise: collected,
    alreadyRefundedInPaise: refunded,
    remainingRefundableInPaise: remaining,
    shippingInPaise: order.shippingInPaise,
    restockAvailable: !hasShipment && lines.some((l) => l.restockableQty > 0),
    restockUnavailableReason: hasShipment
      ? "Stock returns after dispatch are handled by the return or RTO workflow."
      : null,
    lines
  };
}

export type LineRefundResult = {
  refundedInPaise: number;
  merchandiseRefundInPaise: number;
  shippingRefundInPaise: number;
  restockedUnits: number;
  netCollectedInPaise: number;
  refunds: Array<{ orderItemId: string; quantity: number; amountInPaise: number; providerRefundId: string }>;
};

/**
 * Admin line-item partial refund: gateway + ORDER_REFUNDED_PARTIAL accounting per line,
 * with optional pre-dispatch restock. Idempotent per (idempotencyKey, orderItemId).
 * Full refunds keep using the separate full-refund action.
 */
export async function executeAdminLineRefund(opts: {
  orderId: string;
  body: AdminLineRefundBody;
  adminEmail?: string;
  adminUserId?: string;
}): Promise<LineRefundResult> {
  const order = await loadOrderForLineRefund(opts.orderId);
  const pick = pickCapturedPaymentForRefund(order.payments);
  if (!pick.ok) {
    throw badRequest(
      pick.message,
      pick.code,
      pick.code === "MULTIPLE_CAPTURED_PAYMENTS_REVIEW_REQUIRED" ? 409 : 400
    );
  }
  const payment = pick.payment;
  const remaining = Math.max(0, payment.amountInPaise - (payment.refundedInPaise ?? 0));
  if (remaining <= 0) {
    throw badRequest("This payment has already been fully refunded", "ALREADY_REFUNDED", 409);
  }

  const seen = new Set<string>();
  for (const line of opts.body.lines) {
    if (seen.has(line.orderItemId)) {
      throw badRequest("Each product may appear only once in a refund", "DUPLICATE_REFUND_LINE");
    }
    seen.add(line.orderItemId);
    const item = order.items.find((i) => i.id === line.orderItemId);
    if (!item) {
      throw badRequest("Product is not on this order", "ORDER_ITEM_NOT_ON_ORDER");
    }
    if (line.quantity > item.qtyOrdered) {
      throw badRequest(
        `Cannot refund ${line.quantity} of ${item.nameSnapshot} — only ${item.qtyOrdered} were purchased`,
        "REFUND_QTY_EXCEEDS_ORDERED"
      );
    }
  }

  const priced: Array<{
    orderItemId: string;
    quantity: number;
    merchandiseInPaise: number;
    shippingInPaise: number;
    totalInPaise: number;
  }> = [];
  for (const line of opts.body.lines) {
    const preview = await calculateReturnItemRefund({
      orderId: order.id,
      orderItemId: line.orderItemId,
      qty: line.quantity,
      shippingPolicy: opts.body.refundShipping ? "SHIPPING_REFUNDABLE" : "SHIPPING_RETAINED",
      keepItem: !opts.body.refundShipping
    });
    priced.push({
      orderItemId: line.orderItemId,
      quantity: line.quantity,
      merchandiseInPaise: preview.merchandiseRefundPaise,
      shippingInPaise: preview.shippingRefundPaise,
      totalInPaise: preview.totalRefundPaise
    });
  }

  const totalInPaise = priced.reduce((sum, l) => sum + l.totalInPaise, 0);
  if (totalInPaise <= 0) {
    throw badRequest("Refund amount must be greater than zero", "ZERO_REFUND");
  }
  if (totalInPaise >= remaining) {
    throw badRequest(
      "This refunds the whole remaining payment. Use Refund to customer for a full refund.",
      "FULL_REFUND_REQUIRED",
      409
    );
  }

  if (opts.body.restock) {
    if (order.shipments.length > 0) {
      throw badRequest(
        "Stock returns after dispatch are handled by the return or RTO workflow",
        "RESTOCK_NOT_ALLOWED",
        409
      );
    }
    for (const line of priced) {
      const item = order.items.find((i) => i.id === line.orderItemId)!;
      if (!item.variantId) {
        throw badRequest(
          `${item.nameSnapshot} has no stock to return`,
          "RESTOCK_DIGITAL_LINE"
        );
      }
      const alreadyReturned = await getReturnedQuantityForOrderItem(prisma, item.id);
      const returnable = orderItemWarehouseUnits(item) - alreadyReturned;
      if (line.quantity > returnable) {
        throw badRequest(
          `Cannot return ${line.quantity} unit(s) of ${item.nameSnapshot} to stock — only ${returnable} remaining`,
          "RESTOCK_QTY_EXCEEDS_REMAINING"
        );
      }
    }
  }

  const idempotencyKey = opts.body.idempotencyKey?.trim() || randomUUID();
  const reason =
    opts.body.reason?.trim() ||
    `Partial refund by ${opts.adminEmail ?? "admin"}`;

  const refunds: LineRefundResult["refunds"] = [];
  for (const line of priced) {
    const result = await executeAuthoritativePartialRefund({
      orderId: order.id,
      sourceType: "ORDER_ADJUSTMENT",
      sourceId: `LINE_REFUND:${idempotencyKey}:${line.orderItemId}`,
      reason,
      adjustmentMerchandiseRefundPaise: line.totalInPaise,
      orderItemId: line.orderItemId
    });
    refunds.push({
      orderItemId: line.orderItemId,
      quantity: line.quantity,
      amountInPaise: result.amountInPaise,
      providerRefundId: result.providerRefundId
    });
  }

  let restockedUnits = 0;
  if (opts.body.restock) {
    const { events } = await adminApplyInventoryRestock({
      orderId: order.id,
      body: {
        lines: priced.map((l) => ({
          orderItemId: l.orderItemId,
          quantity: l.quantity,
          disposition: OrderInventoryRestockDisposition.SELLABLE
        })),
        reason: `Returned to stock with partial refund — ${reason}`,
        idempotencyKey: `LINE_REFUND:${idempotencyKey}:restock`
      },
      createdByUserId: opts.adminUserId
    });
    restockedUnits = events
      .filter((e) => e.inventoryIncremented)
      .reduce((sum, e) => sum + e.quantity, 0);
  }

  const settledPayment = await prisma.payment.findUnique({ where: { id: payment.id } });
  const netCollectedInPaise = Math.max(
    0,
    (settledPayment?.amountInPaise ?? payment.amountInPaise) -
      (settledPayment?.refundedInPaise ?? 0)
  );

  logger.info("admin_line_refund_executed", {
    orderId: order.id,
    orderNumber: order.orderNumber,
    idempotencyKey,
    lineCount: refunds.length,
    totalInPaise,
    restockedUnits,
    adminEmail: opts.adminEmail
  });

  return {
    refundedInPaise: refunds.reduce((sum, r) => sum + r.amountInPaise, 0),
    merchandiseRefundInPaise: priced.reduce((sum, l) => sum + l.merchandiseInPaise, 0),
    shippingRefundInPaise: priced.reduce((sum, l) => sum + l.shippingInPaise, 0),
    restockedUnits,
    netCollectedInPaise,
    refunds
  };
}
