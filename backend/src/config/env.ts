import { z } from "zod";

const nodeEnv = process.env.NODE_ENV ?? "development";
const isProdNode = nodeEnv === "production";
const hasShiprocketCreds = Boolean(
  process.env.SHIPROCKET_EMAIL?.trim() && process.env.SHIPROCKET_PASSWORD?.trim()
);

/** Empty / unset → `defaultWhenUnset`; explicit 1/true/yes or 0/false/no overrides. */
function triStateFlag(envVal: string | undefined, defaultWhenUnset: boolean): boolean {
  const v = (envVal ?? "").trim().toLowerCase();
  if (["1", "true", "yes"].includes(v)) return true;
  if (["0", "false", "no"].includes(v)) return false;
  return defaultWhenUnset;
}

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
  /** Must match a pickup location name in Shiprocket → Settings → Pickup locations (default "Primary"). */
  SHIPROCKET_PICKUP_LOCATION: z
    .string()
    .default("Primary")
    .transform((s) => s.trim() || "Primary"),
  SHIPPING_ORIGIN_PINCODE: z.string().default("").transform((s) => s.trim()),
  /**
   * When true, Bluedart/DTDC stub branches are skipped; domestic uses Shiprocket (or Delhivery heavy lane).
   * Unset in production defaults to true (real labels only). Unset in dev defaults to false.
   */
  SHIPPING_DISABLE_STUBS: z
    .string()
    .default("")
    .transform((s) => triStateFlag(s, isProdNode)),
  /**
   * Before Razorpay: verify Shiprocket has at least one courier for pickup→delivery PIN (India only).
   * Unset in production defaults to true when Shiprocket credentials exist. Set to 0 to skip (e.g. local dev).
   */
  INDIA_REQUIRE_SHIPROCKET_SERVICEABILITY: z
    .string()
    .default("")
    .transform((s) => triStateFlag(s, isProdNode && hasShiprocketCreds)),
  /** If true, checkout create-order rejects non-IN shipping country (India-only storefront). */
  INDIA_CHECKOUT_ONLY: z
    .string()
    .default("")
    .transform((s) => triStateFlag(s, false)),
  /**
   * Shiprocket webhook: Shiprocket sends this header name + matching value (Settings → API → Webhook).
   * Production: strongly recommended — webhook rejects requests without match when secret is set.
   */
  SHIPROCKET_WEBHOOK_HEADER: z
    .string()
    .default("X-Shiprocket-Webhook-Secret")
    .transform((s) => s.trim() || "X-Shiprocket-Webhook-Secret"),
  SHIPROCKET_WEBHOOK_SECRET: z.string().default("").transform((s) => s.trim())
});

export type ShippingEnv = z.infer<typeof shippingEnvSchema>;

export const shippingEnv: ShippingEnv = shippingEnvSchema.parse({
  DELHIVERY_API_KEY: process.env.DELHIVERY_API_KEY,
  DELHIVERY_BASE_URL: process.env.DELHIVERY_BASE_URL,
  SHIPROCKET_EMAIL: process.env.SHIPROCKET_EMAIL,
  SHIPROCKET_PASSWORD: process.env.SHIPROCKET_PASSWORD,
  SHIPROCKET_PICKUP_LOCATION: process.env.SHIPROCKET_PICKUP_LOCATION,
  SHIPPING_ORIGIN_PINCODE: process.env.SHIPPING_ORIGIN_PINCODE,
  SHIPPING_DISABLE_STUBS: process.env.SHIPPING_DISABLE_STUBS,
  INDIA_REQUIRE_SHIPROCKET_SERVICEABILITY: process.env.INDIA_REQUIRE_SHIPROCKET_SERVICEABILITY,
  INDIA_CHECKOUT_ONLY: process.env.INDIA_CHECKOUT_ONLY,
  SHIPROCKET_WEBHOOK_HEADER: process.env.SHIPROCKET_WEBHOOK_HEADER,
  SHIPROCKET_WEBHOOK_SECRET: process.env.SHIPROCKET_WEBHOOK_SECRET
});
