import type { Order, Payment } from "@prisma/client";
import type Stripe from "stripe";

import { prisma } from "../../config/db";
import { logger } from "../../config/logger";
import { getStripeClient, stripeLiveApiCallsAllowed } from "./stripe.client";
import {
  isStripeCheckoutSessionId,
  isStripeSupplementaryMetadata,
  readStripeCheckoutBinding
} from "./stripe.ids";

export type StripeResolvedPayment = Payment & { order: Order };

function asMetadata(
  metadata?: Stripe.Metadata | null | Record<string, string>
): Record<string, string> | undefined {
  if (!metadata) return undefined;
  return metadata as Record<string, string>;
}

/**
 * Deterministic Payment/Order lookup for Stripe Checkout (not email/amount matching).
 * Binding keys, in order:
 * 1. metadata.sarveda_payment_id
 * 2. metadata.checkout_session_id / provided Checkout Session id → Payment.providerOrderId
 * 3. metadata.order_id → STRIPE payment on that order (session id preferred)
 * 4. PaymentIntent id → providerPaymentId (captured) or legacy providerOrderId
 */
export async function resolveStripeCheckoutPayment(input: {
  paymentIntentId?: string | null;
  checkoutSessionId?: string | null;
  metadata?: Stripe.Metadata | null | Record<string, string>;
}): Promise<StripeResolvedPayment | null> {
  const metadata = asMetadata(input.metadata);
  if (isStripeSupplementaryMetadata(metadata)) {
    logger.info("stripe_resolve_skipped_supplementary", {
      paymentIntentId: input.paymentIntentId
    });
    return null;
  }

  const binding = readStripeCheckoutBinding(metadata);
  const checkoutSessionId =
    (isStripeCheckoutSessionId(input.checkoutSessionId) ? input.checkoutSessionId : undefined) ??
    binding.checkoutSessionId;

  if (binding.paymentId) {
    const byId = await prisma.payment.findFirst({
      where: { id: binding.paymentId, provider: "STRIPE" },
      include: { order: true }
    });
    if (byId) return byId;
  }

  if (checkoutSessionId) {
    const bySession = await prisma.payment.findFirst({
      where: { provider: "STRIPE", providerOrderId: checkoutSessionId },
      include: { order: true }
    });
    if (bySession) return bySession;
  }

  if (binding.orderId) {
    const onOrder = await prisma.payment.findMany({
      where: { provider: "STRIPE", orderId: binding.orderId },
      include: { order: true },
      orderBy: { createdAt: "desc" }
    });
    if (checkoutSessionId) {
      const match = onOrder.find((p) => p.providerOrderId === checkoutSessionId);
      if (match) return match;
    }
    if (onOrder[0]) return onOrder[0];
  }

  const paymentIntentId = input.paymentIntentId?.trim();
  if (paymentIntentId) {
    const byPi = await prisma.payment.findFirst({
      where: {
        provider: "STRIPE",
        OR: [{ providerPaymentId: paymentIntentId }, { providerOrderId: paymentIntentId }]
      },
      include: { order: true }
    });
    if (byPi) return byPi;
  }

  if (paymentIntentId && stripeLiveApiCallsAllowed()) {
    const viaStripeSession = await resolveViaStripeSessionList(paymentIntentId);
    if (viaStripeSession) return viaStripeSession;
  }

  logger.warn("stripe_payment_unresolved", {
    paymentIntentId,
    checkoutSessionId,
    metadataKeys: metadata ? Object.keys(metadata) : []
  });
  return null;
}

async function resolveViaStripeSessionList(
  paymentIntentId: string
): Promise<StripeResolvedPayment | null> {
  const stripe = getStripeClient();
  if (!stripe) return null;
  try {
    const listed = await stripe.checkout.sessions.list({
      payment_intent: paymentIntentId,
      limit: 5
    });
    for (const session of listed.data) {
      const bySession = await prisma.payment.findFirst({
        where: { provider: "STRIPE", providerOrderId: session.id },
        include: { order: true }
      });
      if (bySession) return bySession;
      const fromMeta = readStripeCheckoutBinding(session.metadata);
      if (fromMeta.paymentId) {
        const byId = await prisma.payment.findFirst({
          where: { id: fromMeta.paymentId, provider: "STRIPE" },
          include: { order: true }
        });
        if (byId) return byId;
      }
    }
  } catch (err) {
    logger.warn("stripe_resolve_session_list_failed", {
      paymentIntentId,
      err: err instanceof Error ? err.message : String(err)
    });
  }
  return null;
}
