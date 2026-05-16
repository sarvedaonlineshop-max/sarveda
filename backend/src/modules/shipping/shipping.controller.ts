import type { NextFunction, Request, Response } from "express";
import { z } from "zod";

import { shippingEnv } from "../../config/env";
import { prisma } from "../../config/db";
import { logger } from "../../config/logger";

import * as delhivery from "./delhivery";
import { assertOrderEligibleForTrackingSync } from "./router";
import { orderBlocksCarrierSync, syncTrackingByWaybill } from "./orderLifecycle";
import * as shiprocket from "./shiprocket";
import {
  computeVariantShippingBreakdown,
  computeVariantShippingTotal,
  resolveRateCountryCode,
  zoneFromCountry
} from "./shippingRates.service";
import { autoSelectAndCreate } from "./router";

const pincodeBody = z.object({
  pincode: z.string().min(3).max(10)
});

export async function checkPincode(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = pincodeBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: "Invalid pincode",
        code: "VALIDATION_ERROR"
      });
      return;
    }
    const result = await delhivery.checkPincodeServiceability(parsed.data.pincode);
    if (!result.success) {
      res.status(result.code === "DELHIVERY_NOT_CONFIGURED" ? 503 : 400).json(result);
      return;
    }
    res.json({ success: true, data: result.data });
  } catch (err) {
    next(err);
  }
}

const indiaShiprocketBody = z.object({
  pincode: z.string().min(6).max(12),
  weightKg: z.coerce.number().min(0.05).max(100).optional().default(0.5),
  cod: z.coerce.boolean().optional().default(false)
});

/** Public: Shiprocket courier availability warehouse → delivery PIN (India). */
export async function checkIndiaShiprocketServiceability(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = indiaShiprocketBody.safeParse(req.body && typeof req.body === "object" ? req.body : {});
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: "pincode (6 digits), optional weightKg and cod",
        code: "VALIDATION_ERROR"
      });
      return;
    }
    const result = await shiprocket.checkIndiaCourierServiceability({
      deliveryPincode: parsed.data.pincode,
      weightKg: parsed.data.weightKg,
      cod: parsed.data.cod
    });
    if (!result.success) {
      const status =
        result.code === "SHIPROCKET_ORIGIN_PIN" || result.code === "SHIPROCKET_NOT_CONFIGURED" ? 503 : 400;
      res.status(status).json(result);
      return;
    }
    res.json({ success: true, data: result.data });
  } catch (err) {
    next(err);
  }
}

const ratesQuery = z.object({
  country: z.string().min(2).max(2),
  pincode: z.string().optional(),
  variantIds: z.string().min(1),
  quantities: z.string().min(1)
});

export async function getRates(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = ratesQuery.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: "country, variantIds, and quantities are required",
        code: "VALIDATION_ERROR"
      });
      return;
    }
    const { country, variantIds, quantities } = parsed.data;
    const vIds = variantIds.split(",").map((s) => s.trim()).filter(Boolean);
    const qtys = quantities.split(",").map((s) => parseInt(s.trim(), 10)).filter((n) => Number.isFinite(n) && n > 0);
    if (vIds.length === 0 || vIds.length !== qtys.length) {
      res.status(400).json({
        success: false,
        error: "variantIds and quantities must have the same length",
        code: "VALIDATION_ERROR"
      });
      return;
    }
    const lines = vIds.map((variantId, i) => ({ variantId, quantity: qtys[i] ?? 1 }));
    const rateCountry = resolveRateCountryCode(country);
    const standard = await computeVariantShippingTotal(prisma, lines, rateCountry, { cod: false });
    const withCod =
      rateCountry === "IN"
        ? await computeVariantShippingTotal(prisma, lines, rateCountry, { cod: true })
        : standard;
    const breakdownStandard = await computeVariantShippingBreakdown(prisma, lines, rateCountry, {
      cod: false
    });
    const breakdownCod =
      rateCountry === "IN"
        ? await computeVariantShippingBreakdown(prisma, lines, rateCountry, { cod: true })
        : null;
    res.json({
      success: true,
      data: {
        country: rateCountry,
        zone: zoneFromCountry(country),
        currency: rateCountry === "IN" ? "INR" : rateCountry === "GB" ? "GBP" : "USD",
        standardShippingInMinorUnits: standard,
        withCodInMinorUnits: rateCountry === "IN" ? withCod : null,
        pincode: parsed.data.pincode ?? null,
        breakdown: {
          standard: breakdownStandard,
          withCod: breakdownCod
        }
      }
    });
  } catch (err) {
    next(err);
  }
}

