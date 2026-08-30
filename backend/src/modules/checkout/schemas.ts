import { z } from "zod";

export const createOrderSchema = z
  .object({
    email: z.string().email(),
    phone: z.string().min(8).max(20),
    shippingFullName: z.string().min(1).max(200),
    line1: z.string().min(1).max(300),
    line2: z.string().max(300).optional().nullable(),
    city: z.string().max(120).optional().default(""),
    state: z.string().max(120).optional().default(""),
    postalCode: z.string().max(20).optional().default(""),
    country: z.string().min(2).max(2).default("IN"),
    /** India COD shipping surcharge (VariantShippingRate). */
    codDelivery: z.boolean().optional().default(false),
    giftWrap: z.boolean().optional().default(false),
    customerNotes: z.string().max(2000).optional().nullable(),
    /** India: razorpay | cod. International: stripe | paypal. */
    paymentMethod: z
      .enum(["razorpay", "cod", "stripe", "paypal"])
      .optional()
      .default("razorpay"),
    /**
     * Optional marketing attribution snapshot (informational only).
     * Accepted as unknown — sanitized in checkout service; never fails order creation.
     */
    attribution: z.unknown().optional().nullable()
  })
  .superRefine((data, ctx) => {
    const cc = data.country.toUpperCase();
    if (data.paymentMethod === "cod" && cc !== "IN") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Cash on delivery is available for India only.",
        path: ["paymentMethod"]
      });
    }
    if (cc === "IN" && (data.paymentMethod === "stripe" || data.paymentMethod === "paypal")) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Use Razorpay or COD for India orders.",
        path: ["paymentMethod"]
      });
    }
    if (cc !== "IN" && (data.paymentMethod === "razorpay" || data.paymentMethod === "cod")) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "International orders use Stripe or PayPal.",
        path: ["paymentMethod"]
      });
    }
  })
  .superRefine((data, ctx) => {
    const cc = data.country.toUpperCase();
    if (cc === "IN") {
      if (!data.city.trim() || data.city.trim().length < 2) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "City is required for India orders.",
          path: ["city"]
        });
      }
      if (!data.state.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "State is required for India orders.",
          path: ["state"]
        });
      }
      const pin = data.postalCode.replace(/\D/g, "");
      if (pin.length !== 6) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "PIN code must be exactly 6 digits for India.",
          path: ["postalCode"]
        });
      }
    }
  });

export type CreateOrderBody = z.infer<typeof createOrderSchema>;
