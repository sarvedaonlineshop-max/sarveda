import { amazonEnv, isAmazonSpConfigured } from "../../../config/amazon";
import { logger } from "../../../config/logger";
import { getRedisConnection } from "../../../config/redisConnection";

const CACHE_KEY = "amazon:sp:access_token";

function requireAmazonConfig() {
  if (!isAmazonSpConfigured()) {
    throw Object.assign(
      new Error(
        "Amazon SP-API is not configured. Set AMAZON_SP_CLIENT_ID, AMAZON_SP_CLIENT_SECRET, and AMAZON_SP_REFRESH_TOKEN."
      ),
      { statusCode: 503, code: "AMAZON_NOT_CONFIGURED" }
    );
  }
}

export async function getAmazonSpAccessToken(): Promise<string> {
  requireAmazonConfig();

  const redis = getRedisConnection();
  if (redis) {
    const cached = await redis.get(CACHE_KEY);
    if (cached) return cached;
  }

  const res = await fetch(amazonEnv.AMAZON_SP_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: amazonEnv.AMAZON_SP_REFRESH_TOKEN,
      client_id: amazonEnv.AMAZON_SP_CLIENT_ID,
      client_secret: amazonEnv.AMAZON_SP_CLIENT_SECRET
    })
  });

  const data = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };

  if (!data.access_token) {
    logger.error("Amazon LWA token refresh failed", {
      status: res.status,
      error: data.error,
      description: data.error_description
    });
    throw Object.assign(
      new Error(`Amazon auth failed: ${data.error_description ?? data.error ?? "unknown_error"}`),
      { statusCode: 502, code: "AMAZON_AUTH_FAILED" }
    );
  }

  const ttlSec = Math.max(60, Math.min(3500, (data.expires_in ?? 3600) - 120));
  if (redis) {
    await redis.setex(CACHE_KEY, ttlSec, data.access_token);
  }
  return data.access_token;
}
