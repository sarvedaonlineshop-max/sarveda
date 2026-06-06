import { prisma } from "../../config/db";
import { logger } from "../../config/logger";
import { shopCatalogProductWhere, shopCatalogVariantSkuWhere } from "../../utils/shop-catalog";

import { zohoGet } from "./zoho-client";
import { getZohoAuditMap, recordZohoAuditCache } from "./zoho-stock-sync-cache";
import { appendZohoStockSyncHistory } from "./zoho-stock-sync-history";
import {
  classifySkuPair,
  type ZohoItemAuditRow,
  type ZohoSyncScenario
} from "./zoho-sync-types";

interface ZohoItemResponse {
  item_id: string;
  sku: string;
  name: string;
  stock_on_hand: number;
}

export async function fetchAllActiveZohoItems(): Promise<ZohoItemAuditRow[]> {
  const out: ZohoItemAuditRow[] = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const res = await zohoGet<{
      items: ZohoItemResponse[];
      page_context: { has_more_page: boolean };
    }>(`/items?page=${page}&per_page=200&status=active`);

    for (const item of res.items ?? []) {
      const sku = item.sku?.trim();
      if (!sku) continue;
      out.push({
        sku,
        itemId: item.item_id,
        name: item.name ?? sku,
        stockOnHand: Math.max(0, item.stock_on_hand ?? 0)
      });
    }

    hasMore = res.page_context?.has_more_page ?? false;
    page++;
  }

  return out;
}

/** Fetch Zoho catalog and cache SKU + stock — does NOT modify Sarveda inventory. */
export async function refreshZohoAuditCache(): Promise<{
  zohoSkuCount: number;
  sarvedaSkuCount: number;
}> {
  logger.info("Refreshing Zoho audit cache");
  const items = await fetchAllActiveZohoItems();
  await recordZohoAuditCache(items);

  const sarvedaSkuCount = await prisma.productVariant.count({
    where: {
      ...shopCatalogVariantSkuWhere,
      productRel: shopCatalogProductWhere
    }
  });

  await appendZohoStockSyncHistory({
    scope: "audit",
    synced: items.length,
    errors: 0,
    skipped: 0
  });

  logger.info("Zoho audit cache refreshed", { zohoSkuCount: items.length, sarvedaSkuCount });
  return { zohoSkuCount: items.length, sarvedaSkuCount };
}

export type SarvedaVariantAudit = {
  variantId: string;
  sku: string;
  onHand: number;
  scenario: ZohoSyncScenario | null;
  zohoStockOnHand: number | null;
  inZohoBooks: boolean | null;
};

export function auditSarvedaVariant(
  sku: string,
  onHand: number,
  auditMap: Map<string, ZohoItemAuditRow> | null
): Pick<SarvedaVariantAudit, "scenario" | "zohoStockOnHand" | "inZohoBooks"> {
  if (!auditMap) {
    return { scenario: null, zohoStockOnHand: null, inZohoBooks: null };
  }
  const zoho = auditMap.get(sku);
  const scenario = classifySkuPair(onHand, zoho);
  return {
    scenario,
    zohoStockOnHand: zoho?.stockOnHand ?? null,
    inZohoBooks: zoho ? true : false
  };
}

export async function listZohoOnlyItems(): Promise<ZohoItemAuditRow[]> {
  const auditMap = await getZohoAuditMap();
  if (!auditMap) return [];

  const sarvedaSkus = await prisma.productVariant.findMany({
    where: { productRel: { deletedAt: null } },
    select: { sku: true }
  });
  const sarvedaSet = new Set(sarvedaSkus.map((v) => v.sku.trim()));

  return Array.from(auditMap.values())
    .filter((row) => !sarvedaSet.has(row.sku))
    .sort((a, b) => a.sku.localeCompare(b.sku));
}

export type ZohoSyncSummary = {
  synced: number;
  countMismatch: number;
  zohoOnly: number;
  sarvedaOnly: number;
  outOfSync: number;
};

export async function computeZohoSyncSummary(): Promise<ZohoSyncSummary> {
  const auditMap = await getZohoAuditMap();
  const zohoOnly = auditMap ? (await listZohoOnlyItems()).length : 0;

  if (!auditMap) {
    return { synced: 0, countMismatch: 0, zohoOnly: 0, sarvedaOnly: 0, outOfSync: 0 };
  }

  const rows = await prisma.inventory.findMany({
    where: {
      variant: {
        ...shopCatalogVariantSkuWhere,
        productRel: shopCatalogProductWhere
      }
    },
    select: { onHand: true, variant: { select: { sku: true } } }
  });

  let synced = 0;
  let countMismatch = 0;
  let sarvedaOnly = 0;

  for (const row of rows) {
    const audit = auditSarvedaVariant(row.variant.sku, row.onHand, auditMap);
    if (audit.scenario === 1) synced++;
    else if (audit.scenario === 2) countMismatch++;
    else if (audit.scenario === 4) sarvedaOnly++;
  }

  return {
    synced,
    countMismatch,
    zohoOnly,
    sarvedaOnly,
    outOfSync: countMismatch + zohoOnly + sarvedaOnly
  };
}
