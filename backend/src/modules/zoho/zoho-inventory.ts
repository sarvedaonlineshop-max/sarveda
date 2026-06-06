import { prisma } from "../../config/db";
import { logger } from "../../config/logger";

import { refreshZohoAuditCache } from "./zoho-sync-audit";
import { getZohoAuditMap } from "./zoho-stock-sync-cache";
import { appendZohoStockSyncHistory } from "./zoho-stock-sync-history";
import type { ZohoActionResult, ZohoStockSyncResult } from "./zoho-sync-types";

export type { ZohoStockSyncResult };

function emptyResult(): ZohoStockSyncResult {
  return { synced: 0, errors: 0, skipped: 0 };
}

/** @deprecated Use refreshZohoAuditCache — no longer overwrites Sarveda stock automatically. */
export async function syncStockFromZoho(): Promise<ZohoStockSyncResult> {
  logger.info("syncStockFromZoho redirected to audit refresh (no auto stock overwrite)");
  const { zohoSkuCount } = await refreshZohoAuditCache();
  return { synced: zohoSkuCount, errors: 0, skipped: 0 };
}

export async function syncStockForProduct(
  productId: string,
  productName?: string
): Promise<ZohoStockSyncResult> {
  logger.info("Product sync now refreshes full Zoho audit cache", { productId });
  const result = await syncStockFromZoho();
  await appendZohoStockSyncHistory({
    scope: "product",
    productId,
    productName,
    synced: result.synced,
    errors: result.errors,
    skipped: result.skipped
  });
  return result;
}

export async function syncUnmatchedSkusFromZoho(): Promise<ZohoStockSyncResult> {
  return syncStockFromZoho();
}

export async function pullStockFromZohoForSkus(skus: string[]): Promise<ZohoActionResult> {
  const auditMap = await getZohoAuditMap();
  const result: ZohoActionResult = { ok: 0, errors: 0, messages: [] };

  if (!auditMap) {
    result.errors = skus.length;
    result.messages.push("Run Refresh Zoho audit first");
    return result;
  }

  for (const raw of skus) {
    const sku = raw.trim();
    if (!sku) continue;
    const zoho = auditMap.get(sku);
    if (!zoho) {
      result.errors++;
      result.messages.push(`${sku}: not found in Zoho audit`);
      continue;
    }

    try {
      const variant = await prisma.productVariant.findUnique({
        where: { sku },
        select: { id: true }
      });
      if (!variant) {
        result.errors++;
        result.messages.push(`${sku}: no Sarveda variant`);
        continue;
      }

      await prisma.inventory.upsert({
        where: { variantId: variant.id },
        create: { variantId: variant.id, onHand: zoho.stockOnHand },
        update: { onHand: zoho.stockOnHand }
      });
      result.ok++;
    } catch (err) {
      result.errors++;
      result.messages.push(`${sku}: ${err instanceof Error ? err.message : String(err)}`);
      logger.error("pull_stock_from_zoho_failed", { sku, err });
    }
  }

  await appendZohoStockSyncHistory({
    scope: "pull",
    synced: result.ok,
    errors: result.errors,
    skipped: result.errors
  });

  return result;
}

export { refreshZohoAuditCache } from "./zoho-sync-audit";
