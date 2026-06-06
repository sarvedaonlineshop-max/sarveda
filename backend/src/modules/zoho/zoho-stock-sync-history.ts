import { getRedisConnection } from "../../config/redisConnection";
import { logger } from "../../config/logger";

const HISTORY_KEY = "zoho:stock-sync:history";
const MAX_ENTRIES = 50;

export type ZohoSyncScope =
  | "full"
  | "product"
  | "unmatched"
  | "audit"
  | "pull"
  | "push"
  | "push_items"
  | "inactive";

export type ZohoStockSyncHistoryEntry = {
  id: string;
  at: string;
  scope: ZohoSyncScope;
  productId?: string;
  productName?: string;
  synced: number;
  errors: number;
  skipped: number;
};

export async function appendZohoStockSyncHistory(
  entry: Omit<ZohoStockSyncHistoryEntry, "id" | "at"> & { at?: string }
): Promise<void> {
  const redis = getRedisConnection();
  if (!redis) return;

  const row: ZohoStockSyncHistoryEntry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    at: entry.at ?? new Date().toISOString(),
    scope: entry.scope,
    productId: entry.productId,
    productName: entry.productName,
    synced: entry.synced,
    errors: entry.errors,
    skipped: entry.skipped
  };

  try {
    await redis.lpush(HISTORY_KEY, JSON.stringify(row));
    await redis.ltrim(HISTORY_KEY, 0, MAX_ENTRIES - 1);
  } catch (err) {
    logger.warn("zoho_stock_sync_history_append_failed", { err });
  }
}

export async function getZohoStockSyncHistory(limit = 20): Promise<ZohoStockSyncHistoryEntry[]> {
  const redis = getRedisConnection();
  if (!redis) return [];

  const raw = await redis.lrange(HISTORY_KEY, 0, Math.max(0, limit - 1));
  const out: ZohoStockSyncHistoryEntry[] = [];
  for (const line of raw) {
    try {
      out.push(JSON.parse(line) as ZohoStockSyncHistoryEntry);
    } catch {
      /* skip corrupt row */
    }
  }
  return out;
}
