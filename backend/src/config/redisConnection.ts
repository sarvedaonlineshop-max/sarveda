import IORedis from "ioredis";

/** Shared Redis for BullMQ + checkout idempotency. `maxRetriesPerRequest: null` required by BullMQ. */
let shared: IORedis | null = null;

export function getRedisConnection(): IORedis | null {
  const url = process.env.REDIS_URL?.trim();
  if (!url) return null;
  if (!shared) {
    shared = new IORedis(url, { maxRetriesPerRequest: null });
  }
  return shared;
}
