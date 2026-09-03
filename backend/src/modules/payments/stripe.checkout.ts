import type Stripe from "stripe";

import { prisma } from "../../config/db";
import { logger } from "../../config/logger";
import { requireStripeClient } from "./stripe.client";
import { buildSarvedaCheckoutMetadata } from "./stripe.ids";

function siteUrl(): string {
  const u = (process.env.FRONTEND_URL ?? "http://localhost:3000").split(",")[0]?.trim();
  return (u ?? "http://localhost:3000").replace(/\/$/, "");
}

export type StripeCheckoutAddress = {
  email: string;
  fullName: string;
  phone?: string;
  line1: string;
  line2?: string | null;
  city: string;
  state: string;
  postalCode: string;
  country: string;
};

export type CreateStripeCheckoutSessionInput = {
  paymentId: string;
  orderId: string;
  orderNumber: string;
  email: string;
  amountMinor: number;
  currency: string;
  shippingAddress: StripeCheckoutAddress;
};

export function buildStripeCheckoutSessionCreateParams(
  input: CreateStripeCheckoutSessionInput,
  opts: { customerId: string; metadata: ReturnType<typeof buildSarvedaCheckoutMetadata> }
): Stripe.Checkout.SessionCreateParams {
  const currency = input.currency.toLowerCase();
  const email = input.email.trim().toLowerCase();
  return {
    mode: "payment",
    customer: opts.customerId,
    billing_address_collection: "auto",
    success_url: `${siteUrl()}/order/confirmed?orderNumber=${encodeURIComponent(input.orderNumber)}&email=${encodeURIComponent(email)}&stripe=1`,
    cancel_url: `${siteUrl()}/payment-failed?${new URLSearchParams({
      orderNumber: input.orderNumber,
      email,
      outcome: "dismiss"
    }).toString()}`,
    client_reference_id: input.orderId,
    metadata: opts.metadata,
    payment_intent_data: {
      description: `Sarveda order ${input.orderNumber}`,
      metadata: opts.metadata
    },
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency,
          unit_amount: input.amountMinor,
          product_data: {
            name: `Sarveda order ${input.orderNumber}`
          }
        }
      }
    ]
  };
}

export async function createStripeCheckoutSession(
  input: CreateStripeCheckoutSessionInput
): Promise<{ url: string; sessionId: string }> {
  const stripe = requireStripeClient();
  const email = input.email.trim().toLowerCase();
  const addr = input.shippingAddress;
  const country = addr.country.toUpperCase().slice(0, 2);

  const customer = await stripe.customers.create({
    email,
    name: addr.fullName,
    address: {
      line1: addr.line1,
      line2: addr.line2 ?? undefined,
      city: addr.city,
      state: addr.state,
      postal_code: addr.postalCode,
      country
    },
    phone: addr.phone ?? undefined
  });

  const metadata = buildSarvedaCheckoutMetadata({
    paymentId: input.paymentId,
    orderId: input.orderId,
    orderNumber: input.orderNumber
  });

  const session = await stripe.checkout.sessions.create(
    buildStripeCheckoutSessionCreateParams(input, { customerId: customer.id, metadata })
  );

  if (!session.url || !session.id) {
    logger.warn("stripe_checkout_create_failed", { sessionId: session.id });
    throw new Error("Could not start Stripe checkout");
  }

  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id;

  if (paymentIntentId) {
    try {
      await stripe.paymentIntents.update(paymentIntentId, {
        metadata: buildSarvedaCheckoutMetadata({
          paymentId: input.paymentId,
          orderId: input.orderId,
          orderNumber: input.orderNumber,
          checkoutSessionId: session.id
        })
      });
    } catch (err) {
      logger.warn("stripe_pi_metadata_update_failed", {
        sessionId: session.id,
        paymentIntentId,
        err: err instanceof Error ? err.message : String(err)
      });
    }
  }

  await prisma.payment.update({
    where: { id: input.paymentId },
    data: {
      providerOrderId: session.id,
      rawPayload: {
        stripeSessionId: session.id,
        stripeCustomerId: customer.id,
        ...(paymentIntentId ? { stripePaymentIntentId: paymentIntentId } : {}),
        createdAt: new Date().toISOString()
      }
    }
  });

  return { url: session.url, sessionId: session.id };
}