export async function createShipmentForOrder(req: Request, res: Response, next: NextFunction) {
  try {
    const { orderId } = req.params;
    if (!orderId) {
      res.status(400).json({ success: false, error: "orderId required", code: "BAD_REQUEST" });
      return;
    }

    const bodyParsed = z
      .object({
        pickupLocationId: z.string().uuid().optional(),
        shiprocketPickupName: z.string().min(1).max(200).optional(),
        preferredCourier: z
          .enum(["AUTO", "DELHIVERY", "SHIPROCKET", "SHIPROCKET_INTERNATIONAL"])
          .optional()
      })
      .safeParse(req.body && typeof req.body === "object" ? req.body : {});

    if (!bodyParsed.success) {
      res.status(400).json({
        success: false,
        error: bodyParsed.error.issues.map((i) => i.message).join("; "),
        code: "VALIDATION_ERROR"
      });
      return;
    }

    const { pickupLocationId, shiprocketPickupName, preferredCourier } = bodyParsed.data;
    if (preferredCourier) {
      await prisma.order.update({
        where: { id: orderId },
        data: { preferredCourier }
      });
    }
    const result = await autoSelectAndCreate(orderId, {
      ...(pickupLocationId ? { pickupLocationId } : {}),
      ...(shiprocketPickupName ? { shiprocketPickupName } : {})
    });
    if (!result.success) {
      try {
        await prisma.order.update({
          where: { id: orderId },
          data: {
            shippingLastError: `${result.code ?? "SHIPMENT_FAILED"}: ${result.error}`.slice(0, 4000),
            shippingLastErrorAt: new Date()
          }
        });
      } catch {
        /* ignore */
      }
      res.status(400).json(result);
      return;
    }
    try {
      await prisma.order.update({
        where: { id: orderId },
        data: { shippingLastError: null, shippingLastErrorAt: null }
      });
    } catch {
      /* ignore */
    }
    res.json({ success: true, data: result.data });
  } catch (err) {
    next(err);
  }
}

export async function track(req: Request, res: Response, next: NextFunction) {
  try {
    const { waybill } = req.params;
    const synced = await syncTrackingByWaybill(waybill);
    if (!synced.success) {
      res.status(synced.code === "NOT_FOUND" ? 404 : 400).json(synced);
      return;
    }
    res.json({ success: true, data: synced.data });
  } catch (err) {
    next(err);
  }
}

