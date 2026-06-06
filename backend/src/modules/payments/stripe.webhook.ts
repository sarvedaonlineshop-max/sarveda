import type { Request, Response } from "express";
import Stripe from "stripe";

import { prisma } from "../../config/db";
import { logger } from "../../config/logger";
import { notifyOrderEmail } from "../notifications/email";
import { cancelUnpaidOrderWithRelease } from "../orders/orders.service";

import { completeStripePaidOrder } from "./stripe.service";

function stripeClient(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) return null;
  return new Stripe(key, { apiVersion: "2024-06-20" });
}

export async function stripeWebhookHandler(req: Request, res: Response): Promise<void> {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  const client = stripeClient();
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
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const paymentIntentId =
        typeof session.payment_intent === "string"
          ? session.payment_intent
          : session.payment_intent?.id;
      const stripeOrderId = session.metadata?.sarveda_payment_id;
      if (stripeOrderId && paymentIntentId) {
        await completeStripePaidOrder(stripeOrderId, paymentIntentId);
      }
    } else if (event.type === "payment_intent.payment_failed") {
      const pi = event.data.object as Stripe.PaymentIntent;
      // BUG 1: checkout stores Stripe Session id in providerOrderId, not payment_intent id
      const checkoutSessionId =
        typeof pi.metadata?.checkoutSessionId === "string"
          ? pi.metadata.checkoutSessionId.trim()
          : undefined;
      const payRow = await prisma.payment.findFirst({
        where: {
          provider: "STRIPE",
          OR: [
            { providerOrderId: pi.id },
            ...(checkoutSessionId ? [{ providerOrderId: checkoutSessionId }] : []),
            { providerPaymentId: pi.id }
          ]
        }
      });
      if (payRow) {
        const cancelled = await cancelUnpaidOrderWithRelease(payRow.orderId, "Stripe payment failed");
        if (cancelled) notifyOrderEmail(payRow.orderId, "payment_failed");
      }
    }
  } catch (err) {
    logger.error("stripe_webhook_handler_error", { err, type: event.type });
  }

  res.status(200).json({ received: true });
}
