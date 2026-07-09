import { getRedisConnection } from "../../config/redisConnection";
import { logger } from "../../config/logger";

import type { ZohoItemAuditRow } from "./zoho-sync-types";

const SYNC_AT_KEY = "zoho:stock-sync:completed-at";
const SKUS_KEY = "zoho:stock-sync:sku-set";
const AUDIT_KEY = "zoho:stock-sync:audit-json";

function normalizeSku(sku: string): string {
  return sku.trim();
}

export async function recordZohoStockSync(
  skus: Iterable<string>,
  opts?: { merge?: boolean }
): Promise<void> {
  const redis = getRedisConnection();
  if (!redis) return;

  const unique = [...new Set([...skus].map(normalizeSku).filter(Boolean))];
  const pipeline = redis.pipeline();
  if (!opts?.merge) {
    pipeline.del(SKUS_KEY);
  }
  if (unique.length > 0) {
    pipeline.sadd(SKUS_KEY, ...unique);
  }
  pipeline.set(SYNC_AT_KEY, new Date().toISOString());
  await pipeline.exec();
  logger.info("zoho_stock_sync_cache_updated", { skuCount: unique.length, merge: Boolean(opts?.merge) });
}

export async function recordZohoAuditCache(rows: ZohoItemAuditRow[]): Promise<void> {
  const redis = getRedisConnection();
  if (!redis) return;

  const bySku = new Map<string, ZohoItemAuditRow>();
  for (const row of rows) {
    const sku = normalizeSku(row.sku);
    if (!sku) continue;
    bySku.set(sku, { ...row, sku });
  }

  const unique = Array.from(bySku.values());
  const pipeline = redis.pipeline();
  pipeline.del(SKUS_KEY);
  pipeline.del(AUDIT_KEY);
  if (unique.length > 0) {
    pipeline.sadd(SKUS_KEY, ...unique.map((r) => r.sku));
    pipeline.set(AUDIT_KEY, JSON.stringify(unique));
  }
  pipeline.set(SYNC_AT_KEY, new Date().toISOString());
  await pipeline.exec();
  logger.info("zoho_audit_cache_updated", { skuCount: unique.length });
}

/**
 * Merge fresh stock numbers for specific SKUs into the cached audit snapshot,
 * so the inventory dashboard reflects post-order / post-push counts without a
 * full "Refresh Zoho audit". No-op if there is no cache yet.
 */
export async function patchZohoAuditCache(
  entries: Array<{ sku: string; itemId: string; stockOnHand: number }>
): Promise<void> {
  const redis = getRedisConnection();
  if (!redis) return;
  if (entries.length === 0) return;

  const raw = await redis.get(AUDIT_KEY);
  if (!raw) return;

  let rows: ZohoItemAuditRow[];
  try {
    rows = JSON.parse(raw) as ZohoItemAuditRow[];
  } catch {
    return;
  }

  const bySku = new Map<string, ZohoItemAuditRow>();
  for (const row of rows) {
    const sku = normalizeSku(row.sku);
    if (sku) bySku.set(sku, { ...row, sku });
  }
  for (const entry of entries) {
    const sku = normalizeSku(entry.sku);
    if (!sku) continue;
    const existing = bySku.get(sku);
    bySku.set(sku, {
      sku,
      name: existing?.name ?? "",
      itemId: entry.itemId,
      stockOnHand: entry.stockOnHand
    });
  }

  await redis.set(AUDIT_KEY, JSON.stringify(Array.from(bySku.values())));
}

export async function getZohoAuditMap(): Promise<Map<string, ZohoItemAuditRow> | null> {
  const redis = getRedisConnection();
  if (!redis) return null;

  const raw = await redis.get(AUDIT_KEY);
  if (!raw) return null;

  try {
    const rows = JSON.parse(raw) as ZohoItemAuditRow[];
    const map = new Map<string, ZohoItemAuditRow>();
    for (const row of rows) {
      if (row.sku) map.set(normalizeSku(row.sku), row);
    }
    return map;
  } catch {
    return null;
  }
}

export async function getZohoStockSyncMeta(): Promise<{
  lastSyncAt: string | null;
  skuSet: Set<string> | null;
  auditMap: Map<string, ZohoItemAuditRow> | null;
}> {
  const redis = getRedisConnection();
  if (!redis) {
    return { lastSyncAt: null, skuSet: null, auditMap: null };
  }

  const [lastSyncAt, members, auditMap] = await Promise.all([
    redis.get(SYNC_AT_KEY),
    redis.smembers(SKUS_KEY),
    getZohoAuditMap()
  ]);

  if (!lastSyncAt && members.length === 0 && !auditMap) {
    return { lastSyncAt: null, skuSet: null, auditMap: null };
  }

  return {
    lastSyncAt,
    skuSet: members.length > 0 ? new Set(members) : auditMap ? new Set(auditMap.keys()) : null,
    auditMap
  };
}
