import { z } from "zod";

/**
 * Validated shipping-related environment variables.
 * Empty strings are allowed locally; shipping APIs return structured errors until configured.
 */
const shippingEnvSchema = z.object({
  DELHIVERY_API_KEY: z.string().default(""),
  /** Must be a valid URL when set; empty falls back to Delhivery staging. */
  DELHIVERY_BASE_URL: z
    .string()
    .default("")
    .transform((s) => s.trim())
    .refine(
      (s) => s === "" || z.string().url().safeParse(s).success,
      { message: "DELHIVERY_BASE_URL must be empty or a valid URL" }
    )
    .transform((s) => (s === "" ? "https://staging-express.delhivery.com" : s)),
  /**
   * No strict email() at boot — invalid placeholders in .env were crashing the process.
   * Shiprocket calls still require a real `user@domain` (validated there).
   */
  SHIPROCKET_EMAIL: z
    .string()
    .default("")
    .transform((s) => s.trim()),
  SHIPROCKET_PASSWORD: z.string().default("").transform((s) => s.trim()),
  /** Warehouse / pickup pincode for Shiprocket domestic quotes */
  SHIPPING_ORIGIN_PINCODE: z
    .string()
    .default("560001")
    .transform((s) => s.trim())
    .refine((s) => /^\d{6}$/.test(s), { message: "SHIPPING_ORIGIN_PINCODE must be 6 digits" })
});

export type ShippingEnv = z.infer<typeof shippingEnvSchema>;

export const shippingEnv: ShippingEnv = shippingEnvSchema.parse({
  DELHIVERY_API_KEY: process.env.DELHIVERY_API_KEY,
  DELHIVERY_BASE_URL: process.env.DELHIVERY_BASE_URL,
  SHIPROCKET_EMAIL: process.env.SHIPROCKET_EMAIL,
  SHIPROCKET_PASSWORD: process.env.SHIPROCKET_PASSWORD,
  SHIPPING_ORIGIN_PINCODE: process.env.SHIPPING_ORIGIN_PINCODE
});
