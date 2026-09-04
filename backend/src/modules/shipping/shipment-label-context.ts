import type { Order, OrderItem, PickupLocation, Prisma, Shipment } from "@prisma/client";

import { prisma } from "../../config/db";

import type { LabelLineItem, LabelMpsContext, LabelRenderOptions } from "./delhivery.label";
import { formatPickupReturnAddress, getLabelAddressDefaults } from "./labelAssets";

export type ShipmentForLabel = Shipment & {
  pickupLocation: PickupLocation | null;
  order: (Order & { items: OrderItem[] }) | null;
};

export function parseMpsWaybills(carrierMeta: unknown): string[] {
  if (!carrierMeta || typeof carrierMeta !== "object" || Array.isArray(carrierMeta)) return [];
  const raw = (carrierMeta as { mpsWaybills?: unknown }).mpsWaybills;
  if (!Array.isArray(raw)) return [];
  return raw.map((w) => String(w).trim()).filter(Boolean);
}

export function resolveMpsLabelContext(
  waybill: string,
  shipment: ShipmentForLabel
): LabelMpsContext | undefined {
  const mps = parseMpsWaybills(shipment.carrierMeta);
  if (mps.length <= 1) return undefined;

  const masterWaybill = mps[0] ?? shipment.awb?.trim() ?? waybill;
  const idx = mps.indexOf(waybill);
  const role = idx <= 0 ? "master" : "child";

  return {
    boxCount: mps.length,
    role,
    masterWaybill
  };
}

const shipmentInclude = {
  pickupLocation: true,
  order: {
    include: {
      items: { orderBy: { id: "asc" as const } }
    }
  }
} satisfies Prisma.ShipmentInclude;

/** Resolve shipment for a label URL — matches master `awb` or any child in `carrierMeta.mpsWaybills`. */
export async function findShipmentForLabelWaybill(
  waybill: string
): Promise<ShipmentForLabel | null> {
  const wb = waybill.trim();
  if (!wb) return null;

  const byAwb = await prisma.shipment.findFirst({
    where: { awb: wb },
    include: shipmentInclude
  });
  if (byAwb) return byAwb;

  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM "Shipment"
    WHERE "carrierMeta" IS NOT NULL
      AND jsonb_typeof("carrierMeta"->'mpsWaybills') = 'array'
      AND EXISTS (
        SELECT 1
        FROM jsonb_array_elements_text("carrierMeta"->'mpsWaybills') AS w(wbn)
        WHERE wbn = ${wb}
      )
    LIMIT 1
  `;

  const hit = rows[0];
  if (!hit) return null;

  return prisma.shipment.findUnique({
    where: { id: hit.id },
    include: shipmentInclude
  });
}

export async function resolvePickupReturnAddress(
  shipment: ShipmentForLabel | null
): Promise<string> {
  const defaults = getLabelAddressDefaults();
  if (shipment?.pickupLocation) {
    const formatted = formatPickupReturnAddress(shipment.pickupLocation);
    if (formatted) return formatted;
  }
  const primary = await prisma.pickupLocation.findFirst({
    where: { isActive: true, isPrimary: true }
  });
  if (primary) {
    const formatted = formatPickupReturnAddress(primary);
    if (formatted) return formatted;
  }
  return defaults.returnAddress;
}

export function buildLabelRenderOptions(
  shipment: ShipmentForLabel | null,
  waybill: string,
  pickupReturn: string
): LabelRenderOptions {
  const defaults = getLabelAddressDefaults();
  const returnAddress = pickupReturn || defaults.returnAddress;
  const renderOptions: LabelRenderOptions = {
    sellerName: defaults.sellerName,
    // Same as return address on the printed label.
    sellerAddress: returnAddress,
    sellerGst: defaults.sellerGst,
    returnAddress
  };

  if (!shipment?.order) return renderOptions;

  const mps = resolveMpsLabelContext(waybill, shipment);
  if (mps) renderOptions.mps = mps;

  const productLines: LabelLineItem[] = shipment.order.items.map((it) => ({
    name: it.nameSnapshot,
    sku: it.skuSnapshot,
    qty: it.qtyOrdered,
    unitPrice: it.unitPriceInPaise / 100,
    lineTotal: it.lineTotalInPaise / 100
  }));

  const grandTotal = shipment.order.grandTotalInPaise / 100;
  const sumProducts = productLines.reduce((s, it) => s + it.lineTotal, 0);
  const shippingRupees = (shipment.order.shippingInPaise ?? 0) / 100;
  const shippingLine =
    shippingRupees > 0
      ? shippingRupees
      : Math.round(Math.max(0, grandTotal - sumProducts) * 100) / 100;

  if (shippingLine > 0.009) {
    productLines.push({
      name: "Shipping Charges",
      sku: "",
      qty: 1,
      unitPrice: shippingLine,
      lineTotal: shippingLine
    });
  }

  renderOptions.lineItems = productLines;
  // Delhivery MPS: full declared value on master only; nominal on child boxes.
  renderOptions.declaredAmountRupees =
    mps?.role === "child" ? 0.1 : grandTotal;

  return renderOptions;
}
