import type { Request, Response } from "express";

import { prisma } from "../../config/db";
import { logger } from "../../config/logger";
import { notifyOrderEmail } from "../notifications/email";
import { cancelUnpaidOrderWithRelease } from "../orders/orders.service";

import { completePayPalPaidOrder } from "./paypal.complete";
import { applyExternalProviderRefund } from "./refund-sync.service";

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
  const raw = (await res.json()) as { access_token?: string };
  if (!res.ok || !raw.access_token) {
    throw new Error("PayPal auth failed");
  }
  return raw.access_token;
}

async function verifyPayPalWebhook(req: Request, event: unknown): Promise<boolean> {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID?.trim();
  if (!webhookId) {
    if (process.env.NODE_ENV === "production") {
      logger.warn("paypal_webhook_no_webhook_id");
      return false;
    }
    return true;
  }

  const token = await paypalAccessToken();
  const res = await fetch(`${paypalBase()}/v1/notifications/verify-webhook-signature`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      auth_algo: req.headers["paypal-auth-algo"],
      cert_url: req.headers["paypal-cert-url"],
      transmission_id: req.headers["paypal-transmission-id"],
      transmission_sig: req.headers["paypal-transmission-sig"],
      transmission_time: req.headers["paypal-transmission-time"],
      webhook_id: webhookId,
      webhook_event: event
    })
  });

  const raw = (await res.json()) as { verification_status?: string };
  return res.ok && raw.verification_status === "SUCCESS";
}

type PayPalWebhookEvent = {
  event_type?: string;
  resource?: {
    id?: string;
    status?: string;
    custom_id?: string;
    amount?: { value?: string; currency_code?: string };
    supplementary_data?: {
      related_ids?: { order_id?: string; capture_id?: string };
    };
    purchase_units?: Array<{ custom_id?: string; reference_id?: string }>;
    links?: Array<{ rel?: string; href?: string }>;
  };
};

function parsePayPalAmountInPaise(value: string | undefined): number {
  if (!value) return 0;
  const num = Number.parseFloat(value);
  if (!Number.isFinite(num) || num <= 0) return 0;
  return Math.round(num * 100);
}

function extractPayPalCaptureId(resource: PayPalWebhookEvent["resource"]): string | undefined {
  const fromSupplementary = resource?.supplementary_data?.related_ids?.capture_id;
  if (fromSupplementary) return fromSupplementary;
  const upLink = resource?.links?.find((l) => l.rel === "up" && l.href?.includes("/captures/"));
  if (upLink?.href) {
    const match = upLink.href.match(/\/captures\/([^/?]+)/);
    if (match?.[1]) return match[1];
  }
  return undefined;
}

async function handlePayPalRefundWebhook(
  event: PayPalWebhookEvent,
  eventLabel: string
): Promise<void> {
  const resource = event.resource;
  const refundId = resource?.id;
  const amountPaise = parsePayPalAmountInPaise(resource?.amount?.value);
  const paymentDbId = resource?.custom_id?.trim() || undefined;
  const captureId = extractPayPalCaptureId(resource);

  if (!refundId || amountPaise <= 0) {
    logger.warn("paypal_refund_webhook_missing_fields", { eventLabel, refundId, amountPaise });
    return;
  }

  const refundStatus =
    resource?.status?.toUpperCase() === "COMPLETED"
      ? "processed"
      : resource?.status?.toUpperCase() === "FAILED"
        ? "failed"
        : "created";

  const result = await applyExternalProviderRefund({
    provider: "PAYPAL",
    providerRefundId: refundId,
    paymentDbId: paymentDbId ?? null,
    providerPaymentId: captureId ?? null,
    amountInPaise: amountPaise,
    reason: `PayPal webhook ${eventLabel}`,
    refundStatus,
    rawEvent: eventLabel
  });

  if (result.newlyRecorded && refundStatus === "processed" && result.orderId) {
    notifyOrderEmail(result.orderId, "refund_initiated");
  }
}

export async function paypalWebhookHandler(req: Request, res: Response): Promise<void> {
  let event: PayPalWebhookEvent;
  try {
    const raw = req.body as Buffer;
    event = JSON.parse(raw.toString("utf8")) as PayPalWebhookEvent;
  } catch {
    res.status(400).json({ success: false, error: "Invalid JSON" });
    return;
  }

  try {
    const ok = await verifyPayPalWebhook(req, event);
    if (!ok) {
      res.status(400).json({ success: false, error: "Invalid signature" });
      return;
    }
  } catch (err) {
    logger.error("paypal_webhook_verify_error", { err });
    res.status(400).json({ success: false, error: "Verification failed" });
    return;
  }

  const type = event.event_type ?? "";

  try {
    if (type === "PAYMENT.CAPTURE.COMPLETED") {
      const captureId = event.resource?.id;
      const paymentId = event.resource?.custom_id;
      if (!captureId) {
        res.status(200).json({ received: true });
        return;
      }

      if (paymentId) {
        const dup = await prisma.payment.findFirst({
          where: { provider: "PAYPAL", providerPaymentId: captureId, status: "CAPTURED" }
        });
        if (dup) {
          res.status(200).json({ received: true, duplicate: true });
          return;
        }
        await completePayPalPaidOrder(paymentId, captureId);
      } else {
        const paypalOrderId = event.resource?.supplementary_data?.related_ids?.order_id;
        if (paypalOrderId) {
          const pay = await prisma.payment.findFirst({
            where: { provider: "PAYPAL", providerOrderId: paypalOrderId }
          });
          if (pay && pay.status !== "CAPTURED") {
            await completePayPalPaidOrder(pay.id, captureId);
          }
        }
      }
    } else if (type === "PAYMENT.CAPTURE.DENIED") {
      const paymentId = event.resource?.custom_id;
      if (paymentId) {
        const pay = await prisma.payment.findFirst({
          where: { id: paymentId, provider: "PAYPAL" },
          include: { order: true }
        });
        if (pay && pay.order.status === "PENDING_PAYMENT") {
          const cancelled = await cancelUnpaidOrderWithRelease(pay.orderId, `PayPal ${type}`);
          if (cancelled) notifyOrderEmail(pay.orderId, "payment_failed");
        }
      }
    } else if (type === "PAYMENT.CAPTURE.REFUNDED" || type === "PAYMENT.REFUND.COMPLETED") {
      const paymentId = event.resource?.custom_id;
      if (paymentId) {
        const pay = await prisma.payment.findFirst({
          where: { id: paymentId, provider: "PAYPAL" },
          include: { order: true }
        });
        if (pay?.order.status === "PENDING_PAYMENT") {
          const cancelled = await cancelUnpaidOrderWithRelease(pay.orderId, `PayPal ${type}`);
          if (cancelled) notifyOrderEmail(pay.orderId, "payment_failed");
          res.status(200).json({ received: true });
          return;
        }
      }
      await handlePayPalRefundWebhook(event, type);
    }
  } catch (err) {
    logger.error("paypal_webhook_handler_error", { err, type });
  }

  res.status(200).json({ received: true });
}
