import type { ProductVariant } from "@prisma/client";
import type { Request } from "express";

import { getRedisConnection } from "../../config/redisConnection";
import { prisma } from "../../config/db";
import { logger } from "../../config/logger";
import { schedulePaymentTimeout } from "../../jobs/paymentTimeoutJob";
import { generateOrderNumber } from "../../utils/orderNumber";
import { createOrder, getRazorpayKeyId } from "../payments/razorpay";
import { reserveStockTx } from "../orders/orders.service";
import { getCartPayload, resolveCartContext } from "../cart/cart.service";
import {
  computeVariantShippingTotal,
  currencyForZone,
  zoneFromCountry
} from "../shipping/shippingRates.service";
import type { ZoneKey } from "../shipping/types";
import type { CreateOrderBody } from "./schemas";

function unitMinor(variant: ProductVariant, zone: ZoneKey): number {
  switch (zone) {
    case "IN":
      return variant.saleInPaise;
    case "GB":
      return variant.saleGbpPence ?? variant.saleInPaise;
    case "US":
    case "OTHER":
      return variant.saleUsdCents ?? variant.saleInPaise;
    default:
      return variant.saleInPaise;
  }
}

const IDEM_TTL_SEC = 30 * 60;

export type CreateCheckoutResult = {
  orderId: string;
  orderNumber: string;
  amountInPaise: number;
  currency: string;
  razorpayKeyId: string;
  rzpOrderId: string;
  paymentId: string;
};

function labelFromVariant(
  rows: Array<{ attributeValue: { value: string; attribute: { name: string } } }>
): string {
  if (!rows.length) return "";
  return rows.map((r) => `${r.attributeValue.attribute.name}: ${r.attributeValue.value}`).join(" · ");
}

async function getIdempotentCheckout(idemKey: string): Promise<CreateCheckoutResult | null> {
  const redis = getRedisConnection();
  if (!redis) return null;
  const v = await redis.get(`checkout:idem:${idemKey}`);
  if (!v) return null;
  try {
    return JSON.parse(v) as CreateCheckoutResult;
  } catch {
    return null;
  }
}

async function setIdempotentCheckout(idemKey: string, payload: CreateCheckoutResult): Promise<void> {
  const redis = getRedisConnection();
  if (!redis) return;
  await redis.set(`checkout:idem:${idemKey}`, JSON.stringify(payload), "EX", IDEM_TTL_SEC);
}

