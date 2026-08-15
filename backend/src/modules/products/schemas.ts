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

const variantAttributeSchema = z.object({
  name: z.string().min(1).max(120),
  slug: z.string().min(1).max(120).optional(),
  value: z.string().min(1).max(200)
});

const imageAdminSchema = z.object({
  id: z.string().uuid().optional(),
  url: z.string().min(1).max(2000),
  altText: z.string().max(500).optional().nullable(),
  position: z.number().int().min(0).optional(),
  isPrimary: z.boolean().optional(),
  variantId: z.string().uuid().optional().nullable(),
  variantSku: z.string().max(120).optional().nullable()
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
  shippingRates: z.array(shippingRateSchema).optional(),
  videoUrl: z.union([z.string().url().max(2000), z.literal(""), z.null()]).optional(),
  audioUrl: z.union([z.string().url().max(2000), z.literal(""), z.null()]).optional(),
  attributes: z.array(variantAttributeSchema).optional(),
  images: z.array(imageAdminSchema).optional()
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
  hsnCode: z.string().max(16).optional().nullable(),
  hasAudio: z.boolean().optional(),
  audioUrl: z
    .union([z.string().url().max(2000), z.literal(""), z.null()])
    .optional(),
  videoUrl: z
    .union([z.string().url().max(2000), z.literal(""), z.null()])
    .optional(),
  expressShippingEnabled: z.boolean().optional(),
  relatedArticleSlugs: z.array(z.string().min(1).max(220)).optional(),
  seoTitle: z.string().max(500).optional().nullable(),
  seoDescription: z.string().max(2000).optional().nullable(),
  seoKeyword: z.string().max(500).optional().nullable(),
  wooCommerceId: z.number().int().positive().optional().nullable(),
  categoryIds: z.array(z.string().uuid()).optional(),
  variantAxisOrder: z.array(z.string().min(1).max(120)).optional(),
  variants: z.array(variantInputSchema).optional(),
  images: z.array(imageAdminSchema).optional(),
  accordionItems: z.array(accordionAdminSchema).optional()
});

export const updateProductSchema = createProductSchema.partial();

export const productAdminSaveSchema = createProductSchema;

export const reorderProductsSchema = z.object({
  categorySlug: z
    .union([z.string().max(220), z.null()])
    .optional()
    .transform((v) => (v == null || String(v).trim() === "" ? null : String(v).trim())),
  orderedIds: z.array(z.string().uuid()).min(1).max(2000)
});

export type CreateProductBody = z.infer<typeof createProductSchema>;
export type UpdateProductBody = z.infer<typeof updateProductSchema>;
export type ReorderProductsBody = z.infer<typeof reorderProductsSchema>;

