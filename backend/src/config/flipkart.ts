import { z } from "zod";

const flipkartEnvSchema = z.object({
  FLIPKART_API_KEY: z.string().default("").transform((s) => s.trim()),
  FLIPKART_API_SECRET: z.string().default("").transform((s) => s.trim()),
});

export type FlipkartEnv = z.infer<typeof flipkartEnvSchema>;

export const flipkartEnv: FlipkartEnv = flipkartEnvSchema.parse({
  FLIPKART_API_KEY: process.env.FLIPKART_API_KEY,
  FLIPKART_API_SECRET: process.env.FLIPKART_API_SECRET,
});

export function isFlipkartConfigured(): boolean {
  return Boolean(flipkartEnv.FLIPKART_API_KEY && flipkartEnv.FLIPKART_API_SECRET);
}

export const FLIPKART_API_BASE = "https://api.flipkart.net/sellers";
export const FLIPKART_TOKEN_URL = "https://api.flipkart.net/oauth-service/oauth/token";
