import { z } from "zod";

import { isPlausibleGstin } from "../accounting/vendor-bill-journal.builder";

export const ewaySourceDocumentTypeSchema = z.enum(["TAX_INVOICE", "DELIVERY_CHALLAN"]);
export const ewayTransportModeSchema = z.enum(["ROAD", "RAIL", "AIR", "SHIP"]);

/** Conservative EBN shape: 12 digits (current portal convention). Digits only after trim. */
export function isPlausibleEbn(raw: string | null | undefined): boolean {
  if (!raw?.trim()) return false;
  return /^\d{12}$/.test(raw.trim());
}

const optionalGstin = z
  .string()
  .max(20)
  .optional()
  .nullable()
  .transform((v) => {
    const t = v?.trim().toUpperCase() || null;
    return t || null;
  })
  .refine((v) => v == null || isPlausibleGstin(v), { message: "Invalid GSTIN format" });

const optionalEbn = z
  .string()
  .max(20)
  .optional()
  .nullable()
  .transform((v) => {
    const t = v?.trim() || null;
    return t;
  })
  .refine((v) => v == null || isPlausibleEbn(v), {
    message: "EBN must be the 12-digit number issued by the government portal"
  });

const itemOverrideSchema = z.object({
  sortOrder: z.number().int().min(0),
  unitOfMeasure: z.string().min(1).max(20).optional()
});

const transportFieldsSchema = z.object({
  buyerGstin: optionalGstin,
  transporterName: z.string().max(200).optional().nullable(),
  transporterId: z.string().max(20).optional().nullable(),
  transportDocNo: z.string().max(80).optional().nullable(),
  transportDocDate: z.string().datetime().optional().nullable().or(z.literal("")),
  transportMode: ewayTransportModeSchema.optional().nullable(),
  vehicleNumber: z.string().max(40).optional().nullable(),
  vehicleType: z.string().max(40).optional().nullable(),
  approxDistanceKm: z.number().int().min(0).max(20000).optional().nullable(),
  transactionType: z.string().max(40).optional().nullable(),
  subSupplyType: z.string().max(80).optional().nullable(),
  subSupplyDesc: z.string().max(200).optional().nullable(),
  notes: z.string().max(4000).optional().nullable(),
  shipmentId: z.string().uuid().optional().nullable(),
  itemOverrides: z.array(itemOverrideSchema).max(200).optional()
});

export const ewayReviewQuerySchema = z.object({
  sourceDocumentType: ewaySourceDocumentTypeSchema
});

export const ewayPrepareBodySchema = transportFieldsSchema.extend({
  sourceDocumentType: ewaySourceDocumentTypeSchema
});

export const ewayRecordEbnBodySchema = transportFieldsSchema.extend({
  sourceDocumentType: ewaySourceDocumentTypeSchema.optional(),
  ebn: z
    .string()
    .min(1)
    .max(20)
    .transform((v) => v.trim())
    .refine(isPlausibleEbn, {
      message: "EBN must be the 12-digit number issued by the government portal"
    }),
  ewbDate: z.string().min(8).max(40),
  validUntil: z.string().max(40).optional().nullable().or(z.literal(""))
});

export const ewayUpdateTransportBodySchema = transportFieldsSchema;

export const ewayMarkNotRequiredBodySchema = z.object({
  notes: z.string().max(4000).optional().nullable()
});

export const ewayCancelBodySchema = z.object({
  confirmedPortalCancelled: z.literal(true),
  notes: z.string().max(4000).optional().nullable()
});

export type EwayPrepareBody = z.infer<typeof ewayPrepareBodySchema>;
export type EwayRecordEbnBody = z.infer<typeof ewayRecordEbnBodySchema>;
export type EwayUpdateTransportBody = z.infer<typeof ewayUpdateTransportBodySchema>;
