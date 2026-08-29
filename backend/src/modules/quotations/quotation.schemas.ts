import { z } from "zod";

import { isPlausibleGstin } from "../accounting/vendor-bill-journal.builder";

const addressSchema = z.object({
  fullName: z.string().min(1).max(200),
  phone: z.string().max(20).optional().nullable(),
  line1: z.string().min(1).max(300),
  line2: z.string().max(300).optional().nullable(),
  city: z.string().min(1).max(120),
  state: z.string().min(1).max(120),
  postalCode: z.string().min(2).max(20),
  country: z.string().min(2).max(2).default("IN")
});

const lineInputSchema = z.object({
  productId: z.string().uuid().optional().nullable(),
  variantId: z.string().uuid().optional().nullable(),
  productName: z.string().min(1).max(500),
  sku: z.string().max(120).optional().nullable(),
  hsnCode: z.string().max(20).optional().nullable(),
  quantity: z.number().int().min(1).max(100_000),
  unitPriceInPaise: z.number().int().min(0).max(500_000_000),
  discountInPaise: z.number().int().min(0).max(500_000_000).optional().default(0),
  taxClass: z.string().max(40).optional().nullable()
});

export const quotationUpsertSchema = z
  .object({
    customerId: z.string().uuid().optional().nullable(),
    customerName: z.string().min(1).max(200),
    email: z.string().email().max(200).optional().nullable().or(z.literal("")),
    phone: z.string().max(20).optional().nullable(),
    buyerGstin: z.string().max(20).optional().nullable(),
    billingAddress: addressSchema,
    shippingAddress: addressSchema,
    shippingSameAsBilling: z.boolean().optional().default(false),
    currency: z.string().min(3).max(3).default("INR"),
    shippingInPaise: z.number().int().min(0).max(50_000_000).optional().default(0),
    discountInPaise: z.number().int().min(0).max(50_000_000).optional().default(0),
    validUntil: z.string().datetime().optional().nullable().or(z.string().max(40).optional().nullable()),
    terms: z.string().max(8000).optional().nullable(),
    notes: z.string().max(8000).optional().nullable(),
    lines: z.array(lineInputSchema).min(1).max(200)
  })
  .superRefine((data, ctx) => {
    const gstin = data.buyerGstin?.trim();
    if (gstin && !isPlausibleGstin(gstin)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Buyer GSTIN format looks invalid",
        path: ["buyerGstin"]
      });
    }
    for (let i = 0; i < data.lines.length; i++) {
      const line = data.lines[i]!;
      if (line.discountInPaise > line.quantity * line.unitPriceInPaise) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Line discount cannot exceed line gross",
          path: ["lines", i, "discountInPaise"]
        });
      }
    }
  });

export type QuotationUpsertBody = z.infer<typeof quotationUpsertSchema>;
export type QuotationAddress = z.infer<typeof addressSchema>;
export type QuotationLineInput = z.infer<typeof lineInputSchema>;

export const quotationListQuerySchema = z.object({
  status: z
    .enum(["ALL", "DRAFT", "SENT", "ACCEPTED", "EXPIRED", "CANCELLED", "CONVERTED"])
    .optional()
    .default("ALL"),
  q: z.string().max(120).optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(25)
});
