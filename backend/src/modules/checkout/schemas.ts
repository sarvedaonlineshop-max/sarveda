import { z } from "zod";

export const createOrderSchema = z
  .object({
    email: z.string().email(),
    phone: z.string().min(8).max(20),
    shippingFullName: z.string().min(1).max(200),
    line1: z.string().min(1).max(300),
    line2: z.string().max(300).optional().nullable(),
    city: z.string().min(1).max(120),
    state: z.string().min(1).max(120),
    postalCode: z.string().min(3).max(20),
    country: z.string().min(2).max(2).default("IN"),
    /** India COD shipping surcharge (VariantShippingRate). */
    codDelivery: z.boolean().optional().default(false),
    /** `cod` = cash on delivery (India only). Default online Razorpay. */
    paymentMethod: z.enum(["razorpay", "cod"]).optional().default("razorpay")
  })
  .superRefine((data, ctx) => {
    if (data.paymentMethod === "cod" && data.country.toUpperCase() !== "IN") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Cash on delivery is available for India only.",
        path: ["paymentMethod"]
      });
    }
  })
  .superRefine((data, ctx) => {
    if (data.country.toUpperCase() === "IN") {
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
