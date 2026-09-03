import type { Prisma } from "@prisma/client";
import type Stripe from "stripe";

import { prisma } from "../../config/db";
import { logger } from "../../config/logger";
import { afterOrderPaid } from "../orders/afterPaid";
import { getStripeClient, stripeLiveApiCallsAllowed } from "./stripe.client";
import { isStripeSupplementaryMetadata } from "./stripe.ids";
import { resolveStripeCheckoutPayment } from "./stripe.resolve";
import { expireOutstandingStripeSessionsForOrder } from "./stripe.session";
import {
  applyCapturedPaymentIfOrderPending,
  recordGatewayPaymentAttemptFailed
} from "./payment-capture.service";

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

  const claim = await applyCapturedPaymentIfOrderPending({
    paymentId: payment.id,
    providerPaymentId: stripePaymentIntentId,
    payloadExtra: {
      stripePaymentIntentId,
      capturedAt: new Date().toISOString()
    },
    historyReason: "Stripe payment captured"
  });
  if (!claim) return null;

  if (claim.outcome === "APPLIED") {
    await expireOutstandingStripeSessionsForOrder(payment.orderId);
    await afterOrderPaid(payment.orderId);
    return { orderNumber: claim.orderNumber, applied: true };
  }

  if (claim.outcome === "ALREADY_PAID") {
    return { orderNumber: claim.orderNumber, applied: false, reason: "ALREADY_PAID" };
  }

  return handleStripeLateSuccessForUnpayableOrder({
    paymentId: payment.id,
    orderId: payment.orderId,
    orderNumber: payment.order.orderNumber,
    orderStatus: claim.orderStatus,
    paymentIntentId: stripePaymentIntentId,
    rawPayload: payment.rawPayload
  });
}

export async function handleStripePaymentFailed(opts: {
  paymentIntentId?: string | null;
  checkoutSessionId?: string | null;
  metadata?: Stripe.Metadata | null | Record<string, string>;
  lastPaymentError?: { type?: string | null; code?: string | null; message?: string | null } | null;
}): Promise<{ cancelled: boolean; recorded: boolean; paymentId?: string; orderId?: string; orderStatus?: string }> {
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
    return { cancelled: false, recorded: false };
  }

  const recorded = await recordGatewayPaymentAttemptFailed({
    paymentId: payRow.id,
    extras: {
      source: "stripe_payment_intent_payment_failed",
      stripePaymentIntentId: opts.paymentIntentId ?? null,
      stripeLastPaymentError: opts.lastPaymentError ?? null
    }
  });

  logger.info("stripe_payment_attempt_failed_order_still_pending", {
    paymentId: payRow.id,
    orderId: payRow.orderId,
    orderStatus: recorded.orderStatus
  });

  return {
    cancelled: false,
    recorded: true,
    paymentId: payRow.id,
    orderId: payRow.orderId,
    orderStatus: recorded.orderStatus
  };
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
