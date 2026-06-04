import { prisma } from "../../config/db";
import { logger } from "../../config/logger";

import { zohoGet } from "./zoho-client";
import { getZohoStockSyncMeta, recordZohoStockSync } from "./zoho-stock-sync-cache";
import { appendZohoStockSyncHistory, type ZohoSyncScope } from "./zoho-stock-sync-history";

interface ZohoItem {
  item_id: string;
  sku: string;
  name: string;
  stock_on_hand: number;
}

export type ZohoStockSyncResult = {
  synced: number;
  errors: number;
  skipped: number;
};

type SyncRunOptions = {
  /** Only upsert inventory when Zoho SKU is in this set */
  skuAllowlist?: Set<string>;
  /** Replace (default) or merge Zoho SKU audit cache */
  cacheMerge?: boolean;
};

async function runZohoStockSync(opts: SyncRunOptions = {}): Promise<ZohoStockSyncResult> {
  let synced = 0;
  let errors = 0;
  let skipped = 0;
  const zohoSkus = new Set<string>();
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

      const sku = item.sku.trim();
      zohoSkus.add(sku);

      if (opts.skuAllowlist && !opts.skuAllowlist.has(sku)) {
        skipped++;
        continue;
      }

      try {
        const variant = await prisma.productVariant.findUnique({
          where: { sku },
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
        logger.error("Stock sync error", { sku, err });
        errors++;
      }
    }

    hasMore = res.page_context?.has_more_page ?? false;
    page++;
  }

  await recordZohoStockSync(zohoSkus, { merge: opts.cacheMerge });

  return { synced, errors, skipped };
}

async function logSyncHistory(
  scope: ZohoSyncScope,
  result: ZohoStockSyncResult,
  meta?: { productId?: string; productName?: string }
): Promise<void> {
  await appendZohoStockSyncHistory({
    scope,
    productId: meta?.productId,
    productName: meta?.productName,
    synced: result.synced,
    errors: result.errors,
    skipped: result.skipped
  });
}

export async function syncStockFromZoho(): Promise<ZohoStockSyncResult> {
  logger.info("Starting Zoho stock sync (full)");
  const result = await runZohoStockSync();
  await logSyncHistory("full", result);
  logger.info("Zoho stock sync complete", result);
  return result;
}

export async function syncStockForProduct(
  productId: string,
  productName?: string
): Promise<ZohoStockSyncResult> {
  const product = await prisma.product.findFirst({
    where: { id: productId, deletedAt: null },
    select: { name: true }
  });
  const variants = await prisma.productVariant.findMany({
    where: { productId, productRel: { deletedAt: null } },
    select: { sku: true }
  });
  const skuAllowlist = new Set(variants.map((v) => v.sku));
  logger.info("Starting Zoho stock sync for product", { productId, skuCount: skuAllowlist.size });
  const result = await runZohoStockSync({ skuAllowlist, cacheMerge: true });
  await logSyncHistory("product", result, {
    productId,
    productName: productName ?? product?.name
  });
  logger.info("Zoho product stock sync complete", { productId, ...result });
  return result;
}

export async function syncUnmatchedSkusFromZoho(): Promise<ZohoStockSyncResult> {
  const { skuSet } = await getZohoStockSyncMeta();
  if (!skuSet) {
    logger.info("No Zoho SKU audit cache — running full sync for unmatched");
    return syncStockFromZoho();
  }

  const variants = await prisma.productVariant.findMany({
    where: { productRel: { deletedAt: null } },
    select: { sku: true }
  });
  const unmatched = variants.map((v) => v.sku).filter((sku) => !skuSet.has(sku));
  if (unmatched.length === 0) {
    const empty = { synced: 0, errors: 0, skipped: 0 };
    await logSyncHistory("unmatched", empty);
    return empty;
  }

  logger.info("Starting Zoho stock sync for unmatched SKUs", { count: unmatched.length });
  const result = await runZohoStockSync({
    skuAllowlist: new Set(unmatched),
    cacheMerge: true
  });
  await logSyncHistory("unmatched", result);
  logger.info("Zoho unmatched stock sync complete", result);
  return result;
}
