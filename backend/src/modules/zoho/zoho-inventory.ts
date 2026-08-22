import { prisma } from "../../config/db";
import { logger } from "../../config/logger";

import { refreshZohoAuditCache } from "./zoho-sync-audit";
import { getZohoAuditMap } from "./zoho-stock-sync-cache";
import { appendZohoStockSyncHistory } from "./zoho-stock-sync-history";
import type { ZohoActionResult, ZohoItemAuditRow, ZohoStockSyncResult } from "./zoho-sync-types";
import { isZohoInventorySyncEnabled, ZOHO_INVENTORY_SYNC_DISABLED_MESSAGE } from "./zoho-inventory-sync-flag";

export type { ZohoStockSyncResult };

function emptyResult(): ZohoStockSyncResult {
  return { synced: 0, errors: 0, skipped: 0 };
}

async function applyZohoRowsToSarveda(
  rows: ZohoItemAuditRow[],
  opts?: { limitToProductId?: string }
): Promise<ZohoStockSyncResult> {
  const result = emptyResult();
  for (const row of rows) {
    const sku = row.sku.trim();
    if (!sku) continue;

    try {
      const variant = await prisma.productVariant.findFirst({
        where: {
          sku,
          ...(opts?.limitToProductId ? { productId: opts.limitToProductId } : {})
        },
        select: { id: true }
      });
      if (!variant) {
        result.skipped++;
        continue;
      }

      await prisma.inventory.upsert({
        where: { variantId: variant.id },
        create: { variantId: variant.id, onHand: row.stockOnHand },
        update: { onHand: row.stockOnHand }
      });
      result.synced++;
    } catch (err) {
      result.errors++;
      logger.error("sync_stock_from_zoho_failed", { sku, err });
    }
  }
  return result;
}

export async function syncStockFromZoho(): Promise<ZohoStockSyncResult> {
  if (!isZohoInventorySyncEnabled()) {
    logger.info("sync_stock_from_zoho_skipped_disabled");
    return { synced: 0, errors: 0, skipped: 0 };
  }
  logger.info("sync_stock_from_zoho_started");
  const { zohoSkuCount } = await refreshZohoAuditCache();
  const auditMap = await getZohoAuditMap();
  if (!auditMap) return { synced: 0, errors: 1, skipped: zohoSkuCount };
  const result = await applyZohoRowsToSarveda(Array.from(auditMap.values()));
  await appendZohoStockSyncHistory({
    scope: "full",
    synced: result.synced,
    errors: result.errors,
    skipped: result.skipped
  });
  return result;
}

export async function syncStockForProduct(
  productId: string,
  productName?: string
): Promise<ZohoStockSyncResult> {
  await refreshZohoAuditCache();
  const auditMap = await getZohoAuditMap();
  const result = auditMap
    ? await applyZohoRowsToSarveda(Array.from(auditMap.values()), { limitToProductId: productId })
    : { synced: 0, errors: 1, skipped: 0 };
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
  await refreshZohoAuditCache();
  const auditMap = await getZohoAuditMap();
  if (!auditMap) return { synced: 0, errors: 1, skipped: 0 };

  const localSkus = new Set(
    (
      await prisma.productVariant.findMany({
        select: { sku: true }
      })
    ).map((row) => row.sku.trim())
  );
  const matchedRows = Array.from(auditMap.values()).filter((row) => localSkus.has(row.sku));
  const result = await applyZohoRowsToSarveda(matchedRows);
  await appendZohoStockSyncHistory({
    scope: "unmatched",
    synced: result.synced,
    errors: result.errors,
    skipped: result.skipped
  });
  return result;
}

export async function pullStockFromZohoForSkus(skus: string[]): Promise<ZohoActionResult> {
  const result: ZohoActionResult = { ok: 0, errors: 0, messages: [] };
  if (!isZohoInventorySyncEnabled()) {
    result.messages.push(ZOHO_INVENTORY_SYNC_DISABLED_MESSAGE);
    return result;
  }
  const auditMap = await getZohoAuditMap();

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
