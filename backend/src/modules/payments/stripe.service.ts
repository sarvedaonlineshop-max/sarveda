import type { Prisma } from "@prisma/client";
import type Stripe from "stripe";

import { prisma } from "../../config/db";
import { logger } from "../../config/logger";
import { notifyOrderEmail } from "../notifications/email";
import { cancelUnpaidOrderWithRelease, confirmStockTx } from "../orders/orders.service";
import { afterOrderPaid } from "../orders/afterPaid";
import { getStripeClient, stripeLiveApiCallsAllowed } from "./stripe.client";
import { isStripeSupplementaryMetadata } from "./stripe.ids";
import { resolveStripeCheckoutPayment } from "./stripe.resolve";

export type CompleteStripePaidResult = {
  orderNumber: string;
  applied: boolean;
  failClosed?: boolean;
  reason?: string;
};

function jsonPayload(prev: unknown, extra: Record<string, unknown>): Prisma.InputJsonValue {
  const base = prev && typeof prev === "object" && !Array.isArray(prev) ? (prev as object) : {};
  return { ...base, ...extra } as Prisma.InputJsonValue;
}

async function refundStripePaymentIntentForLateSuccess(opts: {
  paymentIntentId: string;
  orderId: string;
  orderNumber: string;
}): Promise<{ refundId?: string; error?: string }> {
  if (!stripeLiveApiCallsAllowed()) {
    return { error: "test_skipped_live_refund" };
  }
  const stripe = getStripeClient();
  if (!stripe) return { error: "no_stripe_key" };
  try {
    const refund = await stripe.refunds.create({
      payment_intent: opts.paymentIntentId,
      reason: "requested_by_customer",
      metadata: {
        sarveda_reason: "late_success_cancelled_order",
        order_id: opts.orderId,
        order_number: opts.orderNumber
      }
    });
    logger.info("stripe_late_success_refund_created", {
      orderId: opts.orderId,
      paymentIntentId: opts.paymentIntentId,
      refundId: refund.id
    });
    return { refundId: refund.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("stripe_late_success_refund_failed", {
      orderId: opts.orderId,
      paymentIntentId: opts.paymentIntentId,
      err: message
    });
    return { error: message };
  }
}

async function handleStripeLateSuccessForUnpayableOrder(opts: {
  paymentId: string;
  orderId: string;
  orderNumber: string;
  orderStatus: string;
  paymentIntentId: string;
  rawPayload: unknown;
}): Promise<CompleteStripePaidResult> {
  logger.error("stripe_late_success_cancelled_order", {
    paymentId: opts.paymentId,
    orderId: opts.orderId,
    orderNumber: opts.orderNumber,
    orderStatus: opts.orderStatus,
    paymentIntentId: opts.paymentIntentId
  });

  const refund = await refundStripePaymentIntentForLateSuccess({
    paymentIntentId: opts.paymentIntentId,
    orderId: opts.orderId,
    orderNumber: opts.orderNumber
  });

  await prisma.payment.update({
    where: { id: opts.paymentId },
    data: {
      providerPaymentId: opts.paymentIntentId,
      rawPayload: jsonPayload(opts.rawPayload, {
        stripePaymentIntentId: opts.paymentIntentId,
        lateSuccessAt: new Date().toISOString(),
        lateSuccessReconciliation: "REQUIRED",
        lateSuccessOrderStatus: opts.orderStatus,
        lateSuccessRefundId: refund.refundId ?? null,
        lateSuccessRefundError: refund.error ?? null
      })
    }
  });

  await prisma.orderStatusHistory.create({
    data: {
      orderId: opts.orderId,
      fromStatus: opts.orderStatus,
      toStatus: opts.orderStatus,
      reason:
        "STRIPE_LATE_SUCCESS_RECONCILIATION: Stripe reported payment after this order was no longer payable. Order was not marked PAID. Automatic refund attempted."
    }
  });

  return {
    orderNumber: opts.orderNumber,
    applied: false,
    failClosed: true,
    reason: "ORDER_NOT_PAYABLE"
  };
}

/** Mark order paid after Stripe checkout.session.completed / payment_intent.succeeded. */
export async function completeStripePaidOrder(
  paymentId: string,
  stripePaymentIntentId: string
): Promise<CompleteStripePaidResult | null> {
  const payment = await prisma.payment.findFirst({
    where: { id: paymentId, provider: "STRIPE" },
    include: { order: true }
  });
  if (!payment) return null;

  if (payment.status === "CAPTURED" && payment.order.status === "PAID") {
    return { orderNumber: payment.order.orderNumber, applied: false, reason: "ALREADY_PAID" };
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
    return { orderNumber: payment.order.orderNumber, applied: false, reason: "ALREADY_PAID" };
  }

  const payable = payment.order.status === "PENDING_PAYMENT";
  if (!payable) {
    return handleStripeLateSuccessForUnpayableOrder({
      paymentId: payment.id,
      orderId: payment.orderId,
      orderNumber: payment.order.orderNumber,
      orderStatus: payment.order.status,
      paymentIntentId: stripePaymentIntentId,
      rawPayload: payment.rawPayload
    });
  }

  let applied = false;
  await prisma.$transaction(async (tx) => {
    const fresh = await tx.payment.findFirst({ where: { id: payment.id }, include: { order: true } });
    if (!fresh || fresh.status === "CAPTURED") return;
    if (fresh.order.status !== "PENDING_PAYMENT") return;

    await tx.payment.update({
      where: { id: payment.id },
      data: {
        providerPaymentId: stripePaymentIntentId,
        status: "CAPTURED",
        rawPayload: jsonPayload(payment.rawPayload, {
          stripePaymentIntentId,
          capturedAt: new Date().toISOString()
        })
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
    applied = true;
  });

  if (!applied) {
    const latest = await prisma.payment.findFirst({
      where: { id: payment.id },
      include: { order: true }
    });
    if (latest?.status === "CAPTURED" && latest.order.status === "PAID") {
      return { orderNumber: latest.order.orderNumber, applied: false, reason: "ALREADY_PAID" };
    }
    if (latest && latest.order.status !== "PENDING_PAYMENT") {
      return handleStripeLateSuccessForUnpayableOrder({
        paymentId: latest.id,
        orderId: latest.orderId,
        orderNumber: latest.order.orderNumber,
        orderStatus: latest.order.status,
        paymentIntentId: stripePaymentIntentId,
        rawPayload: latest.rawPayload
      });
    }
    return { orderNumber: payment.order.orderNumber, applied: false, reason: "NOT_APPLIED" };
  }

  await afterOrderPaid(payment.orderId);
  return { orderNumber: payment.order.orderNumber, applied: true };
}

export async function handleStripePaymentFailed(opts: {
  paymentIntentId?: string | null;
  checkoutSessionId?: string | null;
  metadata?: Stripe.Metadata | null | Record<string, string>;
  lastPaymentError?: { type?: string | null; code?: string | null; message?: string | null } | null;
}): Promise<{ cancelled: boolean; paymentId?: string; orderId?: string }> {
  const payRow = await resolveStripeCheckoutPayment({
    paymentIntentId: opts.paymentIntentId,
    checkoutSessionId: opts.checkoutSessionId,
    metadata: opts.metadata
  });
  if (!payRow) {
    logger.warn("stripe_payment_failed_unresolved", {
      paymentIntentId: opts.paymentIntentId,
      checkoutSessionId: opts.checkoutSessionId
    });
    return { cancelled: false };
  }

  const cancelled = await cancelUnpaidOrderWithRelease(payRow.orderId, "Stripe payment failed", {
    source: "stripe_payment_intent_payment_failed",
    stripePaymentIntentId: opts.paymentIntentId ?? null,
    stripeLastPaymentError: opts.lastPaymentError ?? null
  });
  if (cancelled) notifyOrderEmail(payRow.orderId, "payment_failed");
  return { cancelled, paymentId: payRow.id, orderId: payRow.orderId };
}

export async function handleStripeCheckoutSuccess(opts: {
  paymentIntentId?: string | null;
  checkoutSessionId?: string | null;
  metadata?: Stripe.Metadata | null | Record<string, string>;
  paymentStatus?: string | null;
}): Promise<CompleteStripePaidResult | null> {
  const metadata = opts.metadata;
  if (isStripeSupplementaryMetadata(metadata)) {
    logger.info("stripe_success_skipped_supplementary", {
      checkoutSessionId: opts.checkoutSessionId,
      paymentIntentId: opts.paymentIntentId
    });
    return null;
  }

  if (opts.paymentStatus && opts.paymentStatus !== "paid" && opts.paymentStatus !== "no_payment_required") {
    logger.warn("stripe_success_event_not_paid", {
      checkoutSessionId: opts.checkoutSessionId,
      paymentIntentId: opts.paymentIntentId,
      paymentStatus: opts.paymentStatus
    });
    return null;
  }

  const payRow = await resolveStripeCheckoutPayment({
    paymentIntentId: opts.paymentIntentId,
    checkoutSessionId: opts.checkoutSessionId,
    metadata
  });
  if (!payRow || !opts.paymentIntentId) {
    logger.warn("stripe_success_unresolved", {
      paymentIntentId: opts.paymentIntentId,
      checkoutSessionId: opts.checkoutSessionId
    });
    return null;
  }

  return completeStripePaidOrder(payRow.id, opts.paymentIntentId);
}
