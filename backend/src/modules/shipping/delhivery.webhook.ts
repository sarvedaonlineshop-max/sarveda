import type { Request, Response } from "express";

import { logger } from "../../config/logger";

import { applyCarrierWebhookTracking } from "./orderLifecycle";

function extractWaybill(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const r = payload as Record<string, unknown>;
  const candidates = [
    r.waybill,
    r.AWB,
    r.awb,
    r.waybill_number,
    (r.Shipment as Record<string, unknown> | undefined)?.AWB
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c.trim();
  }
  if (Array.isArray(r.Shipment)) {
    for (const s of r.Shipment) {
      if (s && typeof s === "object") {
        const awb = (s as Record<string, unknown>).AWB;
        if (typeof awb === "string" && awb.trim()) return awb.trim();
      }
    }
  }
  return null;
}

function extractStatus(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "In Transit";
  const r = payload as Record<string, unknown>;
  const status =
    r.Status ??
    r.status ??
    r.current_status ??
    (r.Shipment as Record<string, unknown> | undefined)?.Status;
  return typeof status === "string" && status.trim() ? status.trim() : "In Transit";
}

export async function delhiveryWebhookHandler(req: Request, res: Response): Promise<void> {
  const secret = process.env.DELHIVERY_WEBHOOK_SECRET?.trim();
  if (secret) {
    const token =
      (req.headers["x-delhivery-token"] as string | undefined) ||
      (req.headers["authorization"] as string | undefined);
    if (token !== secret && token !== `Token ${secret}`) {
      res.status(401).json({ success: false, error: "Unauthorized" });
      return;
    }
  }

  let payload: unknown = req.body;
  if (Buffer.isBuffer(payload)) {
    try {
      payload = JSON.parse(payload.toString("utf8"));
    } catch {
      res.status(400).json({ success: false, error: "Invalid JSON" });
      return;
    }
  }

  const awb = extractWaybill(payload);
  if (!awb) {
    res.status(200).json({ success: true, message: "no_awb_in_payload" });
    return;
  }

  const statusLabel = extractStatus(payload);
  const applied = await applyCarrierWebhookTracking(awb, statusLabel);
  if (!applied.success) {
    logger.warn("delhivery_webhook_apply_failed", { awb, code: applied.code, error: applied.error });
  } else {
    logger.info("delhivery_webhook_applied", { awb, status: statusLabel });
  }

  res.status(200).json({ success: true });
}
