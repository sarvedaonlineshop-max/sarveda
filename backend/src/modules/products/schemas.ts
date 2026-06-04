import { z } from "zod";

const productTypeSchema = z.enum(["SIMPLE", "VARIABLE", "DIGITAL"]);
const productStatusSchema = z.enum(["DRAFT", "ACTIVE", "ARCHIVED"]);

const shippingRateSchema = z.object({
  country: z.enum(["IN", "US", "GB", "OTHER"]),
  standardPerProduct: z.number().int().nonnegative(),
  standardAdditional: z.number().int().nonnegative(),
  codPerProduct: z.number().int().nonnegative().optional().nullable(),
  codAdditional: z.number().int().nonnegative().optional().nullable(),
  estimatedDays: z.string().max(64).optional().nullable()
});

const variantInputSchema = z.object({
  id: z.string().uuid().optional(),
  sku: z.string().min(1).max(120),
  mrpInPaise: z.number().int().nonnegative(),
  saleInPaise: z.number().int().nonnegative(),
  mrpUsdCents: z.number().int().nonnegative().optional().nullable(),
  saleUsdCents: z.number().int().nonnegative().optional().nullable(),
  mrpGbpPence: z.number().int().nonnegative().optional().nullable(),
  saleGbpPence: z.number().int().nonnegative().optional().nullable(),
  weightGrams: z.number().int().nonnegative().optional().nullable(),
  isDefault: z.boolean().optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
  onHand: z.number().int().min(0).optional(),
  shippingRates: z.array(shippingRateSchema).optional()
});

const imageAdminSchema = z.object({
  id: z.string().uuid().optional(),
  url: z.string().min(1).max(2000),
  altText: z.string().max(500).optional().nullable(),
  position: z.number().int().min(0).optional(),
  isPrimary: z.boolean().optional()
});

const accordionAdminSchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().min(1).max(300),
  content: z.string(),
  position: z.number().int().min(0).optional()
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
  audioUrl: z
    .union([z.string().url().max(2000), z.literal(""), z.null()])
    .optional(),
  seoTitle: z.string().max(500).optional().nullable(),
  seoDescription: z.string().max(2000).optional().nullable(),
  seoKeyword: z.string().max(500).optional().nullable(),
  wooCommerceId: z.number().int().positive().optional().nullable(),
  categoryIds: z.array(z.string().uuid()).optional(),
  variants: z.array(variantInputSchema).optional(),
  images: z.array(imageAdminSchema).optional(),
  accordionItems: z.array(accordionAdminSchema).optional()
});

export const updateProductSchema = createProductSchema.partial();

export const productAdminSaveSchema = createProductSchema;

export type CreateProductBody = z.infer<typeof createProductSchema>;
export type UpdateProductBody = z.infer<typeof updateProductSchema>;
