import { z } from "zod";

const productTypeSchema = z.enum(["SIMPLE", "VARIABLE", "DIGITAL"]);
const productStatusSchema = z.enum(["DRAFT", "ACTIVE", "ARCHIVED"]);

const variantInputSchema = z.object({
  sku: z.string().min(1).max(120),
  mrpInPaise: z.number().int().nonnegative(),
  saleInPaise: z.number().int().nonnegative(),
  mrpUsdCents: z.number().int().nonnegative().optional().nullable(),
  saleUsdCents: z.number().int().nonnegative().optional().nullable(),
  mrpGbpPence: z.number().int().nonnegative().optional().nullable(),
  saleGbpPence: z.number().int().nonnegative().optional().nullable(),
  weightGrams: z.number().int().nonnegative().optional().nullable(),
  isDefault: z.boolean().optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional()
});

export const createProductSchema = z.object({
  slug: z.string().min(1).max(220),
  name: z.string().min(1).max(500),
  description: z.string().optional().nullable(),
  shortDescription: z.string().optional().nullable(),
  productType: productTypeSchema,
  status: productStatusSchema.optional(),
  taxClass: z.string().max(64).optional().nullable(),
  hasAudio: z.boolean().optional(),
  audioUrl: z.string().url().optional().nullable().or(z.literal("")),
  seoTitle: z.string().max(500).optional().nullable(),
  seoDescription: z.string().max(2000).optional().nullable(),
  seoKeyword: z.string().max(500).optional().nullable(),
  wooCommerceId: z.number().int().positive().optional().nullable(),
  categoryIds: z.array(z.string().uuid()).optional(),
  variants: z.array(variantInputSchema).optional()
});

export const updateProductSchema = createProductSchema.partial();

export type CreateProductBody = z.infer<typeof createProductSchema>;
export type UpdateProductBody = z.infer<typeof updateProductSchema>;
