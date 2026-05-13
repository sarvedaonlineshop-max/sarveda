import { z } from "zod";

/**
 * Validated shipping-related environment variables.
 * Empty strings are allowed locally; shipping APIs return structured errors until configured.
 */
const shippingEnvSchema = z.object({
  DELHIVERY_API_KEY: z.string().default(""),
  DELHIVERY_BASE_URL: z
    .string()
    .url()
    .default("https://staging-express.delhivery.com"),
  SHIPROCKET_EMAIL: z.union([z.string().email(), z.literal("")]).default(""),
  SHIPROCKET_PASSWORD: z.string().default(""),
  /** Warehouse / pickup pincode for Shiprocket domestic quotes */
  SHIPPING_ORIGIN_PINCODE: z.string().regex(/^\d{6}$/).default("560001")
});

export type ShippingEnv = z.infer<typeof shippingEnvSchema>;

export const shippingEnv: ShippingEnv = shippingEnvSchema.parse({
  DELHIVERY_API_KEY: process.env.DELHIVERY_API_KEY,
  DELHIVERY_BASE_URL: process.env.DELHIVERY_BASE_URL,
  SHIPROCKET_EMAIL: process.env.SHIPROCKET_EMAIL,
  SHIPROCKET_PASSWORD: process.env.SHIPROCKET_PASSWORD,
  SHIPPING_ORIGIN_PINCODE: process.env.SHIPPING_ORIGIN_PINCODE
});
