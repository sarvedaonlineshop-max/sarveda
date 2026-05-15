import type { OrderStatus, PaymentProvider, PaymentStatus, Prisma } from "@prisma/client";

import { prisma } from "../../config/db";
import { shippingEnv } from "../../config/env";
import { logger } from "../../config/logger";

import * as delhivery from "./delhivery";
import { resolvePickupForShipment } from "./pickupLocation.resolve";
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

/** Creating a new carrier label (Shiprocket / Delhivery) — not once already shipped/delivered. */
const CREATE_SHIPMENT_ORDER_STATUSES = new Set<OrderStatus>(["PAID", "PROCESSING", "PACKED"]);

/** Pulling tracking updates from carrier APIs (includes shipped/delivered while still reconcilable). */
const TRACK_SYNC_ORDER_STATUSES = new Set<OrderStatus>(["PAID", "PROCESSING", "PACKED", "SHIPPED", "DELIVERED"]);

type OrderPaymentCheck = {
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  payments?: Array<{ provider: string }>;
};

/** India COD: order is PAID but payment row stays PENDING until delivery collection. */
export function isCodOrderReadyToShip(order: OrderPaymentCheck): boolean {
  return (
    order.status === "PAID" &&
    order.paymentStatus === "PENDING" &&
    (order.payments ?? []).some((p) => p.provider === "COD")
  );
}

function assertPaymentEligibleForShipping(
  order: OrderPaymentCheck
): { ok: true } | { ok: false; error: string; code: string } {
  if (order.paymentStatus === "CAPTURED") {
    return { ok: true };
  }
  if (isCodOrderReadyToShip(order)) {
    return { ok: true };
  }
  if (order.paymentStatus === "PENDING") {
    return {
      ok: false,
      error: `Payment must be captured before shipping (current: ${order.paymentStatus}). COD orders are shippable once order status is Paid.`,
      code: "PAYMENT_NOT_CAPTURED"
    };
  }
  return {
    ok: false,
    error: `Payment must be captured before shipping (current: ${order.paymentStatus}). Use admin Sync payment (Razorpay) if the gateway shows paid.`,
    code: "PAYMENT_NOT_CAPTURED"
  };
}

/** New AWB / pickup booking — paid pipeline only, before ship-complete states. */
export function assertOrderEligibleForCreatingShipment(order: OrderPaymentCheck): {
  ok: true;
} | { ok: false; error: string; code: string } {
  if (order.status === "CANCELLED" || order.status === "REFUNDED") {
    return {
      ok: false,
      error: "Cancelled or refunded orders cannot create carrier labels.",
      code: "ORDER_STATE"
    };
  }
  if (order.status === "PENDING_PAYMENT") {
    return {
      ok: false,
      error: "Unpaid orders cannot be shipped. Reconcile Razorpay payment or wait for capture.",
      code: "ORDER_UNPAID"
    };
  }
  if (!CREATE_SHIPMENT_ORDER_STATUSES.has(order.status)) {
    return {
      ok: false,
      error: `New labels can only be created for Paid, Processing, or Packed orders (current: ${order.status}). For shipped or delivered orders, use tracking sync only.`,
      code: "ORDER_STATE"
    };
  }
  return assertPaymentEligibleForShipping(order);
}

