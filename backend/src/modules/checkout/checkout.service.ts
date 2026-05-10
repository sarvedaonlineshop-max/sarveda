import type { Request } from "express";

import { prisma } from "../../config/db";
import { logger } from "../../config/logger";
import { generateOrderNumber } from "../../utils/orderNumber";
import { createRazorpayOrder, getRazorpayKeyId } from "../payments/razorpay.client";
import { getCartPayload, resolveCartContext } from "../cart/cart.service";
import type { CreateOrderBody } from "./schemas";

function labelFromVariant(
  rows: Array<{ attributeValue: { value: string; attribute: { name: string } } }>
): string {
  if (!rows.length) return "";
  return rows.map((r) => `${r.attributeValue.attribute.name}: ${r.attributeValue.value}`).join(" · ");
}

export async function createCheckoutOrder(req: Request, body: CreateOrderBody) {
  const { cartId, userId } = await resolveCartContext(req, "read");
  if (!cartId) {
    const e = new Error("Cart is empty") as Error & { statusCode: number; code: string };
    e.statusCode = 400;
    e.code = "EMPTY_CART";
    throw e;
  }

  const cartData = await getCartPayload(cartId);
  if (!cartData.items.length || cartData.subtotalInPaise <= 0) {
    const e = new Error("Cart is empty") as Error & { statusCode: number; code: string };
    e.statusCode = 400;
    e.code = "EMPTY_CART";
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

  const shippingInPaise = 0;
  const discountInPaise = 0;
  const taxInPaise = 0;
  const grandTotalInPaise = cartData.subtotalInPaise - discountInPaise + shippingInPaise + taxInPaise;

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
        subtotalInPaise: cartData.subtotalInPaise,
        discountInPaise,
        shippingInPaise,
        taxInPaise,
        grandTotalInPaise,
        currency: "INR"
      }
    });

    for (const row of lines) {
      const v = row.variant;
      const p = v.productRel;
      const unit = v.saleInPaise;
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

    const rzp = await createRazorpayOrder({
      amountInPaise: grandTotalInPaise,
      receipt,
      notes: {
        order_id: order.id,
        order_number: orderNumber
      }
    });

    const payment = await tx.payment.create({
      data: {
        orderId: order.id,
        provider: "RAZORPAY",
        providerOrderId: rzp.id,
        amountInPaise: grandTotalInPaise,
        currency: "INR",
        status: "PENDING",
        rawPayload: { created: true } as object
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

  await prisma.cartItem.deleteMany({ where: { cartId } }).catch((err) => {
    logger.warn("cart_clear_after_order_failed", { err });
  });

  logger.info("checkout_order_created", {
    orderId: result.order.id,
    orderNumber: result.order.orderNumber
  });

  return {
    orderId: result.order.id,
    orderNumber: result.order.orderNumber,
    amountInPaise: grandTotalInPaise,
    currency: "INR",
    razorpayKeyId: getRazorpayKeyId(),
    rzpOrderId: result.rzpOrderId,
    paymentId: result.payment.id
  };
}
