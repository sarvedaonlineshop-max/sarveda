import crypto from "crypto";

import type { Prisma } from "@prisma/client";
import type { Request, Response } from "express";

import { shippingEnv } from "../../config/env";
import { prisma } from "../../config/db";
import { logger } from "../../config/logger";

import { applyCarrierWebhookTracking, handleRtoShipment, isShiprocketRtoStatus, syncTrackingByWaybill } from "./orderLifecycle";

function timingSafeEq(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ba.length !== bb.length) return false;
  try {
    return crypto.timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

function verifyWebhookAuth(req: Request): { ok: boolean; reason?: string } {
  const secret = shippingEnv.SHIPROCKET_WEBHOOK_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      return { ok: false, reason: "SHIPROCKET_WEBHOOK_SECRET not set" };
    }
    logger.warn("shiprocket_webhook_skipped_auth_dev");
    return { ok: true };
  }
  const headerKey = shippingEnv.SHIPROCKET_WEBHOOK_HEADER.trim().toLowerCase();
  const raw = req.headers[headerKey];
  const received =
    typeof raw === "string" ? raw.trim() : Array.isArray(raw) ? String(raw[0] ?? "").trim() : "";
  if (!received) {
    return { ok: false, reason: "missing webhook auth header" };
  }
  if (!timingSafeEq(received, secret)) {
    return { ok: false, reason: "invalid webhook secret" };
  }
  return { ok: true };
}

/** Walk nested JSON for first plausible AWB / phone-style numeric waybill. */
function extractWaybill(node: unknown): string | undefined {
  const keyHints = [
    "awb_code",
    "awb",
    "airway_bill_number",
    "airwaybill",
    "waybill",
    "tracking_number",
    "tracking_no"
  ];

  function looksLikeWaybill(s: string): boolean {
    const t = s.trim();
    if (t.length < 6 || t.length > 32) return false;
    if (/^STUB-/i.test(t)) return false;
    return /^[A-Za-z0-9\-]+$/.test(t);
  }

  function walk(o: unknown, depth: number): string | undefined {
    if (depth > 18 || o === null || o === undefined) return undefined;
    if (typeof o === "string") {
      return looksLikeWaybill(o) ? o.trim() : undefined;
    }
    if (typeof o === "number" && Number.isFinite(o)) {
      const s = String(Math.trunc(o));
      return s.length >= 8 && s.length <= 20 ? s : undefined;
    }
    if (typeof o !== "object") return undefined;
    if (Array.isArray(o)) {
      for (const x of o) {
        const w = walk(x, depth + 1);
        if (w) return w;
      }
      return undefined;
    }
    const r = o as Record<string, unknown>;
    for (const hint of keyHints) {
      const v = r[hint];
      if (typeof v === "string" && looksLikeWaybill(v)) return v.trim();
      if (typeof v === "number" && Number.isFinite(v)) {
        const s = String(Math.trunc(v));
        if (s.length >= 8 && s.length <= 20) return s;
      }
    }
    for (const v of Object.values(r)) {
      const w = walk(v, depth + 1);
      if (w) return w;
    }
    return undefined;
  }

  return walk(node, 0);
}

const SR_TRACK_NUM: Record<number, string> = {
  6: "SHIPPED",
  7: "DELIVERED",
  8: "CANCELED",
  17: "OUT FOR DELIVERY",
  18: "IN TRANSIT",
  19: "OUT FOR PICKUP"
};

function extractStatusLabel(node: unknown): string | undefined {
  function fromPrimitive(v: unknown): string | undefined {
    if (typeof v === "number" && Number.isFinite(v)) {
      return SR_TRACK_NUM[v] ?? String(v);
    }
    if (typeof v === "string" && v.trim()) return v.trim();
    return undefined;
  }

  function walk(o: unknown, depth: number): string | undefined {
    if (depth > 18 || o === null || o === undefined) return undefined;
    if (typeof o !== "object") return fromPrimitive(o);
    if (Array.isArray(o)) {
      for (const x of o) {
        const s = walk(x, depth + 1);
        if (s) return s;
      }
      return undefined;
    }
    const r = o as Record<string, unknown>;
    const preferred = [
      "current_status",
      "current_status_name",
      "shipment_status",
      "status_name",
      "tracking_status",
      "track_status",
      "status",
      "remark"
    ];
    for (const k of preferred) {
      if (k in r) {
        const s = fromPrimitive(r[k]);
        if (s) return s;
      }
    }
    for (const v of Object.values(r)) {
      const s = walk(v, depth + 1);
      if (s) return s;
    }
    return undefined;
  }

  return walk(node, 0);
}

