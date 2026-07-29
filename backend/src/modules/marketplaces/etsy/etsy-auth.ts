import { etsyEnv, ETSY_TOKEN_URL, isEtsyConfigured } from "../../../config/etsy";
import { logger } from "../../../config/logger";
import { getRedisConnection } from "../../../config/redisConnection";

const ACCESS_CACHE_KEY = "etsy:access_token";
const REFRESH_CACHE_KEY = "etsy:refresh_token";

export async function getEtsyAccessToken(): Promise<string> {
  if (!isEtsyConfigured()) {
    throw Object.assign(
      new Error("Etsy API is not configured. Set ETSY_API_KEY, ETSY_REFRESH_TOKEN, and ETSY_SHOP_ID."),
      { statusCode: 503, code: "ETSY_NOT_CONFIGURED" }
    );
  }

  const redis = getRedisConnection();
  if (redis) {
    const cached = await redis.get(ACCESS_CACHE_KEY);
    if (cached) return cached;
  }

  const refreshToken = (redis ? await redis.get(REFRESH_CACHE_KEY) : null) || etsyEnv.ETSY_REFRESH_TOKEN;
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: etsyEnv.ETSY_API_KEY,
    refresh_token: refreshToken
  });
  if (etsyEnv.ETSY_SHARED_SECRET) {
    body.set("client_secret", etsyEnv.ETSY_SHARED_SECRET);
  }

  const res = await fetch(ETSY_TOKEN_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body
  });

  const data = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };

  if (!res.ok || !data.access_token) {
    logger.error("Etsy token refresh failed", {
      status: res.status,
      error: data.error,
      description: data.error_description
    });
    throw Object.assign(
      new Error(`Etsy auth failed: ${data.error_description ?? data.error ?? "unknown_error"}`),
      { statusCode: 502, code: "ETSY_AUTH_FAILED" }
    );
  }

  const ttlSec = Math.max(60, Math.min(3500, (data.expires_in ?? 3600) - 120));
  if (redis) {
    await redis.setex(ACCESS_CACHE_KEY, ttlSec, data.access_token);
    if (data.refresh_token) {
      // Etsy rotates refresh tokens on every refresh.
      await redis.set(REFRESH_CACHE_KEY, data.refresh_token);
    }
  }
  return data.access_token;
}
