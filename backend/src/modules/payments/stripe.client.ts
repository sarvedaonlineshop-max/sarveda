import Stripe from "stripe";

const STRIPE_API_VERSION = "2024-06-20" as const;

export function getStripeClient(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) return null;
  return new Stripe(key, { apiVersion: STRIPE_API_VERSION });
}

export function requireStripeClient(): Stripe {
  const client = getStripeClient();
  if (!client) throw new Error("STRIPE_SECRET_KEY is not configured");
  return client;
}

export function stripeLiveApiCallsAllowed(): boolean {
  if (process.env.NODE_ENV === "test") return process.env.STRIPE_TEST_LIVE_CALLS === "1";
  return true;
}
