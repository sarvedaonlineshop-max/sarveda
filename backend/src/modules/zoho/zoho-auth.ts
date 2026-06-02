import { zohoEnv } from "../../config/env";
import { logger } from "../../config/logger";
import { getRedisConnection } from "../../config/redisConnection";

const CACHE_KEY = "zoho:access_token";

export async function getZohoAccessToken(): Promise<string> {
  const redis = getRedisConnection();
  if (redis) {
    const cached = await redis.get(CACHE_KEY);
    if (cached) return cached;
  }

  const res = await fetch(`${zohoEnv.ZOHO_ACCOUNTS_URL}/oauth/v2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: zohoEnv.ZOHO_REFRESH_TOKEN,
      client_id: zohoEnv.ZOHO_CLIENT_ID,
      client_secret: zohoEnv.ZOHO_CLIENT_SECRET,
      grant_type: "refresh_token"
    })
  });

  const data = (await res.json()) as { access_token?: string; error?: string };
  if (!data.access_token) {
    logger.error("Zoho token refresh failed", { error: data.error, status: res.status });
    throw new Error(`Zoho auth failed: ${data.error ?? "unknown_error"}`);
  }

  if (redis) {
    await redis.setex(CACHE_KEY, 55 * 60, data.access_token);
  }
  return data.access_token;
}
