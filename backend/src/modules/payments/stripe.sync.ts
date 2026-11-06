import type Stripe from "stripe";

import { prisma } from "../../config/db";
import { logger } from "../../config/logger";
import { afterOrderPaid } from "../orders/afterPaid";
import { confirmStockTx } from "../orders/orders.service";
import { getStripeClient, stripeLiveApiCallsAllowed } from "./stripe.client";
import { isStripeCheckoutSessionId } from "./stripe.ids";
import { completeStripePaidOrder } from "./stripe.service";

const TIMEOUT_CANCEL_MARK = "Payment not completed within 15 minutes";

export type StripeSyncResult = {
  updated: boolean;
  alreadyPaid?: boolean;
  stripeUnreachable?: boolean;
  reason: string;
  paymentIntentId?: string;
  orderStatus?: string;
  paymentStatus?: string;
};

type VerifiedStripeCapture = {
  paymentId: string;
  paymentIntentId: string;
  sessionId: string;
};

function currencyMatches(orderCurrency: string, stripeCurrency: string | null | undefined): boolean {
  return (stripeCurrency ?? "").toLowerCase() === orderCurrency.toLowerCase();
}

function chargeIsSettled(charge: Stripe.Charge | null | undefined): boolean {
  if (!charge) return true;
  return Boolean(charge.paid && charge.captured && !charge.refunded && (charge.amount_refunded ?? 0) === 0);
}

async function wasAbandonedByPaymentTimeout(orderId: string): Promise<boolean> {
  const history = await prisma.orderStatusHistory.findFirst({
    where: { orderId, toStatus: "CANCELLED" },
    orderBy: { createdAt: "desc" },
    select: { reason: true }
  });
  return Boolean(history?.reason?.includes(TIMEOUT_CANCEL_MARK));
}

async function findVerifiedPaidCheckout(
  orderId: string
): Promise<VerifiedStripeCapture | { unreachable: true } | { noClient: true } | null> {
  const order = await prisma.order.findFirst({
    where: { id: orderId, deletedAt: null },
    include: { payments: { where: { provider: "STRIPE" }, orderBy: { createdAt: "desc" } } }
  });
  if (!order) return null;

  const sessions = order.payments.filter((row) => isStripeCheckoutSessionId(row.providerOrderId));
  if (sessions.length === 0) return null;

  if (!stripeLiveApiCallsAllowed()) return { noClient: true };
  const stripe = getStripeClient();
  if (!stripe) return { noClient: true };

  for (const payment of sessions) {
    const sessionId = payment.providerOrderId!;
    let session: Stripe.Checkout.Session;
    try {
      session = await stripe.checkout.sessions.retrieve(sessionId, {
        expand: ["payment_intent.latest_charge"]
      });
    } catch (err) {
      logger.error("stripe_sync_session_retrieve_failed", {
        orderId,
        sessionId,
        err: err instanceof Error ? err.message : String(err)
      });
      return { unreachable: true };
    }

    if (session.status !== "complete" || session.payment_status !== "paid") continue;

    const intent = session.payment_intent;
    if (!intent || typeof intent === "string") continue;
    if (intent.status !== "succeeded") continue;
    if (intent.amount_received !== payment.amountInPaise) {
      logger.error("stripe_sync_amount_mismatch", {
        orderId,
        sessionId,
        expected: payment.amountInPaise,
        received: intent.amount_received
      });
      continue;
    }
    if (!currencyMatches(order.currency, intent.currency)) continue;

    const metaOrderId = session.metadata?.order_id?.trim();
    const metaOrderNumber = session.metadata?.order_number?.trim();
    if (metaOrderId && metaOrderId !== order.id) continue;
    if (metaOrderNumber && metaOrderNumber !== order.orderNumber) continue;

    const charge = intent.latest_charge;
    const chargeObj = charge && typeof charge !== "string" ? charge : null;
    if (!chargeIsSettled(chargeObj)) continue;

    return { paymentId: payment.id, paymentIntentId: intent.id, sessionId };
  }

  return null;
}

