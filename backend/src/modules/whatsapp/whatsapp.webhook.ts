/**
 * Exotel WhatsApp inbound webhook.
 *
 * Configure in Exotel dashboard:
 *   https://<host>/api/whatsapp/webhook?token=<EXOTEL_WEBHOOK_TOKEN>
 * for both incoming messages and delivery (DLR) callbacks.
 *
 * Security: shared token in the query string (Exotel has no HMAC signing for
 * WhatsApp callbacks). Without a valid token the request is rejected.
 */
import { timingSafeEqual } from "crypto";
import type { Request, Response } from "express";

import { logger } from "../../config/logger";
import { processExotelWhatsAppCallback } from "./whatsapp-inbox.service";

function tokenMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function whatsappWebhookHandler(req: Request, res: Response): Promise<void> {
  const expected = process.env.EXOTEL_WEBHOOK_TOKEN?.trim();
  if (!expected) {
    logger.error("whatsapp_webhook_token_not_configured");
    res.status(503).json({ success: false, error: "Webhook not configured", code: "NOT_CONFIGURED" });
    return;
  }

  const provided =
    (typeof req.query.token === "string" ? req.query.token : "") ||
    (typeof req.headers["x-webhook-token"] === "string" ? req.headers["x-webhook-token"] : "");

  if (!provided || !tokenMatches(provided, expected)) {
    logger.warn("whatsapp_webhook_bad_token", { ip: req.ip });
    res.status(401).json({ success: false, error: "Unauthorized", code: "UNAUTHORIZED" });
    return;
  }

  // Ack immediately semantics: process, but never let errors produce non-200
  // (Exotel retries aggressively on failure).
  await processExotelWhatsAppCallback(req.body);
  res.json({ success: true });
}
