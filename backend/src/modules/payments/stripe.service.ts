import type { Prisma } from "@prisma/client";

import { prisma } from "../../config/db";
import { logger } from "../../config/logger";
import { confirmStockTx } from "../orders/orders.service";
import { afterOrderPaid } from "../orders/afterPaid";
import { createZohoInvoiceForOrder } from "../zoho";

/** Mark order paid after Stripe checkout.session.completed (payment row id in session metadata). */
export async function completeStripePaidOrder(
  paymentId: string,
  stripePaymentIntentId: string
): Promise<{ orderNumber: string } | null> {
  const payment = await prisma.payment.findFirst({
    where: { id: paymentId, provider: "STRIPE" },
    include: { order: true }
  });
  if (!payment) return null;

  if (payment.status === "CAPTURED" && payment.order.status === "PAID") {
    return { orderNumber: payment.order.orderNumber };
  }

  const dup = await prisma.payment.findFirst({
    where: {
      provider: "STRIPE",
      providerPaymentId: stripePaymentIntentId,
      status: "CAPTURED",
      id: { not: payment.id }
    }
  });
  if (dup) {
    return { orderNumber: payment.order.orderNumber };
  }

  await prisma.$transaction(async (tx) => {
    const fresh = await tx.payment.findFirst({ where: { id: payment.id }, include: { order: true } });
    if (!fresh || fresh.status === "CAPTURED") return;

    await tx.payment.update({
      where: { id: payment.id },
      data: {
        providerPaymentId: stripePaymentIntentId,
        status: "CAPTURED",
        rawPayload: {
          ...(payment.rawPayload as object),
          stripePaymentIntentId,
          capturedAt: new Date().toISOString()
        } as Prisma.InputJsonValue
      }
    });

    await tx.order.update({
      where: { id: payment.orderId },
      data: { status: "PAID", paymentStatus: "CAPTURED", placedAt: new Date() }
    });

    await confirmStockTx(tx, payment.orderId);

    await tx.orderStatusHistory.create({
      data: {
        orderId: payment.orderId,
        fromStatus: fresh.order.status,
        toStatus: "PAID",
        reason: "Stripe payment captured"
      }
    });
  });

  await afterOrderPaid(payment.orderId);
  createZohoInvoiceForOrder(payment.orderId).catch((err) =>
    logger.error("Zoho invoice failed after Stripe", { orderId: payment.orderId, err })
  );
  return { orderNumber: payment.order.orderNumber };
}
