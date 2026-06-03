import { getRedisConnection } from "../../config/redisConnection";
import { logger } from "../../config/logger";

const SYNC_AT_KEY = "zoho:stock-sync:completed-at";
const SKUS_KEY = "zoho:stock-sync:sku-set";

export async function recordZohoStockSync(
  skus: Iterable<string>,
  opts?: { merge?: boolean }
): Promise<void> {
  const redis = getRedisConnection();
  if (!redis) return;

  const unique = [...new Set([...skus].map((s) => s.trim()).filter(Boolean))];
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

export async function getZohoStockSyncMeta(): Promise<{
  lastSyncAt: string | null;
  skuSet: Set<string> | null;
}> {
  const redis = getRedisConnection();
  if (!redis) {
    return { lastSyncAt: null, skuSet: null };
  }

  const [lastSyncAt, members] = await Promise.all([
    redis.get(SYNC_AT_KEY),
    redis.smembers(SKUS_KEY)
  ]);

  if (!lastSyncAt && members.length === 0) {
    return { lastSyncAt: null, skuSet: null };
  }

  return { lastSyncAt, skuSet: new Set(members) };
}
