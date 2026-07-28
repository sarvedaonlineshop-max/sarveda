import { z } from "zod";

/**
 * Amazon Selling Partner API (India) — optional.
 * Empty credentials are allowed so backend boots without Amazon configured.
 * Sync endpoints return a clear 503 until all three LWA values are set.
 */
const amazonEnvSchema = z.object({
  AMAZON_SP_CLIENT_ID: z.string().default("").transform((s) => s.trim()),
  AMAZON_SP_CLIENT_SECRET: z.string().default("").transform((s) => s.trim()),
  AMAZON_SP_REFRESH_TOKEN: z.string().default("").transform((s) => s.trim()),
  /** India marketplace id (Amazon.in). */
  AMAZON_SP_MARKETPLACE_ID: z
    .string()
    .default("A21TJRUUN4KGV")
    .transform((s) => s.trim() || "A21TJRUUN4KGV"),
  /**
   * SP-API region host prefix: na | eu | fe.
   * India uses EU endpoint (sellingpartnerapi-eu.amazon.com).
   */
  AMAZON_SP_REGION: z
    .string()
    .default("eu")
    .transform((s): "na" | "eu" | "fe" => {
      const v = s.trim().toLowerCase();
      if (v === "na" || v === "eu" || v === "fe") return v;
      return "eu";
    }),
  AMAZON_SP_TOKEN_URL: z
    .string()
    .default("https://api.amazon.com/auth/o2/token")
    .transform((s) => s.trim() || "https://api.amazon.com/auth/o2/token")
});

export type AmazonEnv = z.infer<typeof amazonEnvSchema>;

export const amazonEnv: AmazonEnv = amazonEnvSchema.parse({
  AMAZON_SP_CLIENT_ID: process.env.AMAZON_SP_CLIENT_ID,
  AMAZON_SP_CLIENT_SECRET: process.env.AMAZON_SP_CLIENT_SECRET,
  AMAZON_SP_REFRESH_TOKEN: process.env.AMAZON_SP_REFRESH_TOKEN,
  AMAZON_SP_MARKETPLACE_ID: process.env.AMAZON_SP_MARKETPLACE_ID,
  AMAZON_SP_REGION: process.env.AMAZON_SP_REGION,
  AMAZON_SP_TOKEN_URL: process.env.AMAZON_SP_TOKEN_URL
});

export function isAmazonSpConfigured(): boolean {
  return Boolean(
    amazonEnv.AMAZON_SP_CLIENT_ID &&
      amazonEnv.AMAZON_SP_CLIENT_SECRET &&
      amazonEnv.AMAZON_SP_REFRESH_TOKEN
  );
}

export function getAmazonSpApiBaseUrl(): string {
  const hosts: Record<"na" | "eu" | "fe", string> = {
    na: "https://sellingpartnerapi-na.amazon.com",
    eu: "https://sellingpartnerapi-eu.amazon.com",
    fe: "https://sellingpartnerapi-fe.amazon.com"
  };
  return hosts[amazonEnv.AMAZON_SP_REGION];
}