export async function shiprocketWebhookHandler(req: Request, res: Response): Promise<void> {
  const auth = verifyWebhookAuth(req);
  if (!auth.ok) {
    logger.warn("shiprocket_webhook_auth_failed", { reason: auth.reason });
    res.status(auth.reason?.includes("not set") ? 503 : 401).json({
      success: false,
      error: auth.reason ?? "Unauthorized"
    });
    return;
  }

  const rawBody = req.body as Buffer;
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody.toString("utf8"));
  } catch {
    res.status(400).json({ success: false, error: "Invalid JSON" });
    return;
  }

  const waybill = extractWaybill(parsed);
  const statusLabel = extractStatusLabel(parsed);

  if (!waybill) {
    logger.warn("shiprocket_webhook_no_waybill", {
      keys:
        parsed && typeof parsed === "object" && !Array.isArray(parsed)
          ? Object.keys(parsed as object).slice(0, 20)
          : []
    });
    res.status(200).json({ success: true, data: { ignored: true, reason: "no_awb_in_payload" } });
    return;
  }

  try {
    let applied:
      | { success: true; data: { orderStatus: string; shipmentStatus: string } }
      | { success: false; code?: string };

    if (statusLabel && isShiprocketRtoStatus(statusLabel)) {
      const shipment = await prisma.shipment.findFirst({
        where: { awb: waybill },
        include: { order: true }
      });
      if (shipment) {
        await handleRtoShipment(shipment.orderId, waybill, statusLabel);
        const refreshed = await prisma.order.findUnique({
          where: { id: shipment.orderId },
          select: { status: true }
        });
        applied = {
          success: true,
          data: {
            orderStatus: refreshed?.status ?? shipment.order.status,
            shipmentStatus: "RTO"
          }
        };
      } else {
        applied = { success: false, code: "NOT_FOUND" };
      }
    } else if (statusLabel) {
      const r = await applyCarrierWebhookTracking(waybill, statusLabel);
      applied = r.success
        ? {
            success: true,
            data: {
              orderStatus: r.data.orderStatus,
              shipmentStatus: r.data.shipmentStatus
            }
          }
        : { success: false, code: r.code };
      if (!r.success) {
        logger.warn("shiprocket_webhook_apply_failed", { waybill, code: r.code, error: r.error });
      }
    } else {
      const r = await syncTrackingByWaybill(waybill);
      applied = r.success
        ? {
            success: true,
            data: {
              orderStatus: r.data.orderStatus,
              shipmentStatus: r.data.shipmentStatus
            }
          }
        : { success: false, code: r.code };
      if (!r.success) {
        logger.warn("shiprocket_webhook_sync_failed", { waybill, code: r.code, error: r.error });
      }
    }

    const row = await prisma.shipment.findFirst({ where: { awb: waybill } });
    if (row) {
      const prev = (row.carrierMeta && typeof row.carrierMeta === "object" && !Array.isArray(row.carrierMeta)
        ? row.carrierMeta
        : {}) as Record<string, unknown>;
      const snippet =
        typeof parsed === "object"
          ? JSON.stringify(parsed).slice(0, 12_000)
          : String(parsed).slice(0, 1200);
      await prisma.shipment.update({
        where: { id: row.id },
        data: {
          carrierMeta: {
            ...prev,
            lastShiprocketWebhookAt: new Date().toISOString(),
            lastShiprocketWebhookOk: applied.success,
            lastShiprocketWebhookSnippet: snippet
          } as Prisma.InputJsonValue
        }
      });
    }

    res.status(200).json({
      success: true,
      data: {
        waybill,
        applied
      }
    });
  } catch (err) {
    logger.error("shiprocket_webhook_handler_error", { err, waybill });
    res.status(500).json({ success: false, error: "Webhook handler failed" });
  }
}
