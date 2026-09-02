import type { Payment, Prisma } from "@prisma/client";

import { prisma } from "../../config/db";
import { logger } from "../../config/logger";
import { handlePaidOrderStatusChange } from "../orders/orders.service";

/** Sum of Refund amounts that reserve refundable capacity. failed does NOT count. */
export function refundableCapStatuses(): string[] {
  return ["pending", "processed", "created"];
}

function processedRefundStatuses(): string[] {
  return ["processed"];
}

async function lockPaymentRow(tx: Prisma.TransactionClient, paymentId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM "Payment" WHERE id = ${paymentId}::uuid FOR UPDATE`;
}

async function loadPaymentWithOrder(
  tx: Prisma.TransactionClient,
  paymentId: string
): Promise<(Payment & { order: { id: string; grandTotalInPaise: number } }) | null> {
  return tx.payment.findUnique({
    where: { id: paymentId },
    include: { order: { select: { id: true, grandTotalInPaise: true } } }
  });
}

export function capturedAmountInPaise(
  payment: Pick<Payment, "amountInPaise"> & { order: { grandTotalInPaise: number } }
): number {
  return payment.amountInPaise > 0 ? payment.amountInPaise : payment.order.grandTotalInPaise;
}

async function sumRefundAmounts(
  tx: Prisma.TransactionClient,
  paymentId: string,
  statuses: string[]
): Promise<number> {
  const agg = await tx.refund.aggregate({
    where: { paymentId, status: { in: statuses } },
    _sum: { amountInPaise: true }
  });
  return agg._sum.amountInPaise ?? 0;
}

export async function getRefundableRemainingInPaise(
  paymentId: string,
  tx: Prisma.TransactionClient = prisma
): Promise<{ payment: Payment & { order: { id: string; grandTotalInPaise: number } }; remaining: number; capturedInPaise: number }> {
  const payment = await loadPaymentWithOrder(tx, paymentId);
  if (!payment) {
    throw Object.assign(new Error("Payment not found"), { statusCode: 404, code: "NOT_FOUND" });
  }
  const capturedInPaise = capturedAmountInPaise(payment);
  const reserved = await sumRefundAmounts(tx, paymentId, refundableCapStatuses());
  const remaining = Math.max(0, capturedInPaise - reserved);
  return { payment, remaining, capturedInPaise };
}

export async function reserveGatewayRefund(opts: {
  paymentId: string;
  amountInPaise: number;
  reason: string;
}): Promise<{
  refundRow: { id: string; paymentId: string; amountInPaise: number };
  payment: Payment & { order: { id: string; grandTotalInPaise: number } };
  remainingAfter: number;
  orderId: string;
}> {
  if (opts.amountInPaise <= 0) {
    throw Object.assign(new Error("Refund amount must be positive"), {
      statusCode: 400,
      code: "INVALID_AMOUNT"
    });
  }

  return prisma.$transaction(async (tx) => {
    await lockPaymentRow(tx, opts.paymentId);
    const payment = await loadPaymentWithOrder(tx, opts.paymentId);
    if (!payment) {
      throw Object.assign(new Error("Payment not found"), { statusCode: 404, code: "NOT_FOUND" });
    }

    if (payment.status !== "CAPTURED" && payment.status !== "PARTIALLY_REFUNDED") {
      throw Object.assign(new Error("Payment is not in a refundable state"), {
        statusCode: 400,
        code: "NO_PAYMENT"
      });
    }

    const capturedInPaise = capturedAmountInPaise(payment);
    const reserved = await sumRefundAmounts(tx, opts.paymentId, refundableCapStatuses());
    const remaining = capturedInPaise - reserved;

    if (remaining <= 0) {
      throw Object.assign(new Error("Payment is already fully refunded"), {
        statusCode: 409,
        code: "ALREADY_REFUNDED"
      });
    }
    if (opts.amountInPaise > remaining) {
      throw Object.assign(new Error(`Refund cannot exceed ${remaining / 100} remaining`), {
        statusCode: 409,
        code: "AMOUNT_TOO_HIGH"
      });
    }

    const refundRow = await tx.refund.create({
      data: {
        paymentId: opts.paymentId,
        amountInPaise: opts.amountInPaise,
        reason: opts.reason,
        providerRefundId: null,
        status: "pending"
      },
      select: { id: true, paymentId: true, amountInPaise: true }
    });

    return {
      refundRow,
      payment,
      remainingAfter: remaining - opts.amountInPaise,
      orderId: payment.orderId
    };
  });
}

type RecomputeResult = {
  processedTotal: number;
  capturedInPaise: number;
  fullyRefunded: boolean;
  orderId: string;
  paymentId: string;
};

async function recomputePaymentRefundState(
  tx: Prisma.TransactionClient,
  paymentId: string
): Promise<RecomputeResult> {
  const payment = await loadPaymentWithOrder(tx, paymentId);
  if (!payment) {
    throw Object.assign(new Error("Payment not found"), { statusCode: 404, code: "NOT_FOUND" });
  }

  const capturedInPaise = capturedAmountInPaise(payment);
  const processedTotal = await sumRefundAmounts(tx, paymentId, processedRefundStatuses());
  const fullyRefunded = processedTotal >= capturedInPaise;
  const partiallyRefunded = processedTotal > 0 && !fullyRefunded;

  let paymentStatus = payment.status;
  if (fullyRefunded) {
    paymentStatus = "REFUNDED";
  } else if (partiallyRefunded) {
    paymentStatus = "PARTIALLY_REFUNDED";
  }

  await tx.payment.update({
    where: { id: paymentId },
    data: {
      refundedInPaise: processedTotal,
      status: paymentStatus
    }
  });

  if (partiallyRefunded) {
    await tx.order.update({
      where: { id: payment.orderId },
      data: { paymentStatus: "PARTIALLY_REFUNDED" }
    });
  } else if (fullyRefunded) {
    await tx.order.update({
      where: { id: payment.orderId },
      data: { paymentStatus: "REFUNDED" }
    });
  }

  return {
    processedTotal,
    capturedInPaise,
    fullyRefunded,
    orderId: payment.orderId,
    paymentId
  };
}

export async function finalizeGatewayRefund(opts: {
  refundId: string;
  providerRefundId: string;
  orderId: string;
  reason?: string;
}): Promise<{ fullyRefunded: boolean; duplicate: boolean }> {
  const existingByProvider = await prisma.refund.findFirst({
    where: {
      providerRefundId: opts.providerRefundId,
      NOT: { id: opts.refundId }
    }
  });

  if (existingByProvider) {
    // Another Refund row already owns this providerRefundId. Never restock/status-change
    // opts.orderId from a different payment's refund state (cross-order pollution).
    await failReservedRefund(opts.refundId, "Duplicate provider refund id");
    throw Object.assign(new Error("Duplicate provider refund id"), {
      statusCode: 409,
      code: "DUPLICATE_REFUND"
    });
  }

  const result = await prisma.$transaction(async (tx) => {
    const row = await tx.refund.findUnique({ where: { id: opts.refundId } });
    if (!row) {
      throw Object.assign(new Error("Refund row not found"), { statusCode: 404, code: "NOT_FOUND" });
    }
    await lockPaymentRow(tx, row.paymentId);

    const dup = await tx.refund.findFirst({
      where: {
        providerRefundId: opts.providerRefundId,
        NOT: { id: opts.refundId }
      }
    });
    if (dup) {
      await tx.refund.update({
        where: { id: opts.refundId },
        data: { status: "failed", reason: `${row.reason ?? ""} [duplicate provider id]`.trim() }
      });
      return { ...await recomputePaymentRefundState(tx, row.paymentId), duplicate: true };
    }

    await tx.refund.update({
      where: { id: opts.refundId },
      data: {
        providerRefundId: opts.providerRefundId,
        status: "processed"
      }
    });

    const state = await recomputePaymentRefundState(tx, row.paymentId);
    return { ...state, duplicate: false };
  });

  if (result.fullyRefunded) {
    await handlePaidOrderStatusChange(
      opts.orderId,
      "REFUNDED",
      opts.reason ?? "Gateway refund completed"
    );
  }

  return { fullyRefunded: result.fullyRefunded, duplicate: result.duplicate };
}

export async function failReservedRefund(refundId: string, errorMessage?: string): Promise<void> {
  const row = await prisma.refund.findUnique({ where: { id: refundId } });
  if (!row || row.status !== "pending") return;

  await prisma.refund.update({
    where: { id: refundId },
    data: {
      status: "failed",
      reason: errorMessage ? `${row.reason ?? ""} [${errorMessage}]`.trim() : row.reason
    }
  });
}

export type ApplyExternalRefundInput = {
  provider: "RAZORPAY" | "STRIPE" | "PAYPAL";
  providerRefundId: string;
  providerPaymentId?: string | null;
  paymentDbId?: string | null;
  amountInPaise: number;
  reason: string;
  /** processed | created | failed | pending */
  refundStatus?: string;
  rawEvent?: string;
};

function mapExternalRefundStatus(status?: string): string {
  const s = (status ?? "processed").toLowerCase();
  if (s === "processed" || s === "succeeded") return "processed";
  if (s === "failed") return "failed";
  if (s === "pending") return "pending";
  return "created";
}

export async function applyExternalProviderRefund(
  input: ApplyExternalRefundInput
): Promise<{ duplicate: boolean; paymentId: string; orderId: string; fullyRefunded: boolean; newlyRecorded: boolean }> {
  const mappedStatus = mapExternalRefundStatus(input.refundStatus);

  if (input.amountInPaise <= 0 && mappedStatus !== "failed") {
    logger.warn("apply_external_refund_zero_amount", { providerRefundId: input.providerRefundId });
    return { duplicate: false, paymentId: "", orderId: "", fullyRefunded: false, newlyRecorded: false };
  }

  const existing = await prisma.refund.findFirst({
    where: { providerRefundId: input.providerRefundId }
  });

  if (existing) {
    const result = await prisma.$transaction(async (tx) => {
      await lockPaymentRow(tx, existing.paymentId);

      if (mappedStatus === "processed" && existing.status !== "processed") {
        await tx.refund.update({
          where: { id: existing.id },
          data: { status: "processed" }
        });
      } else if (mappedStatus === "failed" && existing.status === "pending") {
        await tx.refund.update({
          where: { id: existing.id },
          data: { status: "failed" }
        });
      }

      return recomputePaymentRefundState(tx, existing.paymentId);
    });

    if (result.fullyRefunded) {
      await handlePaidOrderStatusChange(
        result.orderId,
        "REFUNDED",
        input.reason || `${input.provider} refund webhook`
      );
    }

    return {
      duplicate: true,
      paymentId: existing.paymentId,
      orderId: result.orderId,
      fullyRefunded: result.fullyRefunded,
      newlyRecorded: false
    };
  }

  let payment: (Payment & { order: { id: string; grandTotalInPaise: number } }) | null = null;

  if (input.paymentDbId) {
    payment = await loadPaymentWithOrder(prisma, input.paymentDbId);
    if (payment && payment.provider !== input.provider) {
      payment = null;
    }
  }

  if (!payment && input.providerPaymentId) {
    payment = await prisma.payment.findFirst({
      where: {
        provider: input.provider,
        providerPaymentId: input.providerPaymentId
      },
      include: { order: { select: { id: true, grandTotalInPaise: true } } }
    });
  }

  if (!payment) {
    logger.warn("apply_external_refund_payment_not_found", {
      provider: input.provider,
      providerPaymentId: input.providerPaymentId,
      paymentDbId: input.paymentDbId,
      providerRefundId: input.providerRefundId,
      rawEvent: input.rawEvent
    });
    return { duplicate: false, paymentId: "", orderId: "", fullyRefunded: false, newlyRecorded: false };
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      await lockPaymentRow(tx, payment!.id);

      const dup = await tx.refund.findFirst({
        where: { providerRefundId: input.providerRefundId }
      });
      if (dup) {
        return { ...await recomputePaymentRefundState(tx, payment!.id), duplicate: true, newlyRecorded: false };
      }

      // Webhook may arrive before admin finalize — attach to reserved pending row.
      const pendingMatch = await tx.refund.findFirst({
        where: {
          paymentId: payment!.id,
          status: "pending",
          providerRefundId: null,
          amountInPaise: input.amountInPaise
        },
        orderBy: { createdAt: "asc" }
      });

      let newlyRecorded = false;

      if (pendingMatch) {
        await tx.refund.update({
          where: { id: pendingMatch.id },
          data: {
            providerRefundId: input.providerRefundId,
            status: mappedStatus === "failed" ? "failed" : mappedStatus
          }
        });
      } else {
        await tx.refund.create({
          data: {
            paymentId: payment!.id,
            amountInPaise: input.amountInPaise,
            providerRefundId: input.providerRefundId,
            status: mappedStatus,
            reason: input.reason
          }
        });
        newlyRecorded = true;
      }

      const state = await recomputePaymentRefundState(tx, payment!.id);
      return { ...state, duplicate: false, newlyRecorded };
    });

    if (result.fullyRefunded) {
      await handlePaidOrderStatusChange(
        result.orderId,
        "REFUNDED",
        input.reason || `${input.provider} refund webhook`
      );
    }

    return {
      duplicate: result.duplicate,
      paymentId: result.paymentId,
      orderId: result.orderId,
      fullyRefunded: result.fullyRefunded,
      newlyRecorded: result.newlyRecorded
    };
  } catch (err) {
    const prismaErr = err as { code?: string };
    if (prismaErr.code === "P2002") {
      throw Object.assign(new Error("Duplicate provider refund"), {
        statusCode: 409,
        code: "DUPLICATE_REFUND"
      });
    }
    throw err;
  }
}
