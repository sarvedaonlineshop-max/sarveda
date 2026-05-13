import type { NextFunction, Request, Response } from "express";
import { z } from "zod";

import { shippingEnv } from "../../config/env";
import { prisma } from "../../config/db";

import * as delhivery from "./delhivery";
import { orderBlocksCarrierSync, syncTrackingByWaybill } from "./orderLifecycle";
import * as shiprocket from "./shiprocket";
import { computeVariantShippingTotal, resolveRateCountryCode, zoneFromCountry } from "./shippingRates.service";
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
    res.json({
      success: true,
      data: {
        country: rateCountry,
        zone: zoneFromCountry(country),
        currency: rateCountry === "IN" ? "INR" : rateCountry === "GB" ? "GBP" : "USD",
        standardShippingInMinorUnits: standard,
        withCodInMinorUnits: rateCountry === "IN" ? withCod : null,
        pincode: parsed.data.pincode ?? null
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
    const result = await autoSelectAndCreate(orderId);
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

const cancelWaybillBody = z.object({
  waybill: z.string().min(4).max(64)
});

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
    const row = await prisma.shipment.findFirst({
      where: { awb: wb },
      include: { order: true }
    });
    if (!row) {
      res.status(404).json({ success: false, error: "Shipment not found", code: "NOT_FOUND" });
      return;
    }
    const c = row.courier.toLowerCase();
    if (c.includes("stub")) {
      res.status(400).json({
        success: false,
        error: "Cannot cancel stub shipments",
        code: "STUB_SHIPMENT"
      });
      return;
    }
    const cancelled = c.includes("delhivery") ? await delhivery.cancelShipment(wb) : await shiprocket.cancelShipment(wb);
    if (!cancelled.success) {
      res.status(400).json(cancelled);
      return;
    }
    res.json({ success: true, data: { cancelled: true, waybill: wb, orderId: row.orderId } });
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
