import { prisma } from "../../config/db";
import { logger } from "../../config/logger";

function stripeSecret(): string {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) throw new Error("STRIPE_SECRET_KEY is not configured");
  return key;
}

function siteUrl(): string {
  const u = (process.env.FRONTEND_URL ?? "http://localhost:3000").split(",")[0]?.trim();
  return (u ?? "http://localhost:3000").replace(/\/$/, "");
}

export async function createStripeCheckoutSession(input: {
  paymentId: string;
  orderId: string;
  orderNumber: string;
  email: string;
  amountMinor: number;
  currency: string;
}): Promise<{ url: string; sessionId: string }> {
  const currency = input.currency.toLowerCase();
  const params = new URLSearchParams();
  params.set("mode", "payment");
  params.set("customer_email", input.email);
  params.set("success_url", `${siteUrl()}/order/confirmed?orderNumber=${encodeURIComponent(input.orderNumber)}&email=${encodeURIComponent(input.email)}&stripe=1`);
  params.set("cancel_url", `${siteUrl()}/checkout?orderNumber=${encodeURIComponent(input.orderNumber)}&email=${encodeURIComponent(input.email)}`);
  params.set("client_reference_id", input.orderId);
  params.set("metadata[sarveda_payment_id]", input.paymentId);
  params.set("metadata[order_id]", input.orderId);
  params.set("metadata[order_number]", input.orderNumber);
  params.set("line_items[0][quantity]", "1");
  params.set("line_items[0][price_data][currency]", currency);
  params.set("line_items[0][price_data][unit_amount]", String(input.amountMinor));
  params.set(
    "line_items[0][price_data][product_data][name]",
    `Sarveda order ${input.orderNumber}`
  );

  const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${stripeSecret()}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: params.toString()
  });

  const raw = (await res.json()) as { id?: string; url?: string; error?: { message?: string } };
  if (!res.ok || !raw.url || !raw.id) {
    logger.warn("stripe_checkout_create_failed", { status: res.status, error: raw.error?.message });
    throw new Error(raw.error?.message ?? "Could not start Stripe checkout");
  }

  await prisma.payment.update({
    where: { id: input.paymentId },
    data: {
      providerOrderId: raw.id,
      rawPayload: { stripeSessionId: raw.id, createdAt: new Date().toISOString() }
    }
  });

  return { url: raw.url, sessionId: raw.id };
}
