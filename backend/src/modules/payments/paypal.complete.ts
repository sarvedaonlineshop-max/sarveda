import type { Prisma } from "@prisma/client";

import { prisma } from "../../config/db";
import { clearCartForOrder } from "../cart/cart.service";
import { notifyOrderEmail } from "../notifications/email";
import { confirmStockTx } from "../orders/orders.service";
import { invoiceNumberForOrder } from "../../utils/invoice";

export async function completePayPalPaidOrder(
  paymentId: string,
  paypalCaptureId: string
): Promise<{ orderNumber: string } | null> {
  const payment = await prisma.payment.findFirst({
    where: { id: paymentId, provider: "PAYPAL" },
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
        providerPaymentId: paypalCaptureId,
        status: "CAPTURED",
        rawPayload: {
          ...(payment.rawPayload as object),
          paypalCaptureId,
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
        reason: "PayPal payment captured"
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

  await clearCartForOrder(payment.orderId);
  notifyOrderEmail(payment.orderId, "order_confirmed");
  return { orderNumber: payment.order.orderNumber };
}
