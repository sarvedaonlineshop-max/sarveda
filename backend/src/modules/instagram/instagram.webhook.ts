import type { Request, Response } from "express";

import { logger } from "../../config/logger";
import { ingestInstagramWebhook, instagramConfig } from "./instagram-inbox.service";
import { verifyInstagramSignature } from "./instagram-webhook.parse";

/** Meta webhook handshake. The verify token must match INSTAGRAM_VERIFY_TOKEN. */
export function instagramWebhookVerifyHandler(req: Request, res: Response): void {
  const mode = typeof req.query["hub.mode"] === "string" ? req.query["hub.mode"] : "";
  const token = typeof req.query["hub.verify_token"] === "string" ? req.query["hub.verify_token"] : "";
  const challenge = typeof req.query["hub.challenge"] === "string" ? req.query["hub.challenge"] : "";
  const expected = instagramConfig().verifyToken;
  if (mode === "subscribe" && expected && token === expected && challenge) {
    res.status(200).type("text/plain").send(challenge);
    return;
  }
  res.status(403).json({ success: false, error: "Forbidden" });
}

export async function instagramWebhookHandler(req: Request, res: Response): Promise<void> {
  const secret = instagramConfig().appSecret;
  const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from("");
  const signature = req.get("x-hub-signature-256");
  if (!secret || !verifyInstagramSignature(raw, signature, secret)) {
    res.status(403).json({ success: false, error: "Invalid signature" });
    return;
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw.toString("utf8")) as unknown;
  } catch {
    res.status(400).json({ success: false, error: "Invalid JSON" });
    return;
  }

  try {
    const count = await ingestInstagramWebhook(payload);
    res.status(200).json({ success: true, data: { received: count } });
  } catch (err) {
    logger.error("instagram_webhook_failed", {
      error: err instanceof Error ? err.message : String(err)
    });
    res.status(500).json({ success: false, error: "Could not store Instagram message" });
  }
}
