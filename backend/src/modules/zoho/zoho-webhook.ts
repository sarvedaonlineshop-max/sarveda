import type { Request, Response } from "express";

import { logger } from "../../config/logger";

/**
 * Zoho Books retired from Sarveda. Webhook accepts and acknowledges but never
 * mutates Inventory — Sarveda is the sole stock master.
 */
export async function handleZohoWebhook(req: Request, res: Response): Promise<void> {
  logger.info("zoho_webhook_ignored_retired", {
    event: req.body?.event_type || req.body?.action || null
  });
  res.status(200).json({
    success: true,
    data: { accepted: true, applied: false, reason: "ZOHO_RETIRED" }
  });
}