/** Tracking sync from carrier (Shiprocket / Delhivery) — broader than label creation. */
export function assertOrderEligibleForTrackingSync(order: OrderPaymentCheck): {
  ok: true;
} | { ok: false; error: string; code: string } {
  if (order.status === "CANCELLED" || order.status === "REFUNDED") {
    return {
      ok: false,
      error: "Cancelled or refunded orders cannot sync carrier tracking.",
      code: "ORDER_STATE"
    };
  }
  if (order.status === "PENDING_PAYMENT") {
    return {
      ok: false,
      error: "Unpaid orders cannot sync carrier tracking.",
      code: "ORDER_UNPAID"
    };
  }
  if (!TRACK_SYNC_ORDER_STATUSES.has(order.status)) {
    return {
      ok: false,
      error: `Order status ${order.status} does not allow carrier tracking sync.`,
      code: "ORDER_STATE"
    };
  }
  return assertPaymentEligibleForShipping(order);
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
  if (!shippingEnv.SHIPPING_DISABLE_STUBS) {
    if (order.grandTotalInPaise > 300_000 && isMetroCity(city)) {
      return "BLUEDART_STUB";
    }
    if (provider === "COD" && !isMetroCity(city)) {
      return "DTDC_STUB";
    }
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

export type AutoShipmentCreateOptions = {
  pickupLocationId?: string;
  shiprocketPickupName?: string;
};

/** Shiprocket/Delhivery channel order id — first label uses Sarveda order number; retries get -R2, -R3 after cancel. */
export function nextCarrierChannelOrderId(
  orderNumber: string,
  shippingLabelSeq: number
): { channelOrderId: string; nextSeq: number } {
  const nextSeq = shippingLabelSeq + 1;
  const channelOrderId =
    nextSeq === 1 ? orderNumber : `${orderNumber}-R${nextSeq}`.slice(0, 50);
  return { channelOrderId, nextSeq };
}

export async function autoSelectAndCreate(
  orderId: string,
  options?: AutoShipmentCreateOptions
): Promise<
  | { success: true; data: { courier: string; waybill: string; trackingUrl: string } }
  | { success: false; error: string; code: string }
> {
  const existingShip = await prisma.shipment.findFirst({
    where: { orderId },
    orderBy: { createdAt: "desc" }
  });
  if (existingShip?.awb) {
    const requestedPickupId = options?.pickupLocationId;
    if (
      requestedPickupId &&
      (existingShip.pickupLocationId ?? null) !== (requestedPickupId ?? null)
    ) {
      return {
        success: false,
        error:
          "This order already has a carrier AWB. Use “Cancel label” to void it in Shiprocket and remove it here, then create a new shipment to use a different warehouse.",
        code: "PICKUP_LOCKED"
      };
    }
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

  const eligible = assertOrderEligibleForCreatingShipment(order);
  if (!eligible.ok) {
    return { success: false, error: eligible.error, code: eligible.code };
  }

  const { channelOrderId, nextSeq } = nextCarrierChannelOrderId(
    order.orderNumber,
    order.shippingLabelSeq
  );

  const choice = selectCourier(order as OrderWithShippingContext);
  const shipAddr = order.addresses.find((a) => a.type === "SHIPPING");
  if (!shipAddr) {
    return { success: false, error: "Missing shipping address", code: "BAD_REQUEST" };
  }

  const weightKg = Math.max(0.05, totalWeightGrams(order as OrderWithShippingContext) / 1000);
  const paymentMode =
    primaryPaymentProvider(order as OrderWithShippingContext) === "COD" ? "COD" : "Pre-paid";

  logger.info("shipping_router_choice", { orderId, choice, weightKg, channelOrderId, nextSeq });

  let shiprocketPickup:
    | { pickupLocationName: string; pickupLocationId: string | null }
    | undefined;
  if (choice === "SHIPROCKET_INTERNATIONAL" || choice === "SHIPROCKET_DOMESTIC") {
    const pr = await resolvePickupForShipment({
      pickupLocationId: options?.pickupLocationId,
      shiprocketPickupName: options?.shiprocketPickupName
    });
    if (!pr.ok) {
      return { success: false, error: pr.error, code: pr.code };
    }
    shiprocketPickup = {
      pickupLocationName: pr.shiprocketPickupName,
      pickupLocationId: pr.pickupLocationId
    };
  }

  try {
    if (choice === "BLUEDART_STUB") {
      const { waybill, trackingUrl } = stubWaybill("STUB-BD", order.orderNumber);
      await persistShipment(order.id, "Bluedart", waybill, trackingUrl, undefined, {
        stub: true,
        kind: "BLUEDART_ROUTING_PLACEHOLDER"
      });
      return { success: true, data: { courier: "Bluedart", waybill, trackingUrl } };
    }
    if (choice === "DTDC_STUB") {
      const { waybill, trackingUrl } = stubWaybill("STUB-DTDC", order.orderNumber);
      await persistShipment(order.id, "DTDC", waybill, trackingUrl, undefined, {
        stub: true,
        kind: "DTDC_ROUTING_PLACEHOLDER"
      });
      return { success: true, data: { courier: "DTDC", waybill, trackingUrl } };
    }

    if (choice === "DELHIVERY") {
      const created = await delhivery.createShipment({
        orderNumber: channelOrderId,
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
      await persistShipment(
        order.id,
        "Delhivery",
        created.data.waybill,
        created.data.trackingUrl,
        undefined,
        { channelOrderId },
        nextSeq
      );
      return {
        success: true,
        data: { courier: "Delhivery", waybill: created.data.waybill, trackingUrl: created.data.trackingUrl }
      };
    }

    if (choice === "SHIPROCKET_INTERNATIONAL") {
      const created = await shiprocket.createInternationalShipment(order as OrderWithShippingContext, {
        pickupLocationName: shiprocketPickup!.pickupLocationName,
        channelOrderId
      });
      if (!created.success) return created;
      await persistShipment(
        order.id,
        "Shiprocket International",
        created.data.waybill,
        created.data.trackingUrl,
        shiprocketPickup!.pickupLocationId,
        created.data.carrierMeta,
        nextSeq
      );
      return {
        success: true,
        data: {
          courier: "Shiprocket International",
          waybill: created.data.waybill,
          trackingUrl: created.data.trackingUrl
        }
      };
    }

    const srDomestic = await shiprocket.createInternationalShipment(order as OrderWithShippingContext, {
      pickupLocationName: shiprocketPickup!.pickupLocationName,
      channelOrderId
    });
    if (!srDomestic.success) return srDomestic;
    await persistShipment(
      order.id,
      "Shiprocket",
      srDomestic.data.waybill,
      srDomestic.data.trackingUrl,
      shiprocketPickup!.pickupLocationId,
      srDomestic.data.carrierMeta,
      nextSeq
    );
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
  trackingUrl: string,
  pickupLocationId?: string | null,
  carrierMeta?: Prisma.InputJsonValue | null,
  shippingLabelSeqAfter?: number
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.shipment.create({
      data: {
        orderId,
        courier,
        awb: waybill,
        trackingUrl,
        status: "CREATED",
        ...(pickupLocationId ? { pickupLocationId } : {}),
        ...(carrierMeta ? { carrierMeta } : {})
      }
    });
    await tx.order.update({
      where: { id: orderId },
      data: {
        fulfillmentStatus: "PARTIAL",
        shippingLastError: null,
        shippingLastErrorAt: null,
        ...(shippingLabelSeqAfter !== undefined
          ? { shippingLabelSeq: shippingLabelSeqAfter }
          : {})
      }
    });
  });
}
