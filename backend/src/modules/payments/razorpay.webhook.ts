import crypto from "crypto";

import type { Request, Response } from "express";

import { logger } from "../../config/logger";

import { completePaidOrder } from "./razorpay.verify";

function getWebhookSecret(): string | null {
  return process.env.RAZORPAY_WEBHOOK_SECRET?.trim() || null;
}

/**
 * Razorpay webhook signature: HMAC_SHA256(webhook_secret, raw_body)
 */
function verifyWebhookSignature(rawBody: Buffer, signature: string | undefined): boolean {
  const secret = getWebhookSecret();
  if (!secret || !signature) {
    return false;
  }
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

export async function razorpayWebhookHandler(req: Request, res: Response): Promise<void> {
  const rawBody = req.body as Buffer;
  const sig =
    (req.headers["x-razorpay-signature"] as string | undefined) ||
    (req.headers["X-Razorpay-Signature"] as string | undefined);

  const secret = getWebhookSecret();
  if (secret) {
    if (!verifyWebhookSignature(rawBody, sig)) {
      logger.warn("razorpay_webhook_bad_signature");
      res.status(400).json({ success: false, error: "Invalid signature" });
      return;
    }
  } else if (process.env.NODE_ENV === "production") {
    res.status(503).json({ success: false, error: "Webhook secret not configured" });
    return;
  } else {
    logger.warn("razorpay_webhook_skipped_signature_dev");
  }

  let payload: {
    event?: string;
    payload?: {
      payment?: {
        entity?: { id?: string; order_id?: string; status?: string };
      };
      order?: { entity?: { id?: string } };
    };
  };

  try {
    payload = JSON.parse(rawBody.toString("utf8"));
  } catch {
    res.status(400).json({ success: false, error: "Invalid JSON" });
    return;
  }

  const event = payload.event;

  if (event === "payment.captured") {
    const ent = payload.payload?.payment?.entity;
    const payId = ent?.id;
    const orderId = ent?.order_id;
    if (payId && orderId) {
      try {
        await completePaidOrder(orderId, payId);
      } catch (err) {
        logger.error("webhook_complete_order_failed", { err, orderId, payId });
      }
    }
  }

  res.status(200).json({ success: true });
}
