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
    /** India COD logistics surcharge from VariantShippingRate (payment remains online via Razorpay unless you add pure COD later). */
    codDelivery: z.boolean().optional().default(false)
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
