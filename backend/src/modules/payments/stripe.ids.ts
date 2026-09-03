import type Stripe from "stripe";

export const STRIPE_META = {
  paymentId: "sarveda_payment_id",
  orderId: "order_id",
  orderNumber: "order_number",
  checkoutSessionId: "checkout_session_id",
  supplementaryPaymentId: "sarveda_supplementary_payment_id",
  adjustmentSupplementary: "adjustment_supplementary"
} as const;

export type SarvedaCheckoutMetadata = {
  sarveda_payment_id: string;
  order_id: string;
  order_number: string;
  checkout_session_id?: string;
};

export function buildSarvedaCheckoutMetadata(input: {
  paymentId: string;
  orderId: string;
  orderNumber: string;
  checkoutSessionId?: string;
}): SarvedaCheckoutMetadata {
  const meta: SarvedaCheckoutMetadata = {
    sarveda_payment_id: input.paymentId,
    order_id: input.orderId,
    order_number: input.orderNumber
  };
  if (input.checkoutSessionId) meta.checkout_session_id = input.checkoutSessionId;
  return meta;
}

export function isStripeSupplementaryMetadata(
  metadata?: Stripe.Metadata | null | Record<string, string>
): boolean {
  if (!metadata) return false;
  const supplementaryId = metadata[STRIPE_META.supplementaryPaymentId]?.trim();
  const flag = metadata[STRIPE_META.adjustmentSupplementary]?.trim();
  return Boolean(supplementaryId) || flag === "1";
}

export function readStripeCheckoutBinding(
  metadata?: Stripe.Metadata | null | Record<string, string>
): {
  paymentId?: string;
  orderId?: string;
  orderNumber?: string;
  checkoutSessionId?: string;
} {
  if (!metadata) return {};
  const paymentId = metadata[STRIPE_META.paymentId]?.trim();
  const orderId = metadata[STRIPE_META.orderId]?.trim();
  const orderNumber = metadata[STRIPE_META.orderNumber]?.trim();
  const checkoutSessionId = metadata[STRIPE_META.checkoutSessionId]?.trim();
  return {
    ...(paymentId ? { paymentId } : {}),
    ...(orderId ? { orderId } : {}),
    ...(orderNumber ? { orderNumber } : {}),
    ...(checkoutSessionId ? { checkoutSessionId } : {})
  };
}

export function isStripeCheckoutSessionId(id: string | null | undefined): id is string {
  return Boolean(id && id.startsWith("cs_"));
}
