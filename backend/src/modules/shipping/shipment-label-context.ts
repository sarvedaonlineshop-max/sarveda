import type { Order, OrderItem, PickupLocation, Prisma, Shipment } from "@prisma/client";

import { prisma } from "../../config/db";
import {
  getReturnedQuantitiesByOrderItemIds,
  shippableQuantityForOrderItem
} from "../orders/order-shippable-qty";

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

export async function buildLabelRenderOptions(
  shipment: ShipmentForLabel | null,
  waybill: string,
  pickupReturn: string
): Promise<LabelRenderOptions> {
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

  const returnedByItem = await getReturnedQuantitiesByOrderItemIds(
    prisma,
    shipment.order.items.map((it) => it.id)
  );

  const meta =
    shipment.carrierMeta &&
    typeof shipment.carrierMeta === "object" &&
    !Array.isArray(shipment.carrierMeta)
      ? (shipment.carrierMeta as { orderItemIds?: unknown; orderValueRupees?: unknown })
      : null;
  const scopedIds = Array.isArray(meta?.orderItemIds)
    ? new Set(meta!.orderItemIds!.map((id) => String(id)))
    : null;

  const productLines: LabelLineItem[] = [];
  for (const it of shipment.order.items) {
    if (scopedIds && !scopedIds.has(it.id)) continue;
    const qty = shippableQuantityForOrderItem(it, returnedByItem.get(it.id) ?? 0);
    // Prefer ordered qty for label when this AWB already covers the line (post-ship).
    const labelQty =
      scopedIds && scopedIds.has(it.id)
        ? Math.max(qty, it.qtyOrdered - (returnedByItem.get(it.id) ?? 0))
        : qty;
    if (labelQty <= 0) continue;
    const unitPrice = it.unitPriceInPaise / 100;
    const lineTotalRupees =
      it.qtyOrdered > 0
        ? Math.round((it.lineTotalInPaise * labelQty) / it.qtyOrdered) / 100
        : unitPrice * labelQty;
    productLines.push({
      name: it.nameSnapshot,
      sku: it.skuSnapshot,
      qty: labelQty,
      unitPrice,
      lineTotal: lineTotalRupees
    });
  }

  const grandTotal = shipment.order.grandTotalInPaise / 100;
  const sumProducts = productLines.reduce((s, it) => s + it.lineTotal, 0);
  const shippingRupees = (shipment.order.shippingInPaise ?? 0) / 100;
  const discountRupees = (shipment.order.discountInPaise ?? 0) / 100;
  const shippingLine =
    shippingRupees > 0
      ? shippingRupees
      : Math.round(Math.max(0, grandTotal - sumProducts + discountRupees) * 100) / 100;

  // Full-order slip: show shipping + discount. Partial multi-AWB: only when this AWB
  // carried the whole remaining order (declared ≈ grand total) or is the sole forward.
  const metaDeclared = Number(meta?.orderValueRupees ?? 0);
  const showOrderExtras =
    !scopedIds ||
    scopedIds.size >= shipment.order.items.length ||
    (Number.isFinite(metaDeclared) &&
      metaDeclared > 0 &&
      Math.abs(metaDeclared - grandTotal) < 1);

  if (showOrderExtras && shippingLine > 0.009) {
    productLines.push({
      name: "Shipping Charges",
      sku: "",
      qty: 1,
      unitPrice: shippingLine,
      lineTotal: shippingLine
    });
  }

  if (showOrderExtras && discountRupees > 0.009) {
    const coupon = shipment.order.couponCode?.trim();
    productLines.push({
      name: coupon ? `Discount (${coupon})` : "Discount",
      sku: "",
      qty: 1,
      unitPrice: -discountRupees,
      lineTotal: -discountRupees
    });
  }

  renderOptions.lineItems = productLines;
  const declaredFromMeta =
    Number.isFinite(metaDeclared) && metaDeclared > 0 ? metaDeclared : 0;
  // Full-order labels: always show order grand total (products − discount + shipping).
  // Partial multi-AWB: prefer the amount declared on create (carrierMeta.orderValueRupees).
  const declaredFromLines =
    Math.round(
      (sumProducts +
        (showOrderExtras && shippingLine > 0.009 ? shippingLine : 0) -
        (showOrderExtras && discountRupees > 0.009 ? discountRupees : 0)) *
        100
    ) / 100;
  const totalAmount =
    showOrderExtras && grandTotal > 0
      ? grandTotal
      : declaredFromMeta > 0
        ? declaredFromMeta
        : declaredFromLines;
  // Delhivery MPS: full declared value on master only; nominal on child boxes.
  renderOptions.declaredAmountRupees = mps?.role === "child" ? 0.1 : totalAmount;

  return renderOptions;
}
