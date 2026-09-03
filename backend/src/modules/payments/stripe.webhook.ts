import type { Request, Response } from "express";
import type Stripe from "stripe";

import { logger } from "../../config/logger";
import { notifyOrderEmail } from "../notifications/email";
import { applyExternalProviderRefund } from "./refund-sync.service";
import { getStripeClient } from "./stripe.client";
import { handleStripeCheckoutSuccess, handleStripePaymentFailed } from "./stripe.service";

function stripeWebhookSecret(): string | undefined {
  return process.env.STRIPE_WEBHOOK_SECRET?.trim() || undefined;
}

function paymentIntentIdFrom(
  value: string | Stripe.PaymentIntent | null | undefined
): string | undefined {
  if (!value) return undefined;
  return typeof value === "string" ? value : value.id;
}

export async function processStripeEvent(event: Stripe.Event): Promise<void> {
  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    await handleStripeCheckoutSuccess({
      paymentIntentId: paymentIntentIdFrom(session.payment_intent),
      checkoutSessionId: session.id,
      metadata: session.metadata,
      paymentStatus: session.payment_status
    });
    return;
  }

  if (event.type === "payment_intent.succeeded") {
    const pi = event.data.object as Stripe.PaymentIntent;
    await handleStripeCheckoutSuccess({
      paymentIntentId: pi.id,
      checkoutSessionId: pi.metadata?.checkout_session_id,
      metadata: pi.metadata,
      paymentStatus: "paid"
    });
    return;
  }

  if (event.type === "payment_intent.payment_failed") {
    const pi = event.data.object as Stripe.PaymentIntent;
    const err = pi.last_payment_error;
    await handleStripePaymentFailed({
      paymentIntentId: pi.id,
      checkoutSessionId: pi.metadata?.checkout_session_id,
      metadata: pi.metadata,
      lastPaymentError: err
        ? { type: err.type, code: err.code ?? null, message: err.message }
        : null
    });
    return;
  }

  if (event.type === "charge.refunded" || event.type.startsWith("refund.")) {
    await processStripeRefundEvent(event);
  }
}

async function processStripeRefundEvent(event: Stripe.Event): Promise<void> {
  let stripeRefund: Stripe.Refund | null = null;
  let paymentIntentId: string | undefined;

  if (event.type === "charge.refunded") {
    const charge = event.data.object as Stripe.Charge;
    paymentIntentId = paymentIntentIdFrom(charge.payment_intent);
    const refunds = charge.refunds?.data ?? [];
    for (const r of refunds) {
      const refundStatus =
        r.status === "succeeded"
          ? "processed"
          : r.status === "failed"
            ? "failed"
            : r.status === "pending"
              ? "pending"
              : "created";
      if (!paymentIntentId) continue;
      const result = await applyExternalProviderRefund({
        provider: "STRIPE",
        providerRefundId: r.id,
        providerPaymentId: paymentIntentId,
        amountInPaise: r.amount,
        reason: `Stripe webhook ${event.type}`,
        refundStatus,
        rawEvent: event.type
      });
      if (result.newlyRecorded && refundStatus === "processed" && result.orderId) {
        notifyOrderEmail(result.orderId, "refund_initiated");
      }
    }
    return;
  }

  stripeRefund = event.data.object as Stripe.Refund;
  paymentIntentId = paymentIntentIdFrom(stripeRefund.payment_intent);
  if (!stripeRefund || !paymentIntentId) return;

  const refundStatus =
    stripeRefund.status === "succeeded"
      ? "processed"
      : stripeRefund.status === "failed"
        ? "failed"
        : stripeRefund.status === "pending"
          ? "pending"
          : "created";

  const result = await applyExternalProviderRefund({
    provider: "STRIPE",
    providerRefundId: stripeRefund.id,
    providerPaymentId: paymentIntentId,
    amountInPaise: stripeRefund.amount,
    reason: `Stripe webhook ${event.type}`,
    refundStatus,
    rawEvent: event.type
  });

  if (result.newlyRecorded && refundStatus === "processed" && result.orderId) {
    notifyOrderEmail(result.orderId, "refund_initiated");
  }
}

export async function stripeWebhookHandler(req: Request, res: Response): Promise<void> {
  const secret = stripeWebhookSecret();
  const client = getStripeClient();
  if (!client || !secret) {
    res.status(503).json({ success: false, error: "Stripe webhook not configured" });
    return;
  }

  const sig = req.headers["stripe-signature"] as string | undefined;
  const raw = req.body as Buffer;
  if (!sig) {
    res.status(400).json({ success: false, error: "Missing signature" });
    return;
  }

  let event: Stripe.Event;
  try {
    event = client.webhooks.constructEvent(raw, sig, secret);
  } catch (err) {
    logger.warn("stripe_webhook_bad_signature", { err });
    res.status(400).json({ success: false, error: "Invalid signature" });
    return;
  }

  try {
    await processStripeEvent(event);
  } catch (err) {
    logger.error("stripe_webhook_handler_error", { err, type: event.type });
  }

  res.status(200).json({ received: true });
}
