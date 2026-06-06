import { prisma } from "../../config/db";
import { logger } from "../../config/logger";

function paypalBase(): string {
  const mode = (process.env.PAYPAL_MODE ?? "sandbox").trim().toLowerCase();
  return mode === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
}

async function paypalAccessToken(): Promise<string> {
  const clientId = process.env.PAYPAL_CLIENT_ID?.trim();
  const secret = process.env.PAYPAL_CLIENT_SECRET?.trim();
  if (!clientId || !secret) {
    throw new Error("PayPal is not configured");
  }
  const auth = Buffer.from(`${clientId}:${secret}`).toString("base64");
  const res = await fetch(`${paypalBase()}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: "grant_type=client_credentials"
  });
  const raw = (await res.json()) as { access_token?: string; error_description?: string };
  if (!res.ok || !raw.access_token) {
    throw new Error(raw.error_description ?? "PayPal auth failed");
  }
  return raw.access_token;
}

function siteUrl(): string {
  const u = (process.env.FRONTEND_URL ?? "http://localhost:3000").split(",")[0]?.trim();
  return (u ?? "http://localhost:3000").replace(/\/$/, "");
}

/** Amount in major units (USD/GBP) from minor units. */
function toMajor(minor: number, currency: string): string {
  const c = currency.toUpperCase();
  const div = c === "JPY" ? 1 : 100;
  return (minor / div).toFixed(2);
}

export async function createPayPalOrder(input: {
  paymentId: string;
  orderId: string;
  orderNumber: string;
  email: string;
  amountMinor: number;
  currency: string;
}): Promise<{ approvalUrl: string; paypalOrderId: string }> {
  const token = await paypalAccessToken();
  const currency = input.currency.toUpperCase();
  const res = await fetch(`${paypalBase()}/v2/checkout/orders`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [
        {
          reference_id: input.orderId,
          custom_id: input.paymentId,
          description: `Sarveda ${input.orderNumber}`,
          amount: {
            currency_code: currency,
            value: toMajor(input.amountMinor, currency)
          }
        }
      ],
      application_context: {
        brand_name: "Sarveda",
        user_action: "PAY_NOW",
        return_url: `${siteUrl()}/checkout/paypal-return?orderNumber=${encodeURIComponent(input.orderNumber)}&email=${encodeURIComponent(input.email)}`,
        cancel_url: `${siteUrl()}/checkout?orderNumber=${encodeURIComponent(input.orderNumber)}&email=${encodeURIComponent(input.email)}`
      }
    })
  });

  const raw = (await res.json()) as {
    id?: string;
    links?: Array<{ rel: string; href: string }>;
    message?: string;
  };

  if (!res.ok || !raw.id) {
    logger.warn("paypal_create_order_failed", { message: raw.message });
    throw new Error(raw.message ?? "Could not create PayPal order");
  }

  const approve = raw.links?.find((l) => l.rel === "approve")?.href;
  if (!approve) throw new Error("PayPal approval URL missing");

  await prisma.payment.update({
    where: { id: input.paymentId },
    data: {
      providerOrderId: raw.id,
      rawPayload: { paypalOrderId: raw.id, createdAt: new Date().toISOString() }
    }
  });

  return { approvalUrl: approve, paypalOrderId: raw.id };
}

export async function capturePayPalOrder(paypalOrderId: string): Promise<{
  captured: boolean;
  paymentId?: string;
}> {
  const token = await paypalAccessToken();
  const res = await fetch(`${paypalBase()}/v2/checkout/orders/${paypalOrderId}/capture`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    }
  });

  const raw = (await res.json()) as {
    status?: string;
    purchase_units?: Array<{ payments?: { captures?: Array<{ id: string }> } }>;
    message?: string;
  };

  if (!res.ok) {
    throw new Error(raw.message ?? "PayPal capture failed");
  }

  if (raw.status !== "COMPLETED") {
    return { captured: false };
  }

  const payment = await prisma.payment.findFirst({
    where: { provider: "PAYPAL", providerOrderId: paypalOrderId },
    include: { order: true }
  });
  if (!payment) return { captured: false };

  const captureId = raw.purchase_units?.[0]?.payments?.captures?.[0]?.id;

  const { completePayPalPaidOrder } = await import("./paypal.complete");
  await completePayPalPaidOrder(payment.id, captureId ?? paypalOrderId);

  return { captured: true, paymentId: payment.id };
}

export async function getPayPalAccessToken(): Promise<string> {
  return paypalAccessToken();
}

export function getPayPalApiBase(): string {
  return paypalBase();
}
