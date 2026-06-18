import Stripe from "stripe";

import { prisma } from "../../config/db";
import { logger } from "../../config/logger";

function stripeClient(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) throw new Error("STRIPE_SECRET_KEY is not configured");
  return new Stripe(key, { apiVersion: "2024-06-20" });
}

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

export async function createStripeCheckoutSession(input: {
  paymentId: string;
  orderId: string;
  orderNumber: string;
  email: string;
  amountMinor: number;
  currency: string;
  shippingAddress: StripeCheckoutAddress;
}): Promise<{ url: string; sessionId: string }> {
  const stripe = stripeClient();
  const currency = input.currency.toLowerCase();
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

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer: customer.id,
    billing_address_collection: "auto",
    success_url: `${siteUrl()}/order/confirmed?orderNumber=${encodeURIComponent(input.orderNumber)}&email=${encodeURIComponent(email)}&stripe=1`,
    cancel_url: `${siteUrl()}/checkout?orderNumber=${encodeURIComponent(input.orderNumber)}&email=${encodeURIComponent(email)}`,
    client_reference_id: input.orderId,
    metadata: {
      sarveda_payment_id: input.paymentId,
      order_id: input.orderId,
      order_number: input.orderNumber
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
  });

  if (!session.url || !session.id) {
    logger.warn("stripe_checkout_create_failed", { sessionId: session.id });
    throw new Error("Could not start Stripe checkout");
  }

  await prisma.payment.update({
    where: { id: input.paymentId },
    data: {
      providerOrderId: session.id,
      rawPayload: {
        stripeSessionId: session.id,
        stripeCustomerId: customer.id,
        createdAt: new Date().toISOString()
      }
    }
  });

  return { url: session.url, sessionId: session.id };
}
