import { prisma } from "../../config/db";
import { logger } from "../../config/logger";
import { gstRatePercent } from "../../utils/gst";

import { getZohoAuditMap, patchZohoAuditCache } from "./zoho-stock-sync-cache";
import { appendZohoStockSyncHistory } from "./zoho-stock-sync-history";
import type { ZohoActionResult } from "./zoho-sync-types";
import { zohoGet, zohoPost, zohoPut } from "./zoho-client";

type ZohoItemRow = {
  item_id: string;
  sku?: string;
  name?: string;
  stock_on_hand?: number;
};

export type ZohoProductSyncResult = {
  ok: boolean;
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
};

function zohoConfigured(): boolean {
  return Boolean(
    process.env.ZOHO_CLIENT_ID?.trim() &&
      process.env.ZOHO_REFRESH_TOKEN?.trim() &&
      process.env.ZOHO_ORGANIZATION_ID?.trim()
  );
}

/** True when admin/refund stock pushes to Zoho can run (needs adjustment GL account). */
export function zohoStockPushConfigured(): boolean {
  return zohoConfigured() && Boolean(process.env.ZOHO_ADJUSTMENT_ACCOUNT_ID?.trim());
}

export function warnZohoStockPushConfig(): void {
  if (!zohoConfigured()) return;
  if (!process.env.ZOHO_ADJUSTMENT_ACCOUNT_ID?.trim()) {
    logger.warn("zoho_stock_push_disabled", {
      reason:
        "ZOHO_ADJUSTMENT_ACCOUNT_ID is not set — sales invoices still reduce Zoho stock on orders, but refunds and admin stock edits will NOT push to Zoho until this is configured"
    });
  }
}

async function findZohoItemBySku(sku: string): Promise<ZohoItemRow | null> {
  try {
    const res = await zohoGet<{ items: ZohoItemRow[] }>(
      `/items?sku=${encodeURIComponent(sku)}&filter_by=Status.Active`
    );
    const hit = (res.items ?? []).find((i) => i.sku?.trim() === sku);
    return hit ?? null;
  } catch {
    return null;
  }
}

function buildItemPayload(opts: {
  name: string;
  sku: string;
  rateInr: number;
  description?: string | null;
  taxPercent: number;
  initialStock?: number;
}) {
  const body: Record<string, unknown> = {
    name: opts.name.slice(0, 100),
    sku: opts.sku.slice(0, 120),
    rate: opts.rateInr,
    description: (opts.description ?? "").slice(0, 2000) || undefined,
    product_type: "goods",
    item_type: "sales_and_purchases",
    is_taxable: opts.taxPercent > 0
  };

  const taxId = process.env.ZOHO_SALES_TAX_ID?.trim();
  if (taxId && opts.taxPercent > 0) {
    body.tax_id = taxId;
    body.tax_percentage = opts.taxPercent;
  }

  if (opts.initialStock !== undefined && opts.initialStock >= 0) {
    body.initial_stock = opts.initialStock;
    body.initial_stock_rate = opts.rateInr;
  }

  return body;
}

async function upsertVariantToZoho(
  variant: {
    id: string;
    sku: string;
    saleInPaise: number;
    zohoItemId: string | null;
    productRel: { name: string; shortDescription: string | null; taxClass: string | null };
  },
  initialStock?: number
): Promise<"created" | "updated" | "skipped"> {
  const sku = variant.sku.trim();
  if (!sku) return "skipped";

  const rateInr = variant.saleInPaise / 100;
  const taxPercent = gstRatePercent(variant.productRel.taxClass);
  const payload = buildItemPayload({
    name: variant.productRel.name,
    sku,
    rateInr,
    description: variant.productRel.shortDescription,
    taxPercent,
    initialStock
  });

  if (variant.zohoItemId) {
    await zohoPut(`/items/${variant.zohoItemId}`, payload);
    return "updated";
  }

  const existing = await findZohoItemBySku(sku);
  if (existing?.item_id) {
    await zohoPut(`/items/${existing.item_id}`, payload);
    await prisma.productVariant.update({
      where: { id: variant.id },
      data: { zohoItemId: existing.item_id }
    });
    return "updated";
  }

  const created = await zohoPost<{ item: ZohoItemRow }>("/items", payload);
  const itemId = created.item?.item_id;
  if (itemId) {
    await prisma.productVariant.update({
      where: { id: variant.id },
      data: { zohoItemId: itemId }
    });
  }
  return "created";
}

