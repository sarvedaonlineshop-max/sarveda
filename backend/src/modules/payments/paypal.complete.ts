import type { Prisma } from "@prisma/client";

import { prisma } from "../../config/db";
import { logger } from "../../config/logger";
import { afterOrderPaid } from "../orders/afterPaid";
import { applyCapturedPaymentIfOrderPending } from "./payment-capture.service";
import { expireOutstandingStripeSessionsForOrder } from "./stripe.session";

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

  const dup = await prisma.payment.findFirst({
    where: {
      provider: "PAYPAL",
      providerPaymentId: paypalCaptureId,
      status: "CAPTURED",
      id: { not: payment.id }
    }
  });
  if (dup) {
    return { orderNumber: payment.order.orderNumber };
  }

  const claim = await applyCapturedPaymentIfOrderPending({
    paymentId: payment.id,
    providerPaymentId: paypalCaptureId,
    payloadExtra: {
      paypalCaptureId,
      capturedAt: new Date().toISOString()
    },
    historyReason: "PayPal payment captured"
  });
  if (!claim) return null;

  if (claim.outcome === "APPLIED") {
    await expireOutstandingStripeSessionsForOrder(claim.orderId);
    await afterOrderPaid(claim.orderId);
    return { orderNumber: claim.orderNumber };
  }

  if (claim.outcome === "ALREADY_PAID") {
    return { orderNumber: claim.orderNumber };
  }

  logger.error("paypal_late_success_unpayable_order", {
    paymentId: payment.id,
    orderId: claim.orderId,
    orderStatus: claim.orderStatus,
    paypalCaptureId
  });
  const prev = (payment.rawPayload as Record<string, unknown> | null) ?? {};
  await prisma.payment.update({
    where: { id: payment.id },
    data: {
      providerPaymentId: paypalCaptureId,
      rawPayload: {
        ...prev,
        paypalCaptureId,
        lateSuccessAt: new Date().toISOString(),
        lateSuccessReconciliation: "REQUIRED",
        lateSuccessOrderStatus: claim.orderStatus
      } as Prisma.InputJsonValue
    }
  });
  return { orderNumber: claim.orderNumber };
}