/** Mark a timeout-abandoned order paid after Stripe has already captured the money. */
export async function restoreAbandonedStripePayment(
  orderId: string,
  capture: VerifiedStripeCapture
): Promise<StripeSyncResult> {
  const abandoned = await wasAbandonedByPaymentTimeout(orderId);
  if (!abandoned) {
    return {
      updated: false,
      reason: "Stripe captured a payment, but this order was not abandoned by the checkout timer."
    };
  }

  const applied = await prisma.$transaction(async (tx) => {
    const order = await tx.order.findFirst({
      where: { id: orderId, deletedAt: null },
      include: { payments: true }
    });
    if (!order) return null;
    if (order.status === "PAID" || order.payments.some((row) => row.status === "CAPTURED")) {
      return "already" as const;
    }
    if (order.status !== "CANCELLED") return null;
    const payment = order.payments.find((row) => row.id === capture.paymentId);
    if (!payment) return null;
    const prev =
      payment.rawPayload && typeof payment.rawPayload === "object" && !Array.isArray(payment.rawPayload)
        ? payment.rawPayload
        : {};

    const claimed = await tx.order.updateMany({
      where: { id: orderId, status: "CANCELLED" },
      data: { status: "PAID", paymentStatus: "CAPTURED", placedAt: order.placedAt ?? new Date() }
    });
    if (claimed.count === 0) return null;

    await tx.payment.update({
      where: { id: capture.paymentId },
      data: {
        status: "CAPTURED",
        providerPaymentId: capture.paymentIntentId,
        rawPayload: {
          ...prev,
          stripePaymentIntentId: capture.paymentIntentId,
          restoredAfterTimeoutAt: new Date().toISOString()
        }
      }
    });
    await confirmStockTx(tx, orderId);
    await tx.orderStatusHistory.create({
      data: {
        orderId,
        fromStatus: "CANCELLED",
        toStatus: "PAID",
        reason: "Stripe payment captured after the checkout timer had abandoned the order"
      }
    });
    return "applied" as const;
  });

  if (applied === "already") {
    return { updated: false, alreadyPaid: true, reason: "Already paid", paymentIntentId: capture.paymentIntentId };
  }
  if (applied !== "applied") {
    return { updated: false, reason: "Could not restore this order from Stripe." };
  }

  await afterOrderPaid(orderId);
  const fresh = await prisma.order.findFirst({
    where: { id: orderId },
    select: { status: true, paymentStatus: true }
  });
  logger.info("stripe_timeout_abandoned_order_restored", {
    orderId,
    paymentIntentId: capture.paymentIntentId
  });
  return {
    updated: true,
    reason: "Marked paid from the captured Stripe payment.",
    paymentIntentId: capture.paymentIntentId,
    orderStatus: fresh?.status,
    paymentStatus: fresh?.paymentStatus
  };
}

/**
 * Ask Stripe whether this order's Checkout Session is paid.
 * Pending orders are marked paid. Orders abandoned only by the 15-minute timer are restored.
 * A customer or replacement checkout is left alone.
 */
export async function syncStripeCapturedPayment(orderId: string): Promise<StripeSyncResult> {
  const order = await prisma.order.findFirst({
    where: { id: orderId, deletedAt: null },
    select: { id: true, status: true, paymentStatus: true }
  });
  if (!order) return { updated: false, reason: "Order not found" };
  if (order.status === "PAID" || order.paymentStatus === "CAPTURED") {
    return { updated: false, alreadyPaid: true, reason: "Already paid", orderStatus: order.status, paymentStatus: order.paymentStatus };
  }

  const found = await findVerifiedPaidCheckout(orderId);
  if (found && "unreachable" in found) {
    return { updated: false, stripeUnreachable: true, reason: "Could not reach Stripe" };
  }
  if (found && "noClient" in found) {
    return { updated: false, reason: "Stripe is not configured" };
  }
  if (!found) {
    return { updated: false, reason: "No captured Stripe payment for this order yet." };
  }

  if (order.status === "PENDING_PAYMENT") {
    const done = await completeStripePaidOrder(found.paymentId, found.paymentIntentId);
    if (done?.applied || done?.reason === "ALREADY_PAID") {
      const fresh = await prisma.order.findFirst({
        where: { id: orderId },
        select: { status: true, paymentStatus: true }
      });
      return {
        updated: Boolean(done.applied),
        alreadyPaid: done.reason === "ALREADY_PAID",
        reason: done.applied ? "Marked paid from the captured Stripe payment." : "Already paid",
        paymentIntentId: found.paymentIntentId,
        orderStatus: fresh?.status,
        paymentStatus: fresh?.paymentStatus
      };
    }
    return { updated: false, reason: done?.reason ?? "Stripe payment could not be applied" };
  }

  if (order.status === "CANCELLED") {
    return restoreAbandonedStripePayment(orderId, found);
  }

  return { updated: false, reason: "This order is no longer waiting for payment." };
}
