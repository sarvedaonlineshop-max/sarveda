import { z } from "zod";

export const cartAddSchema = z.object({
  variantId: z.string().uuid(),
  quantity: z.coerce.number().int().min(1).max(999)
});

export const cartUpdateSchema = z.object({
  variantId: z.string().uuid(),
  quantity: z.coerce.number().int().min(0).max(999)
});

export const cartCouponSchema = z.object({
  code: z.string().min(2).max(64),
  /** Guest checkout: validate per-user coupon limits by email. */
  email: z.string().email().optional()
});

export type CartAddBody = z.infer<typeof cartAddSchema>;
export type CartUpdateBody = z.infer<typeof cartUpdateSchema>;
export type CartCouponBody = z.infer<typeof cartCouponSchema>;