async function adjustZohoStock(itemId: string, quantityAdjusted: number, reason: string): Promise<void> {
  const accountId = process.env.ZOHO_ADJUSTMENT_ACCOUNT_ID?.trim();
  if (!accountId) {
    throw new Error(
      "ZOHO_ADJUSTMENT_ACCOUNT_ID is not configured — set it in backend/.env (Zoho Books → Settings → Chart of Accounts → Inventory Adjustment or Cost of Goods Sold account ID)"
    );
  }

  await zohoPost("/inventoryadjustments", {
    date: new Date().toISOString().slice(0, 10),
    reason,
    adjustment_type: "quantity",
    line_items: [
      {
        item_id: itemId,
        quantity_adjusted: quantityAdjusted,
        adjustment_account_id: accountId
      }
    ]
  });
}

async function getZohoStockForItem(itemId: string, sku: string, live = false): Promise<number> {
  if (!live) {
    const auditMap = await getZohoAuditMap();
    const cached = auditMap?.get(sku);
    if (cached?.itemId === itemId) return cached.stockOnHand;
  }

  const res = await zohoGet<{ item: ZohoItemRow }>(`/items/${itemId}`);
  return Math.max(0, res.item?.stock_on_hand ?? 0);
}

/**
 * Live-read Zoho stock for SKUs and merge into the Redis audit cache so the
 * inventory dashboard shows real Zoho counts (not a stale snapshot).
 */
export async function liveRefreshZohoAuditCacheForSkus(skus: string[]): Promise<void> {
  const unique = Array.from(new Set(skus.map((s) => s.trim()).filter(Boolean)));
  if (unique.length === 0) return;

  const entries: Array<{ sku: string; itemId: string; stockOnHand: number }> = [];
  for (const sku of unique) {
    try {
      const itemId = await resolveZohoItemIdForSku(sku);
      if (!itemId) continue;
      const stockOnHand = await getZohoStockForItem(itemId, sku, true);
      entries.push({ sku, itemId, stockOnHand });
    } catch (err) {
      logger.warn("zoho_audit_live_refresh_sku_failed", {
        sku,
        error: err instanceof Error ? err.message : String(err)
      });
    }
  }
  if (entries.length > 0) {
    await patchZohoAuditCache(entries);
  }
}

/** Push all active variants for a product to Zoho Books as inventory items (SKU = unique key). */
export async function syncProductVariantsToZoho(productId: string): Promise<ZohoProductSyncResult> {
  const result: ZohoProductSyncResult = {
    ok: true,
    created: 0,
    updated: 0,
    skipped: 0,
    errors: []
  };

  if (!zohoConfigured()) {
    result.ok = false;
    result.errors.push("Zoho Books is not configured on the server");
    return result;
  }

  const variants = await prisma.productVariant.findMany({
    where: { productId, status: "ACTIVE" },
    select: {
      id: true,
      sku: true,
      saleInPaise: true,
      zohoItemId: true,
      inventory: { select: { onHand: true } },
      productRel: { select: { name: true, shortDescription: true, taxClass: true } }
    }
  });

  for (const v of variants) {
    try {
      const action = await upsertVariantToZoho(v, v.inventory?.onHand ?? 0);
      if (action === "created") result.created++;
      else if (action === "updated") result.updated++;
      else result.skipped++;
    } catch (err) {
      result.ok = false;
      const msg = err instanceof Error ? err.message : String(err);
      result.errors.push(`${v.sku}: ${msg}`);
      logger.error("zoho_item_sync_failed", { productId, sku: v.sku, error: msg });
    }
  }

  logger.info("zoho_product_items_sync", { productId, ...result });
  return result;
}

export async function resolveZohoItemIdForSku(sku: string): Promise<string | null> {
  const variant = await prisma.productVariant.findFirst({
    where: { sku },
    select: { zohoItemId: true }
  });
  if (variant?.zohoItemId) return variant.zohoItemId;
  const hit = await findZohoItemBySku(sku);
  return hit?.item_id ?? null;
}

