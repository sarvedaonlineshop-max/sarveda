import type { PaymentProvider } from "@prisma/client";

import { prisma } from "../../config/db";
import { logger } from "../../config/logger";

import * as delhivery from "./delhivery";
import * as shiprocket from "./shiprocket";
import type { CourierChoice, OrderWithShippingContext } from "./types";

const METRO_NORMALIZED = new Set([
  "mumbai",
  "delhi",
  "bangalore",
  "bengaluru",
  "chennai",
  "hyderabad",
  "pune",
  "kolkata",
  "ahmedabad"
]);

export function isMetroCity(cityName: string): boolean {
  const key = cityName.trim().toLowerCase().replace(/\s+/g, " ");
  return METRO_NORMALIZED.has(key);
}

/** Delhi NCR 110xxx, Mumbai 400xxx, Bangalore 560xxx */
export function isZoneAPincode(pincode: string): boolean {
  const p = pincode.replace(/\D/g, "").slice(0, 6);
  if (p.length !== 6) return false;
  return /^110/.test(p) || /^400/.test(p) || /^560/.test(p);
}

export function totalWeightGrams(order: OrderWithShippingContext): number {
  let g = 0;
  for (const li of order.items) {
    const w = li.variant?.weightGrams ?? 500;
    g += w * li.qtyOrdered;
  }
  return Math.max(g, 1);
}

function primaryPaymentProvider(order: OrderWithShippingContext): PaymentProvider | null {
  const pay = order.payments?.[0];
  return pay?.provider ?? null;
}

export function selectCourier(order: OrderWithShippingContext): CourierChoice {
  const ship = order.addresses.find((a) => a.type === "SHIPPING");
  const country = (ship?.country ?? "IN").toUpperCase();
  if (country !== "IN") {
    return "SHIPROCKET_INTERNATIONAL";
  }

  const pin = ship?.postalCode ?? "";
  const city = ship?.city ?? "";
  const grams = totalWeightGrams(order);
  const provider = primaryPaymentProvider(order);

  if (grams > 5000 && isZoneAPincode(pin)) {
    return "DELHIVERY";
  }
  if (order.grandTotalInPaise > 300_000 && isMetroCity(city)) {
    return "BLUEDART_STUB";
  }
  if (provider === "COD" && !isMetroCity(city)) {
    return "DTDC_STUB";
  }
  return "SHIPROCKET_DOMESTIC";
}

function stubWaybill(prefix: string, orderNumber: string): { waybill: string; trackingUrl: string } {
  const wb = `${prefix}-${orderNumber.replace(/[^a-zA-Z0-9]/g, "").slice(0, 12)}`;
  return {
    waybill: wb,
    trackingUrl: `https://sarveda.com/track/${encodeURIComponent(wb)}`
  };
}

/** Rupees for Delhivery COD */
function codAmountRupees(order: OrderWithShippingContext): number {
  return order.grandTotalInPaise / 100;
}

export async function autoSelectAndCreate(orderId: string): Promise<
  | { success: true; data: { courier: string; waybill: string; trackingUrl: string } }
  | { success: false; error: string; code: string }
> {
  const existingShip = await prisma.shipment.findFirst({
    where: { orderId },
    orderBy: { createdAt: "desc" }
  });
  if (existingShip?.awb) {
    try {
      await prisma.order.update({
        where: { id: orderId },
        data: { shippingLastError: null, shippingLastErrorAt: null }
      });
    } catch {
      /* ignore */
    }
    return {
      success: true,
      data: {
        courier: existingShip.courier,
        waybill: existingShip.awb,
        trackingUrl: existingShip.trackingUrl ?? ""
      }
    };
  }

  const order = await prisma.order.findFirst({
    where: { id: orderId, deletedAt: null },
    include: {
      items: { include: { variant: true } },
      addresses: true,
      payments: { orderBy: { createdAt: "desc" }, take: 1 }
    }
  });

  if (!order) {
    return { success: false, error: "Order not found", code: "NOT_FOUND" };
  }

  const choice = selectCourier(order as OrderWithShippingContext);
  const shipAddr = order.addresses.find((a) => a.type === "SHIPPING");
  if (!shipAddr) {
    return { success: false, error: "Missing shipping address", code: "BAD_REQUEST" };
  }

  const weightKg = Math.max(0.05, totalWeightGrams(order as OrderWithShippingContext) / 1000);
  const paymentMode =
    primaryPaymentProvider(order as OrderWithShippingContext) === "COD" ? "COD" : "Pre-paid";

  logger.info("shipping_router_choice", { orderId, choice, weightKg });

  try {
    if (choice === "BLUEDART_STUB") {
      const { waybill, trackingUrl } = stubWaybill("STUB-BD", order.orderNumber);
      await persistShipment(order.id, "Bluedart", waybill, trackingUrl);
      return { success: true, data: { courier: "Bluedart", waybill, trackingUrl } };
    }
    if (choice === "DTDC_STUB") {
      const { waybill, trackingUrl } = stubWaybill("STUB-DTDC", order.orderNumber);
      await persistShipment(order.id, "DTDC", waybill, trackingUrl);
      return { success: true, data: { courier: "DTDC", waybill, trackingUrl } };
    }

    if (choice === "DELHIVERY") {
      const created = await delhivery.createShipment({
        orderNumber: order.orderNumber,
        paymentMode,
        codAmountRupees: paymentMode === "COD" ? codAmountRupees(order as OrderWithShippingContext) : undefined,
        weightKg,
        consigneeName: shipAddr.fullName,
        consigneePhone: shipAddr.phone,
        address: [shipAddr.line1, shipAddr.line2].filter(Boolean).join(", "),
        city: shipAddr.city,
        state: shipAddr.state,
        pincode: shipAddr.postalCode
      });
      if (!created.success) {
        return created;
      }
      await persistShipment(order.id, "Delhivery", created.data.waybill, created.data.trackingUrl);
      return {
        success: true,
        data: { courier: "Delhivery", waybill: created.data.waybill, trackingUrl: created.data.trackingUrl }
      };
    }

    if (choice === "SHIPROCKET_INTERNATIONAL") {
      const created = await shiprocket.createInternationalShipment(order as OrderWithShippingContext);
      if (!created.success) return created;
      await persistShipment(order.id, "Shiprocket International", created.data.waybill, created.data.trackingUrl);
      return {
        success: true,
        data: {
          courier: "Shiprocket International",
          waybill: created.data.waybill,
          trackingUrl: created.data.trackingUrl
        }
      };
    }

    const srDomestic = await shiprocket.createInternationalShipment(order as OrderWithShippingContext);
    if (!srDomestic.success) return srDomestic;
    await persistShipment(order.id, "Shiprocket", srDomestic.data.waybill, srDomestic.data.trackingUrl);
    return {
      success: true,
      data: {
        courier: "Shiprocket",
        waybill: srDomestic.data.waybill,
        trackingUrl: srDomestic.data.trackingUrl
      }
    };
  } catch (err) {
    logger.error("shipping_router_failed", { orderId, err });
    return {
      success: false,
      error: err instanceof Error ? err.message : "Shipment creation failed",
      code: "SHIPMENT_FAILED"
    };
  }
}

async function persistShipment(
  orderId: string,
  courier: string,
  waybill: string,
  trackingUrl: string
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.shipment.create({
      data: {
        orderId,
        courier,
        awb: waybill,
        trackingUrl,
        status: "CREATED"
      }
    });
    await tx.order.update({
      where: { id: orderId },
      data: {
        fulfillmentStatus: "PARTIAL",
        shippingLastError: null,
        shippingLastErrorAt: null
      }
    });
  });
}
