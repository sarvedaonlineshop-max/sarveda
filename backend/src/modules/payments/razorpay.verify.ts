import type { Prisma } from "@prisma/client";

import { prisma } from "../../config/db";
import { logger } from "../../config/logger";
import { afterOrderPaid } from "../orders/afterPaid";

import { verifyPayment } from "./razorpay";
import {
  applyCapturedPaymentIfOrderPending
} from "./payment-capture.service";
import { expireOutstandingStripeSessionsForOrder } from "./stripe.session";

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

  const claim = await applyCapturedPaymentIfOrderPending({
    paymentId: payment.id,
    providerPaymentId: razorpayPaymentId,
    payloadExtra: {
      verifiedAt: new Date().toISOString(),
      razorpayPaymentId
    },
    historyReason: "Razorpay payment verified"
  });

  if (!claim) {
    const e = new Error("Payment record not found") as Error & { statusCode: number; code: string };
    e.statusCode = 404;
    e.code = "NOT_FOUND";
    throw e;
  }

  if (claim.outcome === "APPLIED") {
    await expireOutstandingStripeSessionsForOrder(claim.orderId);
    logger.info("order_paid", { orderNumber: claim.orderNumber, razorpayPaymentId });
    await afterOrderPaid(claim.orderId);
    return { orderNumber: claim.orderNumber };
  }

  if (claim.outcome === "ALREADY_PAID") {
    return { orderNumber: claim.orderNumber };
  }

  logger.error("razorpay_late_success_unpayable_order", {
    paymentId: payment.id,
    orderId: claim.orderId,
    orderNumber: claim.orderNumber,
    orderStatus: claim.orderStatus,
    razorpayPaymentId
  });

  const prev = (payment.rawPayload as Record<string, unknown> | null) ?? {};
  await prisma.payment.update({
    where: { id: payment.id },
    data: {
      providerPaymentId: razorpayPaymentId,
      rawPayload: {
        ...prev,
        razorpayPaymentId,
        lateSuccessAt: new Date().toISOString(),
        lateSuccessReconciliation: "REQUIRED",
        lateSuccessOrderStatus: claim.orderStatus
      } as Prisma.InputJsonValue
    }
  });
  await prisma.orderStatusHistory.create({
    data: {
      orderId: claim.orderId,
      fromStatus: claim.orderStatus,
      toStatus: claim.orderStatus,
      reason:
        "RAZORPAY_LATE_SUCCESS_RECONCILIATION: Razorpay reported payment after this order was no longer payable. Order was not marked PAID again."
    }
  });

  return { orderNumber: claim.orderNumber };
}