export async function createCheckoutOrder(req: Request, body: CreateOrderBody): Promise<CreateCheckoutResult> {
  const idemHeader =
    typeof req.headers["idempotency-key"] === "string" ? req.headers["idempotency-key"].trim() : "";

  if (idemHeader) {
    const cached = await getIdempotentCheckout(idemHeader);
    if (cached) {
      logger.info("checkout_idempotent_hit", { idempotencyKey: idemHeader, orderId: cached.orderId });
      return cached;
    }
  }

  const { cartId, userId } = await resolveCartContext(req, "read");
  if (!cartId) {
    const e = new Error("Cart is empty") as Error & { statusCode: number; code: string };
    e.statusCode = 400;
    e.code = "EMPTY_CART";
    throw e;
  }

  const cartData = await getCartPayload(cartId);
  if (!cartData.items.length) {
    const e = new Error("Cart is empty") as Error & { statusCode: number; code: string };
    e.statusCode = 400;
    e.code = "EMPTY_CART";
    throw e;
  }

  const zone = zoneFromCountry(body.country ?? "IN");
  if (body.codDelivery && zone !== "IN") {
    const e = new Error("COD delivery surcharge applies to India only") as Error & {
      statusCode: number;
      code: string;
    };
    e.statusCode = 400;
    e.code = "COD_NOT_ALLOWED";
    throw e;
  }

  const lines = await prisma.cartItem.findMany({
    where: { cartId },
    include: {
      variant: {
        include: {
          productRel: true,
          inventory: true,
          attributeValues: {
            include: { attributeValue: { include: { attribute: true } } }
          }
        }
      }
    }
  });

  for (const row of lines) {
    const inv = row.variant.inventory;
    const available = inv ? inv.onHand - inv.reserved : 1_000_000;
    if (row.quantity > available) {
      const e = new Error(
        `Insufficient stock for ${row.variant.productRel.name}`
      ) as Error & { statusCode: number; code: string };
      e.statusCode = 400;
      e.code = "INSUFFICIENT_STOCK";
      throw e;
    }
  }

  let subtotalMinor = 0;
  for (const row of lines) {
    const u = unitMinor(row.variant, zone);
    subtotalMinor += u * row.quantity;
  }

  const shippingLines = lines.map((row) => ({
    variantId: row.variantId,
    quantity: row.quantity
  }));
  const shippingInPaise = await computeVariantShippingTotal(prisma, shippingLines, body.country ?? "IN", {
    cod: Boolean(body.codDelivery) && zone === "IN"
  });

  const discountInPaise = 0;
  const taxInPaise = 0;
  const grandTotalInPaise = subtotalMinor - discountInPaise + shippingInPaise + taxInPaise;
  const orderCurrency = currencyForZone(zone);

  if (grandTotalInPaise < 1) {
    const e = new Error("Invalid order total") as Error & { statusCode: number; code: string };
    e.statusCode = 400;
    e.code = "INVALID_TOTAL";
    throw e;
  }

  const orderNumber = await generateOrderNumber();
  const receipt = orderNumber.replace(/[^a-zA-Z0-9]/g, "").slice(0, 40);

  const result = await prisma.$transaction(async (tx) => {
    const order = await tx.order.create({
      data: {
        orderNumber,
        customerId: userId,
        email: body.email.trim().toLowerCase(),
        phone: body.phone.trim(),
        status: "PENDING_PAYMENT",
        paymentStatus: "PENDING",
        subtotalInPaise: subtotalMinor,
        discountInPaise,
        shippingInPaise,
        taxInPaise,
        grandTotalInPaise,
        currency: orderCurrency
      }
    });

    for (const row of lines) {
      const v = row.variant;
      const p = v.productRel;
      const unit = unitMinor(v, zone);
      const lineTotal = unit * row.quantity;
      const nameSnap = labelFromVariant(v.attributeValues)
        ? `${p.name} (${labelFromVariant(v.attributeValues)})`
        : p.name;

      await tx.orderItem.create({
        data: {
          orderId: order.id,
          variantId: v.id,
          skuSnapshot: v.sku,
          nameSnapshot: nameSnap,
          qtyOrdered: row.quantity,
          unitPriceInPaise: unit,
          discountInPaise: 0,
          taxInPaise: 0,
          lineTotalInPaise: lineTotal
        }
      });
    }

    await tx.orderAddress.create({
      data: {
        orderId: order.id,
        type: "SHIPPING",
        fullName: body.shippingFullName.trim(),
        phone: body.phone.trim(),
        line1: body.line1.trim(),
        line2: body.line2?.trim() || null,
        city: body.city.trim(),
        state: body.state.trim(),
        postalCode: body.postalCode.trim(),
        country: (body.country ?? "IN").toUpperCase()
      }
    });

    await tx.orderAddress.create({
      data: {
        orderId: order.id,
        type: "BILLING",
        fullName: body.shippingFullName.trim(),
        phone: body.phone.trim(),
        line1: body.line1.trim(),
        line2: body.line2?.trim() || null,
        city: body.city.trim(),
        state: body.state.trim(),
        postalCode: body.postalCode.trim(),
        country: (body.country ?? "IN").toUpperCase()
      }
    });

    await reserveStockTx(tx, order.id);

    const rzpIdempotencyKey = `${order.id}:${Date.now()}`;
    const rzp = await createOrder({
      amountInMinorUnits: grandTotalInPaise,
      currency: orderCurrency,
      receipt,
      notes: {
        order_id: order.id,
        order_number: orderNumber
      },
      idempotencyKey: rzpIdempotencyKey
    });

    const payment = await tx.payment.create({
      data: {
        orderId: order.id,
        provider: "RAZORPAY",
        providerOrderId: rzp.id,
        amountInPaise: grandTotalInPaise,
        currency: orderCurrency,
        status: "PENDING",
        rawPayload: { created: true, idempotencyKey: rzpIdempotencyKey } as object
      }
    });

    await tx.orderStatusHistory.create({
      data: {
        orderId: order.id,
        fromStatus: null,
        toStatus: "PENDING_PAYMENT",
        reason: "Order created"
      }
    });

    return { order, payment, rzpOrderId: rzp.id };
  });

  await schedulePaymentTimeout(result.order.id);

  logger.info("checkout_order_created", {
    orderId: result.order.id,
    orderNumber: result.order.orderNumber
  });

  const payload: CreateCheckoutResult = {
    orderId: result.order.id,
    orderNumber: result.order.orderNumber,
    amountInPaise: grandTotalInPaise,
    currency: orderCurrency,
    razorpayKeyId: getRazorpayKeyId(),
    rzpOrderId: result.rzpOrderId,
    paymentId: result.payment.id
  };

  if (idemHeader) {
    await setIdempotentCheckout(idemHeader, payload);
  }

  return payload;
}

/** Resume Razorpay checkout for an unpaid order (same order, no duplicate cart clear). */
export async function resumePendingCheckout(orderNumber: string, email: string): Promise<CreateCheckoutResult> {
  const normalizedEmail = email.trim().toLowerCase();
  const order = await prisma.order.findFirst({
    where: { orderNumber, deletedAt: null },
    include: {
      payments: {
        where: { provider: "RAZORPAY" },
        orderBy: { createdAt: "desc" },
        take: 1
      }
    }
  });

  if (!order || order.email !== normalizedEmail) {
    const e = new Error("Order not found") as Error & { statusCode: number; code: string };
    e.statusCode = 404;
    e.code = "NOT_FOUND";
    throw e;
  }

  if (order.status !== "PENDING_PAYMENT") {
    const e = new Error("This order is no longer awaiting payment") as Error & {
      statusCode: number;
      code: string;
    };
    e.statusCode = 400;
    e.code = "ORDER_NOT_PAYABLE";
    throw e;
  }

  const payment = order.payments[0];
  if (!payment?.providerOrderId) {
    const e = new Error("Payment session not found for this order") as Error & {
      statusCode: number;
      code: string;
    };
    e.statusCode = 400;
    e.code = "PAYMENT_NOT_FOUND";
    throw e;
  }

  return {
    orderId: order.id,
    orderNumber: order.orderNumber,
    amountInPaise: order.grandTotalInPaise,
    currency: order.currency,
    razorpayKeyId: getRazorpayKeyId(),
    rzpOrderId: payment.providerOrderId,
    paymentId: payment.id
  };
}
