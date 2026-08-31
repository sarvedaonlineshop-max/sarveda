import type { Request, Response } from "express";

import { prisma } from "../../config/db";
import { logger } from "../../config/logger";
import { reconcileInventoryReserved } from "../orders/inventory-reserved-reconcile.service";

export async function handleZohoWebhook(req: Request, res: Response): Promise<void> {
  try {
    const payload = req.body;
    logger.info("Zoho webhook received", { payload });

    const eventType = payload?.event_type || payload?.action;

    if (
      eventType === "item_updated" ||
      eventType === "item.updated" ||
      payload?.data?.item
    ) {
      const item = payload?.data?.item || payload?.item;
      const sku = item?.sku;
      const stockOnHand = parseFloat(item?.stock_on_hand ?? "0");

      if (sku) {
        await syncSingleItemStock(sku, stockOnHand);
      }
    }

    res.status(200).json({ success: true });
  } catch (err) {
    logger.error("Zoho webhook error", { err });
    res.status(200).json({ success: true });
  }
}

async function syncSingleItemStock(sku: string, stockOnHand: number): Promise<void> {
  const variant = await prisma.productVariant.findFirst({
    where: { sku },
    include: { inventory: true }
  });

  if (!variant) {
    logger.warn("Zoho webhook: SKU not found in Sarveda", { sku });
    return;
  }

  const zohoOnHand = Math.max(0, Math.floor(stockOnHand));
  const onHand = zohoOnHand;
  await prisma.inventory.upsert({
    where: { variantId: variant.id },
    create: { variantId: variant.id, onHand, reserved: 0 },
    update: { onHand }
  });

  // Zoho updates onHand only — realign reserved to PENDING_PAYMENT holds so stock
  // cannot stay "out of stock" due to orphaned reservations.
  await reconcileInventoryReserved({ dryRun: false, variantIds: [variant.id] });

  const inv = await prisma.inventory.findUnique({ where: { variantId: variant.id } });
  logger.info("Zoho webhook: stock updated", {
    sku,
    onHand: inv?.onHand ?? onHand,
    reserved: inv?.reserved ?? 0,
    available: Math.max(0, (inv?.onHand ?? onHand) - (inv?.reserved ?? 0)),
    zohoReported: zohoOnHand,
    variantId: variant.id
  });
}