/** Public AWB tracking (optional ?email= must match order for privacy). */
export async function publicTrack(req: Request, res: Response, next: NextFunction) {
  try {
    const waybill = String(req.params.waybill ?? "").trim();
    const email =
      typeof req.query.email === "string" ? req.query.email.trim().toLowerCase() : undefined;

    const shipment = await prisma.shipment.findFirst({
      where: { awb: waybill },
      include: { order: { select: { email: true, orderNumber: true, status: true } } }
    });
    if (!shipment) {
      res.status(404).json({ success: false, error: "Shipment not found", code: "NOT_FOUND" });
      return;
    }
    if (email && shipment.order.email.toLowerCase() !== email) {
      res.status(403).json({ success: false, error: "Email does not match this shipment", code: "FORBIDDEN" });
      return;
    }

    const synced = await syncTrackingByWaybill(waybill);
    const fresh = await prisma.shipment.findFirst({
      where: { awb: waybill },
      select: {
        awb: true,
        courier: true,
        status: true,
        trackingUrl: true,
        deliveredAt: true,
        updatedAt: true,
        order: { select: { orderNumber: true, status: true } }
      }
    });

    res.json({
      success: true,
      data: {
        waybill,
        courier: fresh?.courier ?? shipment.courier,
        shipmentStatus: fresh?.status ?? shipment.status,
        trackingUrl: fresh?.trackingUrl ?? shipment.trackingUrl,
        deliveredAt: fresh?.deliveredAt ?? shipment.deliveredAt,
        orderNumber: fresh?.order.orderNumber ?? shipment.order.orderNumber,
        orderStatus: fresh?.order.status ?? shipment.order.status,
        carrierSync: synced.success ? synced.data : null
      }
    });
  } catch (err) {
    next(err);
  }
}

const cancelWaybillBody = z.object({
  waybill: z.string().min(4).max(64),
  /** Skip carrier API; remove Sarveda shipment row only (use when already cancelled in Shiprocket). */
  localOnly: z.boolean().optional().default(false)
});

async function removeShipmentLabelLocally(orderId: string, shipmentId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.shipment.delete({ where: { id: shipmentId } });
    const remaining = await tx.shipment.count({ where: { orderId } });
    if (remaining === 0) {
      const orderRow = await tx.order.findUnique({
        where: { id: orderId },
        select: { shippingLabelSeq: true }
      });
      const seqFloor = Math.max(orderRow?.shippingLabelSeq ?? 0, 1);
      await tx.order.update({
        where: { id: orderId },
        data: {
          fulfillmentStatus: "UNFULFILLED",
          shippingLastError: null,
          shippingLastErrorAt: null,
          shippingLabelSeq: seqFloor
        }
      });
    }
  });
}

export async function syncOrderShipments(req: Request, res: Response, next: NextFunction) {
  try {
    const { orderId } = req.params;
    if (!orderId) {
      res.status(400).json({ success: false, error: "orderId required", code: "BAD_REQUEST" });
      return;
    }
    const order = await prisma.order.findFirst({
      where: { id: orderId, deletedAt: null },
      include: { shipments: { orderBy: { createdAt: "desc" } } }
    });
    if (!order) {
      res.status(404).json({ success: false, error: "Order not found", code: "NOT_FOUND" });
      return;
    }
    if (orderBlocksCarrierSync(order.status)) {
      res.status(400).json({
        success: false,
        error: "Cannot sync tracking for this order status.",
        code: "ORDER_STATE"
      });
      return;
    }
    const shipCheck = assertOrderEligibleForTrackingSync(order);
    if (!shipCheck.ok) {
      res.status(400).json({ success: false, error: shipCheck.error, code: shipCheck.code });
      return;
    }

    type Row = { awb: string; ok: boolean; error?: string; code?: string; data?: unknown };
    const results: Row[] = [];
    for (const sh of order.shipments) {
      if (!sh.awb) {
        results.push({ awb: "", ok: false, error: "Shipment has no AWB yet", code: "MISSING_AWB" });
        continue;
      }
      const r = await syncTrackingByWaybill(sh.awb);
      results.push(
        r.success
          ? { awb: sh.awb, ok: true, data: r.data }
          : { awb: sh.awb, ok: false, error: r.error, code: r.code }
      );
    }

    const fresh = await prisma.order.findFirst({
      where: { id: orderId },
      include: { shipments: { orderBy: { createdAt: "desc" } } }
    });

    res.json({
      success: true,
      data: {
        results,
        shipments: fresh?.shipments ?? [],
        orderStatus: fresh?.status,
        fulfillmentStatus: fresh?.fulfillmentStatus
      }
    });
  } catch (err) {
    next(err);
  }
}

