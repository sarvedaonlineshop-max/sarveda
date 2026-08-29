import { z } from "zod";

import { isPlausibleGstin } from "../accounting/vendor-bill-journal.builder";

export const deliveryChallanReasonSchema = z.enum([
  "SUPPLY_DELIVERY",
  "JOB_WORK",
  "SAMPLE",
  "REPLACEMENT",
  "RETURN",
  "OTHER"
]);

export const generateDeliveryChallanBodySchema = z
  .object({
    reason: deliveryChallanReasonSchema.optional().default("SUPPLY_DELIVERY"),
    reasonOther: z.string().max(200).optional().nullable(),
    notes: z.string().max(4000).optional().nullable(),
    buyerGstin: z
      .string()
      .max(20)
      .optional()
      .nullable()
      .transform((v) => {
        const t = v?.trim().toUpperCase() || null;
        return t || null;
      })
      .refine((v) => v == null || isPlausibleGstin(v), { message: "Invalid GSTIN format" }),
    /** When true and a challan already exists, refresh shipment snapshot + rebuild PDF (same number). */
    refreshShipment: z.boolean().optional().default(false)
  })
  .superRefine((val, ctx) => {
    if (val.reason === "OTHER" && !val.reasonOther?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "reasonOther is required when reason is OTHER",
        path: ["reasonOther"]
      });
    }
  });

export type GenerateDeliveryChallanBody = z.infer<typeof generateDeliveryChallanBodySchema>;
