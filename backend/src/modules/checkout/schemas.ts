import { z } from "zod";

export const createOrderSchema = z.object({
  email: z.string().email(),
  phone: z.string().min(8).max(20),
  shippingFullName: z.string().min(1).max(200),
  line1: z.string().min(1).max(300),
  line2: z.string().max(300).optional().nullable(),
  city: z.string().min(1).max(120),
  state: z.string().min(1).max(120),
  postalCode: z.string().min(3).max(20),
  country: z.string().min(2).max(2).default("IN")
});

export type CreateOrderBody = z.infer<typeof createOrderSchema>;
