import { logger } from "../../config/logger";
import { getStripeClient, stripeLiveApiCallsAllowed } from "./stripe.client";
import { isStripeCheckoutSessionId } from "./stripe.ids";

export type ExpireStripeSessionResult = {
  expired: boolean;
  alreadyExpired?: boolean;
  skipped?: boolean;
  reason?: string;
};

/**
 * Prevent a cancelled/expired Sarveda unpaid order from remaining payable on Stripe.
 * Idempotent if the session is already expired or completed.
 */
export async function expireOpenStripeCheckoutSession(
  sessionId: string | null | undefined
): Promise<ExpireStripeSessionResult> {
  if (!isStripeCheckoutSessionId(sessionId)) {
    return { expired: false, skipped: true, reason: "not_checkout_session" };
  }

  if (!stripeLiveApiCallsAllowed()) {
    logger.info("stripe_session_expire_skipped_test", { sessionId });
    return { expired: false, skipped: true, reason: "test" };
  }

  const stripe = getStripeClient();
  if (!stripe) {
    logger.warn("stripe_session_expire_skipped_no_key", { sessionId });
    return { expired: false, skipped: true, reason: "no_stripe_key" };
  }

  try {
    const session = await stripe.checkout.sessions.expire(sessionId);
    logger.info("stripe_checkout_session_expired", {
      sessionId,
      status: session.status,
      paymentStatus: session.payment_status
    });
    return { expired: session.status === "expired", alreadyExpired: false };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const code =
      err && typeof err === "object" && "code" in err
        ? String((err as { code?: string }).code)
        : undefined;
    const alreadyExpired =
      /already expired/i.test(message) ||
      /session has already expired/i.test(message) ||
      code === "checkout_session_already_expired";
    if (alreadyExpired) {
      logger.info("stripe_checkout_session_already_expired", { sessionId });
      return { expired: false, alreadyExpired: true };
    }
    logger.error("stripe_checkout_session_expire_failed", { sessionId, err: message, code });
    return { expired: false, reason: message };
  }
}

export async function expireStripeCheckoutSessionForPayment(opts: {
  provider?: string | null;
  providerOrderId?: string | null;
}): Promise<ExpireStripeSessionResult | null> {
  if (opts.provider !== "STRIPE") return null;
  return expireOpenStripeCheckoutSession(opts.providerOrderId);
}
