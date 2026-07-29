import { z } from "zod";

const etsyEnvSchema = z.object({
  ETSY_API_KEY: z.string().default("").transform((s) => s.trim()),
  ETSY_SHARED_SECRET: z.string().default("").transform((s) => s.trim()),
  ETSY_ACCESS_TOKEN: z.string().default("").transform((s) => s.trim()),
  ETSY_REFRESH_TOKEN: z.string().default("").transform((s) => s.trim()),
  ETSY_SHOP_ID: z.string().default("").transform((s) => s.trim())
});

export type EtsyEnv = z.infer<typeof etsyEnvSchema>;

export const etsyEnv: EtsyEnv = etsyEnvSchema.parse({
  ETSY_API_KEY: process.env.ETSY_API_KEY,
  ETSY_SHARED_SECRET: process.env.ETSY_SHARED_SECRET,
  ETSY_ACCESS_TOKEN: process.env.ETSY_ACCESS_TOKEN,
  ETSY_REFRESH_TOKEN: process.env.ETSY_REFRESH_TOKEN,
  ETSY_SHOP_ID: process.env.ETSY_SHOP_ID
});

export function isEtsyConfigured(): boolean {
  return Boolean(etsyEnv.ETSY_API_KEY && etsyEnv.ETSY_REFRESH_TOKEN && etsyEnv.ETSY_SHOP_ID);
}

export const ETSY_API_BASE = "https://openapi.etsy.com/v3/application";
export const ETSY_TOKEN_URL = "https://api.etsy.com/v3/public/oauth/token";
