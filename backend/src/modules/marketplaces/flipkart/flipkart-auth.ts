import { flipkartEnv, isFlipkartConfigured, FLIPKART_TOKEN_URL } from "../../../config/flipkart";
import { logger } from "../../../config/logger";
import { getRedisConnection } from "../../../config/redisConnection";

const CACHE_KEY = "flipkart:access_token";

export async function getFlipkartAccessToken(): Promise<string> {
  if (!isFlipkartConfigured()) {
    throw Object.assign(
      new Error("Flipkart API is not configured. Set FLIPKART_API_KEY and FLIPKART_API_SECRET."),
      { statusCode: 503, code: "FLIPKART_NOT_CONFIGURED" }
    );
  }

  const redis = getRedisConnection();
  if (redis) {
    const cached = await redis.get(CACHE_KEY);
    if (cached) return cached;
  }

  const credentials = Buffer.from(
    `${flipkartEnv.FLIPKART_API_KEY}:${flipkartEnv.FLIPKART_API_SECRET}`
  ).toString("base64");

  const url = `${FLIPKART_TOKEN_URL}?grant_type=client_credentials&scope=Seller_Api`;

  const res = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Basic ${credentials}`,
      Accept: "application/json",
    },
  });

  const data = (await res.json()) as {
    access_token?: string;
    token_type?: string;
    expires_in?: number;
    scope?: string;
    error?: string;
    error_description?: string;
  };

  if (!data.access_token) {
    logger.error("Flipkart token refresh failed", {
      status: res.status,
      error: data.error,
      description: data.error_description,
    });
    throw Object.assign(
      new Error(`Flipkart auth failed: ${data.error_description ?? data.error ?? "unknown"}`),
      { statusCode: 502, code: "FLIPKART_AUTH_FAILED" }
    );
  }

  const ttlSec = Math.max(60, Math.min(data.expires_in ?? 3600, 86400) - 120);
  if (redis) {
    await redis.setex(CACHE_KEY, ttlSec, data.access_token);
  }

  return data.access_token;
}
