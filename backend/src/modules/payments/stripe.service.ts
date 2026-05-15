import type { Prisma } from "@prisma/client";

import { prisma } from "../../config/db";
import { notifyOrderEmail } from "../notifications/email";
import { confirmStockTx } from "../orders/orders.service";
import { invoiceNumberForOrder } from "../../utils/invoice";

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

  await prisma.invoice.upsert({
    where: { orderId: payment.orderId },
    create: {
      orderId: payment.orderId,
      invoiceNo: invoiceNumberForOrder(payment.order.orderNumber)
    },
    update: {}
  });

  notifyOrderEmail(payment.orderId, "order_confirmed");
  return { orderNumber: payment.order.orderNumber };
}