export async function pushVariantsToZoho(variantIds: string[]): Promise<ZohoActionResult> {
  const result: ZohoActionResult = { ok: 0, errors: 0, messages: [] };

  if (!zohoConfigured()) {
    result.errors = variantIds.length;
    result.messages.push("Zoho Books is not configured");
    return result;
  }

  for (const variantId of variantIds) {
    try {
      const variant = await prisma.productVariant.findUnique({
        where: { id: variantId },
        select: {
          id: true,
          sku: true,
          saleInPaise: true,
          zohoItemId: true,
          inventory: { select: { onHand: true } },
          productRel: { select: { name: true, shortDescription: true, taxClass: true } }
        }
      });
      if (!variant) {
        result.errors++;
        result.messages.push(`${variantId}: variant not found`);
        continue;
      }

      await upsertVariantToZoho(variant, variant.inventory?.onHand ?? 0);
      result.ok++;
    } catch (err) {
      result.errors++;
      result.messages.push(`${variantId}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  await appendZohoStockSyncHistory({
    scope: "push_items",
    synced: result.ok,
    errors: result.errors,
    skipped: result.errors
  });

  return result;
}

export async function pushStockToZohoForSkus(
  skus: string[],
  opts?: { live?: boolean; reason?: string }
): Promise<ZohoActionResult> {
  const result: ZohoActionResult = { ok: 0, errors: 0, messages: [] };
  const live = opts?.live ?? false;
  const reason = opts?.reason ?? "Sarveda admin stock sync";
  const processedSkus: string[] = [];

  if (!zohoConfigured()) {
    result.errors = skus.length;
    result.messages.push("Zoho Books is not configured");
    return result;
  }

  for (const raw of skus) {
    const sku = raw.trim();
    if (!sku) continue;
    processedSkus.push(sku);

    try {
      const variant = await prisma.productVariant.findUnique({
        where: { sku },
        include: { inventory: { select: { onHand: true } } }
      });
      if (!variant?.inventory) {
        result.errors++;
        result.messages.push(`${sku}: no Sarveda inventory row`);
        continue;
      }

      const itemId = await resolveZohoItemIdForSku(sku);
      if (!itemId) {
        result.errors++;
        result.messages.push(`${sku}: not linked in Zoho — use Push to Zoho first`);
        continue;
      }

      const zohoStock = await getZohoStockForItem(itemId, sku, live);
      const delta = variant.inventory.onHand - zohoStock;
      if (delta === 0) {
        result.ok++;
        continue;
      }

      await adjustZohoStock(itemId, delta, reason);
      result.ok++;
    } catch (err) {
      result.errors++;
      const msg = err instanceof Error ? err.message : String(err);
      result.messages.push(`${sku}: ${msg}`);
      logger.error("zoho_stock_push_sku_failed", { sku, error: msg, reason });
    }
  }

  // Always refresh cached Zoho counts from live API so the dashboard badge
  // reflects reality (avoids false "Synced" after a failed refund push).
  if (processedSkus.length > 0) {
    await liveRefreshZohoAuditCacheForSkus(processedSkus).catch((err) => {
      logger.warn("zoho_audit_live_refresh_failed", { err });
    });
  }

  await appendZohoStockSyncHistory({
    scope: "push",
    synced: result.ok,
    errors: result.errors,
    skipped: result.errors
  });

  return result;
}

export async function mirrorStockToZohoForSkus(
  skus: string[],
  context: string,
  meta?: Record<string, unknown>,
  opts?: { live?: boolean }
): Promise<void> {
  const unique = Array.from(new Set(skus.map((sku) => sku.trim()).filter(Boolean)));
  if (unique.length === 0) return;

  logger.info("zoho_stock_mirror_started", { context, skus: unique, ...meta });

  try {
    const result = await pushStockToZohoForSkus(unique, {
      live: opts?.live ?? false,
      reason: `Sarveda ${context}`
    });
    if (result.errors > 0) {
      logger.error("zoho_stock_mirror_partial_failure", {
        context,
        skus: unique,
        result,
        ...meta
      });
      return;
    }
    logger.info("zoho_stock_mirror_success", { context, skus: unique, ...meta });
  } catch (err) {
    logger.error("zoho_stock_mirror_failed", {
      context,
      skus: unique,
      error: err instanceof Error ? err.message : String(err),
      ...meta
    });
  }
}

export async function markZohoItemsInactiveForSkus(skus: string[]): Promise<ZohoActionResult> {
  const auditMap = await getZohoAuditMap();
  const result: ZohoActionResult = { ok: 0, errors: 0, messages: [] };

  if (!zohoConfigured()) {
    result.errors = skus.length;
    result.messages.push("Zoho Books is not configured");
    return result;
  }

  for (const raw of skus) {
    const sku = raw.trim();
    if (!sku) continue;

    try {
      const itemId = auditMap?.get(sku)?.itemId ?? (await findZohoItemBySku(sku))?.item_id;
      if (!itemId) {
        result.errors++;
        result.messages.push(`${sku}: Zoho item not found`);
        continue;
      }

      await zohoPost(`/items/${itemId}/inactive`, {});
      result.ok++;
    } catch (err) {
      result.errors++;
      result.messages.push(`${sku}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  await appendZohoStockSyncHistory({
    scope: "inactive",
    synced: result.ok,
    errors: result.errors,
    skipped: result.errors
  });

  return result;
}