export async function cancelWaybillAdmin(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = cancelWaybillBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: "waybill required",
        code: "VALIDATION_ERROR"
      });
      return;
    }
    const wb = parsed.data.waybill.trim();
    const localOnly = parsed.data.localOnly === true;
    const row = await prisma.shipment.findFirst({
      where: { awb: wb },
      include: { order: true }
    });
    if (!row) {
      res.status(404).json({ success: false, error: "Shipment not found", code: "NOT_FOUND" });
      return;
    }
    const c = row.courier.toLowerCase();
    const wbNorm = wb.trim();
    const isStubWaybill = /^STUB-/i.test(wbNorm);

    if (c.includes("stub") || isStubWaybill) {
      await removeShipmentLabelLocally(row.orderId, row.id);
      res.json({
        success: true,
        data: { cancelled: true, waybill: wb, orderId: row.orderId, localOnly: true, reason: "stub_or_placeholder_awb" }
      });
      return;
    }

    if (localOnly) {
      await removeShipmentLabelLocally(row.orderId, row.id);
      res.json({
        success: true,
        data: {
          cancelled: true,
          waybill: wb,
          orderId: row.orderId,
          localOnly: true,
          reason: "admin_local_only"
        }
      });
      return;
    }

    const cancelled = c.includes("delhivery")
      ? await delhivery.cancelShipment(wb)
      : await shiprocket.cancelShipment(wb, row.carrierMeta);
    if (!cancelled.success) {
      const isShiprocket = !c.includes("delhivery");
      if (isShiprocket) {
        const carrierMsg = cancelled.carrierMessage ?? cancelled.error;
        const absentOnCarrier = shiprocket.isShiprocketCancelUnavailable(
          carrierMsg,
          cancelled.httpStatus
        );
        const tracked = await shiprocket.trackShipment(wb);
        const trackCancelled =
          tracked.success && shiprocket.isCarrierStatusCancelled(tracked.data.status);
        const trackGone = !tracked.success && cancelled.httpStatus === 404;
        if (trackCancelled || absentOnCarrier || trackGone) {
          logger.info("shiprocket_cancel_already_void_on_carrier", {
            waybill: wb,
            status: tracked.success ? tracked.data.status : "unavailable",
            absentOnCarrier,
            trackGone
          });
          await removeShipmentLabelLocally(row.orderId, row.id);
          res.json({
            success: true,
            data: {
              cancelled: true,
              waybill: wb,
              orderId: row.orderId,
              carrierAlreadyCancelled: true,
              carrierStatus: tracked.success ? tracked.data.status : undefined,
              reason: trackCancelled
                ? "tracking_cancelled"
                : absentOnCarrier
                  ? "carrier_not_found"
                  : "tracking_unavailable"
            }
          });
          return;
        }
      }
      res.status(400).json({
        ...cancelled,
        error: `${cancelled.error} Use “Remove label only” if you already cancelled this AWB in Shiprocket.`
      });
      return;
    }
    await removeShipmentLabelLocally(row.orderId, row.id);
    res.json({ success: true, data: { cancelled: true, waybill: wb, orderId: row.orderId, carrierCancelled: true } });
  } catch (err) {
    next(err);
  }
}

const intlRatesQuery = z.object({
  country: z.string().min(2).max(10),
  weight: z.string().min(1)
});

export async function internationalRates(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = intlRatesQuery.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: "country and weight are required",
        code: "VALIDATION_ERROR"
      });
      return;
    }
    const weightKg = Math.max(0.01, parseFloat(parsed.data.weight));
    const origin = shippingEnv.SHIPPING_ORIGIN_PINCODE;
    const result = await shiprocket.getShippingRates(weightKg, origin, parsed.data.country);
    if (!result.success) {
      res.status(result.code === "SHIPROCKET_NOT_CONFIGURED" ? 503 : 400).json(result);
      return;
    }
    res.json({ success: true, data: result.data });
  } catch (err) {
    next(err);
  }
}
