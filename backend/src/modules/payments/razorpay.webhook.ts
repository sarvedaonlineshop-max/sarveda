import crypto from "crypto";

import type { Prisma } from "@prisma/client";
import type { Request, Response } from "express";

import { prisma } from "../../config/db";
import { logger } from "../../config/logger";
import { notifyOrderEmail } from "../notifications/email";
import { cancelUnpaidOrderWithRelease, handlePaidOrderStatusChange } from "../orders/orders.service";

import { completePaidOrder } from "./razorpay.verify";

function getWebhookSecret(): string | null {
  return process.env.RAZORPAY_WEBHOOK_SECRET?.trim() || null;
}

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

type WebhookPayload = {
  event?: string;
  payload?: {
    payment?: { entity?: Record<string, unknown> };
    refund?: { entity?: Record<string, unknown> };
    order?: { entity?: Record<string, unknown> };
  };
};

async function mergePaymentRawPayload(
  paymentId: string,
  event: string,
  snapshot: Record<string, unknown>
): Promise<void> {
  const row = await prisma.payment.findUnique({ where: { id: paymentId } });
  if (!row) return;
  const prev = (row.rawPayload as Record<string, unknown>) ?? {};
  await prisma.payment.update({
    where: { id: paymentId },
    data: {
      rawPayload: {
        ...prev,
        lastWebhookEvent: event,
        lastWebhookAt: new Date().toISOString(),
        lastWebhookPayload: snapshot as Prisma.InputJsonValue
      } as Prisma.InputJsonValue
    }
  });
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

  let payload: WebhookPayload;
  try {
    payload = JSON.parse(rawBody.toString("utf8")) as WebhookPayload;
  } catch {
    res.status(400).json({ success: false, error: "Invalid JSON" });
    return;
  }

  const event = payload.event;

  try {
    if (event === "payment.captured") {
      const ent = payload.payload?.payment?.entity as
        | { id?: string; order_id?: string; status?: string }
        | undefined;
      const payId = ent?.id;
      const rzpOrderId = ent?.order_id;
      if (payId && rzpOrderId) {
        const dup = await prisma.payment.findFirst({
          where: {
            provider: "RAZORPAY",
            providerPaymentId: payId,
            status: "CAPTURED"
          }
        });
        if (dup) {
          await mergePaymentRawPayload(dup.id, event, (ent ?? {}) as Record<string, unknown>);
          res.status(200).json({ success: true, duplicate: true });
          return;
        }

        await completePaidOrder(rzpOrderId, payId);
        const payRow = await prisma.payment.findFirst({
          where: { provider: "RAZORPAY", providerOrderId: rzpOrderId }
        });
        if (payRow) {
          await mergePaymentRawPayload(payRow.id, event, (ent ?? {}) as Record<string, unknown>);
        }
      }
    } else if (event === "payment.failed") {
      const ent = payload.payload?.payment?.entity as
        | { id?: string; order_id?: string; error_code?: string; error_description?: string }
        | undefined;
      const rzpOrderId = ent?.order_id;
      if (rzpOrderId) {
        const payRow = await prisma.payment.findFirst({
          where: { provider: "RAZORPAY", providerOrderId: rzpOrderId }
        });
        if (payRow) {
          await mergePaymentRawPayload(payRow.id, event, (ent ?? {}) as Record<string, unknown>);
          const cancelled = await cancelUnpaidOrderWithRelease(payRow.orderId, "Razorpay reported payment.failed", {
            razorpayError: ent?.error_code,
            razorpayErrorDescription: ent?.error_description
          });
          if (cancelled) {
            notifyOrderEmail(payRow.orderId, "payment_failed");
          }
        }
      }
    } else if (event === "refund.created" || event === "refund.processed") {
      const ent = payload.payload?.refund?.entity as
        | { id?: string; payment_id?: string; amount?: number; status?: string }
        | undefined;
      const refundId = ent?.id;
      const paymentProviderId = ent?.payment_id;
      const amountPaise = typeof ent?.amount === "number" ? ent.amount : 0;
      if (refundId && paymentProviderId) {
        const payRow = await prisma.payment.findFirst({
          where: { provider: "RAZORPAY", providerPaymentId: paymentProviderId }
        });
        if (payRow) {
          await mergePaymentRawPayload(payRow.id, event, (ent ?? {}) as Record<string, unknown>);

          const existing = await prisma.refund.findFirst({
            where: { providerRefundId: refundId }
          });
          if (!existing) {
            await prisma.refund.create({
              data: {
                paymentId: payRow.id,
                amountInPaise: amountPaise,
                providerRefundId: refundId,
                status: event === "refund.processed" ? "processed" : "created",
                reason: `Razorpay webhook ${event}`
              }
            });
          } else if (event === "refund.processed") {
            await prisma.refund.update({
              where: { id: existing.id },
              data: { status: "processed" }
            });
          }
          if (event === "refund.processed") {
            await handlePaidOrderStatusChange(payRow.orderId, "REFUNDED", "Razorpay refund.processed");
            notifyOrderEmail(payRow.orderId, "refund_initiated");
          }
        }
      }
    }
  } catch (err) {
    logger.error("razorpay_webhook_handler_error", { err, event });
  }

  res.status(200).json({ success: true });
}
