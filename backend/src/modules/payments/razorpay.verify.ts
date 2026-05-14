import type { Prisma } from "@prisma/client";

import { prisma } from "../../config/db";
import { logger } from "../../config/logger";
import { confirmStockTx } from "../orders/orders.service";
import { invoiceNumberForOrder } from "../../utils/invoice";

import { verifyPayment } from "./razorpay";

export { verifyPayment };

/** @deprecated Prefer `verifyPayment` (throws with userMessage). Kept for tests. */
export function verifyPaymentSignature(
  orderId: string,
  paymentId: string,
  signature: string
): boolean {
  try {
    verifyPayment(orderId, paymentId, signature);
    return true;
  } catch {
    return false;
  }
}

export async function completePaidOrder(
  razorpayOrderId: string,
  razorpayPaymentId: string
): Promise<{ orderNumber: string }> {
  const already = await prisma.payment.findFirst({
    where: {
      provider: "RAZORPAY",
      providerPaymentId: razorpayPaymentId,
      status: "CAPTURED"
    },
    include: { order: true }
  });
  if (already) {
    return { orderNumber: already.order.orderNumber };
  }

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

  if (
    payment.providerPaymentId === razorpayPaymentId &&
    payment.status === "CAPTURED" &&
    payment.order.status === "PAID"
  ) {
    return { orderNumber: payment.order.orderNumber };
  }

  if (payment.order.status === "PAID" && payment.status === "CAPTURED") {
    return { orderNumber: payment.order.orderNumber };
  }

  await prisma.$transaction(async (tx) => {
    const fresh = await tx.payment.findFirst({
      where: { id: payment.id },
      include: { order: true }
    });
    if (!fresh) return;
    if (fresh.status === "CAPTURED" && fresh.order.status === "PAID") return;

    const fromStatusForHistory = fresh.order.status;

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

    await confirmStockTx(tx, payment.orderId);

    await tx.orderStatusHistory.create({
      data: {
        orderId: payment.orderId,
        fromStatus: fromStatusForHistory,
        toStatus: "PAID",
        reason: "Razorpay payment verified"
      }
    });
  });

  if (payment.order.customerId) {
    const cart = await prisma.cart.findUnique({ where: { userId: payment.order.customerId } });
    if (cart) {
      await prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
    }
  }

  await prisma.invoice.upsert({
    where: { orderId: payment.orderId },
    create: {
      orderId: payment.orderId,
      invoiceNo: invoiceNumberForOrder(payment.order.orderNumber)
    },
    update: {}
  });

  logger.info("order_paid", { orderNumber: payment.order.orderNumber, razorpayPaymentId });
  return { orderNumber: payment.order.orderNumber };
}
