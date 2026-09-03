import { z } from "zod";

export const cartAddSchema = z
  .object({
    variantId: z.string().uuid().optional(),
    digitalOfferId: z.string().uuid().optional(),
    quantity: z.coerce.number().int().min(1).max(999)
  })
  .superRefine((val, ctx) => {
    const hasVariant = Boolean(val.variantId);
    const hasDigital = Boolean(val.digitalOfferId);
    if (hasVariant === hasDigital) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provide exactly one of variantId or digitalOfferId",
        path: ["variantId"]
      });
    }
  });

export const cartUpdateSchema = z
  .object({
    variantId: z.string().uuid().optional(),
    digitalOfferId: z.string().uuid().optional(),
    quantity: z.coerce.number().int().min(0).max(999)
  })
  .superRefine((val, ctx) => {
    const hasVariant = Boolean(val.variantId);
    const hasDigital = Boolean(val.digitalOfferId);
    if (hasVariant === hasDigital) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provide exactly one of variantId or digitalOfferId",
        path: ["variantId"]
      });
    }
  });

export const cartCouponSchema = z.object({
  code: z.string().min(2).max(64),
  /** Guest checkout: validate per-user coupon limits by email. */
  email: z.string().email().optional()
});

export type CartAddBody = z.infer<typeof cartAddSchema>;
export type CartUpdateBody = z.infer<typeof cartUpdateSchema>;
export type CartCouponBody = z.infer<typeof cartCouponSchema>;
