import type { Prisma } from "@prisma/client";

import { prisma } from "../../config/db";
import { logger } from "../../config/logger";
import { confirmStockTx } from "../orders/orders.service";

export type CaptureClaimOutcome = "APPLIED" | "ALREADY_PAID" | "ORDER_NOT_PAYABLE";

export type CaptureClaimResult = {
  outcome: CaptureClaimOutcome;
  orderId: string;
  orderNumber: string;
  orderStatus: string;
  paymentId: string;
};

function jsonPayload(prev: unknown, extra: Record<string, unknown>): Prisma.InputJsonValue {
  const base = prev && typeof prev === "object" && !Array.isArray(prev) ? (prev as object) : {};
  return { ...base, ...extra } as Prisma.InputJsonValue;
}

/**
 * First successful gateway capture wins. Concurrent Stripe/Razorpay/PayPal
 * completions cannot both transition the order or double-confirm stock.
 */
export async function applyCapturedPaymentIfOrderPending(opts: {
  paymentId: string;
  providerPaymentId: string;
  payloadExtra: Record<string, unknown>;
  historyReason: string;
}): Promise<CaptureClaimResult | null> {
  return prisma.$transaction(async (tx) => {
    const payment = await tx.payment.findFirst({
      where: { id: opts.paymentId },
      include: { order: true }
    });
    if (!payment) return null;

    if (payment.status === "CAPTURED" && payment.order.status === "PAID") {
      return {
        outcome: "ALREADY_PAID" as const,
        orderId: payment.orderId,
        orderNumber: payment.order.orderNumber,
        orderStatus: payment.order.status,
        paymentId: payment.id
      };
    }

    if (payment.order.status !== "PENDING_PAYMENT") {
      return {
        outcome: "ORDER_NOT_PAYABLE" as const,
        orderId: payment.orderId,
        orderNumber: payment.order.orderNumber,
        orderStatus: payment.order.status,
        paymentId: payment.id
      };
    }

    const claimed = await tx.order.updateMany({
      where: { id: payment.orderId, status: "PENDING_PAYMENT" },
      data: { status: "PAID", paymentStatus: "CAPTURED", placedAt: new Date() }
    });

    if (claimed.count === 0) {
      const latestPay = await tx.payment.findFirst({ where: { id: payment.id } });
      const latest = await tx.order.findFirst({ where: { id: payment.orderId } });
      if (latestPay?.status === "CAPTURED" && latest?.status === "PAID") {
        return {
          outcome: "ALREADY_PAID" as const,
          orderId: payment.orderId,
          orderNumber: payment.order.orderNumber,
          orderStatus: latest.status,
          paymentId: payment.id
        };
      }
      return {
        outcome: "ORDER_NOT_PAYABLE" as const,
        orderId: payment.orderId,
        orderNumber: payment.order.orderNumber,
        orderStatus: latest?.status ?? payment.order.status,
        paymentId: payment.id
      };
    }

    await tx.payment.update({
      where: { id: payment.id },
      data: {
        providerPaymentId: opts.providerPaymentId,
        status: "CAPTURED",
        rawPayload: jsonPayload(payment.rawPayload, opts.payloadExtra)
      }
    });

    await confirmStockTx(tx, payment.orderId);

    await tx.orderStatusHistory.create({
      data: {
        orderId: payment.orderId,
        fromStatus: "PENDING_PAYMENT",
        toStatus: "PAID",
        reason: opts.historyReason
      }
    });

    return {
      outcome: "APPLIED" as const,
      orderId: payment.orderId,
      orderNumber: payment.order.orderNumber,
      orderStatus: "PAID",
      paymentId: payment.id
    };
  });
}

export async function recordGatewayPaymentAttemptFailed(opts: {
  paymentId: string;
  extras: Record<string, unknown>;
}): Promise<{ paymentId: string; orderId: string; orderStatus: string }> {
  const payment = await prisma.payment.findFirst({
    where: { id: opts.paymentId },
    include: { order: true }
  });
  if (!payment) {
    throw Object.assign(new Error("Payment not found"), { statusCode: 404, code: "NOT_FOUND" });
  }

  if (payment.status === "CAPTURED") {
    logger.info("payment_attempt_failed_ignored_already_captured", {
      paymentId: payment.id,
      orderId: payment.orderId
    });
    return { paymentId: payment.id, orderId: payment.orderId, orderStatus: payment.order.status };
  }

  const prev = (payment.rawPayload as Record<string, unknown> | null) ?? {};
  const priorAttempts = Array.isArray(prev.attemptFailures) ? prev.attemptFailures : [];
  await prisma.payment.update({
    where: { id: payment.id },
    data: {
      status: "FAILED",
      rawPayload: {
        ...prev,
        ...opts.extras,
        lastAttemptFailedAt: new Date().toISOString(),
        attemptFailures: [...priorAttempts, { at: new Date().toISOString(), ...opts.extras }]
      } as Prisma.InputJsonValue
    }
  });

  logger.info("payment_attempt_failed_recorded", {
    paymentId: payment.id,
    orderId: payment.orderId,
    orderStatus: payment.order.status,
    extras: opts.extras
  });

  return { paymentId: payment.id, orderId: payment.orderId, orderStatus: payment.order.status };
}
