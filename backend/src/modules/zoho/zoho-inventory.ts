import { prisma } from "../../config/db";
import { logger } from "../../config/logger";

import { zohoGet } from "./zoho-client";

interface ZohoItem {
  item_id: string;
  sku: string;
  name: string;
  stock_on_hand: number;
}

export async function syncStockFromZoho(): Promise<{
  synced: number;
  errors: number;
  skipped: number;
}> {
  logger.info("Starting Zoho stock sync");
  let synced = 0;
  let errors = 0;
  let skipped = 0;
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const res = await zohoGet<{
      items: ZohoItem[];
      page_context: { has_more_page: boolean };
    }>(`/items?page=${page}&per_page=200&status=active`);

    for (const item of res.items ?? []) {
      if (!item.sku) {
        skipped++;
        continue;
      }

      try {
        const variant = await prisma.productVariant.findUnique({
          where: { sku: item.sku },
          select: { id: true }
        });
        if (!variant) {
          skipped++;
          continue;
        }

        await prisma.inventory.upsert({
          where: { variantId: variant.id },
          create: { variantId: variant.id, onHand: Math.max(0, item.stock_on_hand ?? 0) },
          update: { onHand: Math.max(0, item.stock_on_hand ?? 0) }
        });
        synced++;
      } catch (err) {
        logger.error("Stock sync error", { sku: item.sku, err });
        errors++;
      }
    }

    hasMore = res.page_context?.has_more_page ?? false;
    page++;
  }

  logger.info("Zoho stock sync complete", { synced, errors, skipped });
  return { synced, errors, skipped };
}
