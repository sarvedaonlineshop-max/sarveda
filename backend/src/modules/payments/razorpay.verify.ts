import crypto from "crypto";

import type { Prisma } from "@prisma/client";

import { prisma } from "../../config/db";
import { logger } from "../../config/logger";

function getKeySecret(): string {
  const s = process.env.RAZORPAY_KEY_SECRET;
  if (!s) {
    throw Object.assign(new Error("Razorpay is not configured"), {
      statusCode: 503,
      code: "RAZORPAY_NOT_CONFIGURED"
    });
  }
  return s;
}

/**
 * Standard checkout signature: HMAC_SHA256(order_id + "|" + payment_id, key_secret)
 */
export function verifyPaymentSignature(
  orderId: string,
  paymentId: string,
  signature: string
): boolean {
  const body = `${orderId}|${paymentId}`;
  const expected = crypto.createHmac("sha256", getKeySecret()).update(body).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

export async function completePaidOrder(
  razorpayOrderId: string,
  razorpayPaymentId: string
): Promise<{ orderNumber: string }> {
  const payment = await prisma.payment.findFirst({
    where: { provider: "RAZORPAY", providerOrderId: razorpayOrderId },
    include: {
      order: {
        include: {
          items: { include: { variant: { include: { inventory: true } } } }
        }
      }
    }
  });

  if (!payment) {
    const e = new Error("Payment record not found") as Error & { statusCode: number; code: string };
    e.statusCode = 404;
    e.code = "NOT_FOUND";
    throw e;
  }

  if (payment.order.status === "PAID" && payment.status === "CAPTURED") {
    return { orderNumber: payment.order.orderNumber };
  }

  await prisma.$transaction(async (tx) => {
    await tx.payment.update({
      where: { id: payment.id },
      data: {
        providerPaymentId: razorpayPaymentId,
        status: "CAPTURED",
        rawPayload: {
          ...(payment.rawPayload as object),
          verifiedAt: new Date().toISOString(),
          razorpayPaymentId
        } as Prisma.InputJsonValue
      }
    });

    await tx.order.update({
      where: { id: payment.orderId },
      data: {
        status: "PAID",
        paymentStatus: "CAPTURED",
        placedAt: new Date()
      }
    });

    for (const item of payment.order.items) {
      const inv = item.variant.inventory;
      if (inv) {
        await tx.inventory.update({
          where: { id: inv.id },
          data: {
            onHand: { decrement: item.qtyOrdered }
          }
        });
      }
    }

    await tx.orderStatusHistory.create({
      data: {
        orderId: payment.orderId,
        fromStatus: "PENDING_PAYMENT",
        toStatus: "PAID",
        reason: "Razorpay payment verified"
      }
    });
  });

  logger.info("order_paid", { orderNumber: payment.order.orderNumber, razorpayPaymentId });
  return { orderNumber: payment.order.orderNumber };
}
