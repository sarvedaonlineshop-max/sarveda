import { z } from "zod";

export const marketplaceChannelCodeSchema = z.enum([
  "AMAZON",
  "FLIPKART",
  "ETSY",
  "AMALA",
  "FIRSTCRY",
  "TATA_1MG",
  "SARVEDA"
]);

export const marketplaceListingStatusSchema = z.enum(["ACTIVE", "PAUSED", "DELISTED"]);
export const marketplaceOrderStatusSchema = z.enum([
  "RECEIVED",
  "CONFIRMED",
  "DISPATCHED",
  "DELIVERED",
  "CANCELLED",
  "RETURN_REQUESTED",
  "RETURNED",
  "REFUNDED"
]);
export const marketplaceDataSourceSchema = z.enum(["MANUAL", "CSV_IMPORT", "EMAIL", "API"]);
export const marketplaceReturnStatusSchema = z.enum(["REQUESTED", "RECEIVED", "REFUNDED", "REJECTED"]);

export const marketplaceListingUpsertSchema = z.object({
  channelCode: marketplaceChannelCodeSchema,
  variantId: z.string().uuid().optional(),
  sku: z.string().trim().min(1).max(120).optional(),
  listingId: z.string().trim().max(200).optional().nullable(),
  externalSku: z.string().trim().max(200).optional().nullable(),
  sellerSku: z.string().trim().max(200).optional().nullable(),
  status: marketplaceListingStatusSchema.optional(),
  isTracked: z.boolean().optional(),
  notes: z.string().trim().max(2000).optional().nullable()
}).refine((v) => Boolean(v.variantId || v.sku), {
  message: "Provide variantId or sku"
});

export const marketplaceListingPatchSchema = z
  .object({
    listingId: z.string().trim().max(200).optional().nullable(),
    externalSku: z.string().trim().max(200).optional().nullable(),
    sellerSku: z.string().trim().max(200).optional().nullable(),
    status: marketplaceListingStatusSchema.optional(),
    isTracked: z.boolean().optional(),
    notes: z.string().trim().max(2000).optional().nullable()
  })
  .refine(
    (v) =>
      v.listingId !== undefined ||
      v.externalSku !== undefined ||
      v.sellerSku !== undefined ||
      v.status !== undefined ||
      v.isTracked !== undefined ||
      v.notes !== undefined,
    { message: "Provide at least one listing field to update" }
  );

export const marketplaceOrderItemInputSchema = z.object({
  sku: z.string().trim().min(1).max(120),
  quantity: z.number().int().min(1).max(10000),
  unitPriceInPaise: z.number().int().min(0).optional().nullable(),
  productName: z.string().trim().max(500).optional().nullable()
});

export const marketplaceOrderCreateSchema = z.object({
  channelCode: marketplaceChannelCodeSchema,
  externalOrderId: z.string().trim().min(1).max(200),
  orderDate: z.string().datetime().or(z.string().date()),
  customerName: z.string().trim().max(300).optional().nullable(),
  customerEmail: z.string().email().optional().nullable(),
  customerPhone: z.string().trim().max(40).optional().nullable(),
  shipToCity: z.string().trim().max(120).optional().nullable(),
  shipToState: z.string().trim().max(120).optional().nullable(),
  shipToCountry: z.string().trim().max(120).optional().nullable(),
  shipToPostalCode: z.string().trim().max(40).optional().nullable(),
  status: marketplaceOrderStatusSchema.optional(),
  source: marketplaceDataSourceSchema.optional(),
  notes: z.string().trim().max(2000).optional().nullable(),
  rawPayload: z.record(z.any()).optional().nullable(),
  items: z.array(marketplaceOrderItemInputSchema).min(1).max(100)
});

export const marketplaceReturnCreateSchema = z.object({
  marketplaceOrderId: z.string().uuid(),
  marketplaceOrderItemId: z.string().uuid().optional().nullable(),
  quantity: z.number().int().min(1).max(10000),
  reason: z.string().trim().max(1000).optional().nullable(),
  status: marketplaceReturnStatusSchema.optional(),
  receivedAt: z.string().datetime().optional().nullable(),
  refundedAmountInPaise: z.number().int().min(0).optional().nullable(),
  restockedToZoho: z.boolean().optional(),
  notes: z.string().trim().max(2000).optional().nullable(),
  rawPayload: z.record(z.any()).optional().nullable()
});

export const marketplaceEmailIngestSchema = z.object({
  channelCode: marketplaceChannelCodeSchema,
  subject: z.string().trim().min(1).max(500),
  bodyText: z.string().trim().min(1).max(50000),
  dedupeKey: z.string().trim().max(200).optional().nullable(),
  metadata: z.record(z.any()).optional().nullable()
});

export const marketplaceImportRowSchema = z.object({
  externalOrderId: z.string().trim().min(1).max(200),
  orderDate: z.string().trim().min(1).max(100),
  sku: z.string().trim().min(1).max(120),
  quantity: z.number().int().min(1).max(10000),
  unitPriceInPaise: z.number().int().min(0).optional().nullable(),
  customerName: z.string().trim().max(300).optional().nullable(),
  customerEmail: z.string().email().optional().nullable(),
  customerPhone: z.string().trim().max(40).optional().nullable(),
  shipToCity: z.string().trim().max(120).optional().nullable(),
  shipToState: z.string().trim().max(120).optional().nullable(),
  shipToCountry: z.string().trim().max(120).optional().nullable(),
  shipToPostalCode: z.string().trim().max(40).optional().nullable(),
  productName: z.string().trim().max(500).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable()
});

export const marketplaceOrdersImportSchema = z.object({
  channelCode: marketplaceChannelCodeSchema,
  csvText: z.string().min(1).max(2_000_000)
});

/** Amazon SP-API order pull into marketplace ledger. */
export const amazonOrdersSyncSchema = z.preprocess(
  (v) => (v == null || typeof v !== "object" ? {} : v),
  z.object({
    /** ISO datetime; defaults to now - daysBack (single-window sync only). */
    createdAfter: z.string().datetime().optional(),
    createdBefore: z.string().datetime().optional(),
    /** Used when createdAfter omitted for a single window. Prefer monthsBack for full marketplace sync. */
    daysBack: z.number().int().min(1).max(730).optional(),
    /** Month-by-month sync depth for sync-all (avoids SP-API timeouts). */
    monthsBack: z.number().int().min(1).max(36).optional(),
    /** Amazon OrderStatuses; default open: Unshipped, PartiallyShipped, Pending. */
    orderStatuses: z.array(z.string().trim().min(1).max(40)).max(10).optional(),
    /** When true and orderStatuses omitted, fetch all statuses in the window. */
    includeShipped: z.boolean().optional(),
    maxPages: z.number().int().min(1).max(50).optional(),
    maxPagesPerMonth: z.number().int().min(1).max(20).optional()
  })
);

export type MarketplaceChannelCodeInput = z.infer<typeof marketplaceChannelCodeSchema>;
