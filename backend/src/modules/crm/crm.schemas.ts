import {
  CrmAccountKind,
  CrmActivityType,
  CrmDealStatus,
  CrmLeadSource,
  CrmLeadStatus,
  CrmStageType,
  CrmTaskPriority,
  CrmTaskStatus
} from "@prisma/client";
import { z } from "zod";

const optionalTrimmed = z
  .string()
  .max(2000)
  .optional()
  .nullable()
  .transform((v) => (v == null || v.trim() === "" ? null : v.trim()));

const optionalEmail = z
  .union([z.string().email().max(200), z.literal(""), z.null()])
  .optional()
  .transform((v) => (v == null || v === "" ? null : v.trim().toLowerCase()));

const optionalPhone = z
  .string()
  .max(40)
  .optional()
  .nullable()
  .transform((v) => (v == null || v.trim() === "" ? null : v.trim()));

const uuidOpt = z.string().uuid().optional().nullable();
const nonNegInt = z.number().int().min(0);
const moneyOpt = z.number().int().min(0).optional().nullable();
const dateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .optional()
  .nullable();
const dateTimeOpt = z
  .union([z.string().datetime(), z.string().regex(/^\d{4}-\d{2}-\d{2}/)])
  .optional()
  .nullable();

const jsonOpt = z.unknown().optional().nullable();

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(25),
  sortBy: z.string().max(40).optional(),
  sortOrder: z.enum(["asc", "desc"]).optional().default("desc")
});

export const createPipelineSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: optionalTrimmed,
  isDefault: z.boolean().optional(),
  isActive: z.boolean().optional()
});

export const updatePipelineSchema = createPipelineSchema
  .partial()
  .refine((o) => Object.keys(o).length > 0, { message: "At least one field required" });

export const createStageSchema = z.object({
  name: z.string().trim().min(1).max(120),
  stageType: z.nativeEnum(CrmStageType).optional(),
  position: z.number().int().min(0).optional(),
  probabilityPercent: z.number().int().min(0).max(100).optional(),
  isActive: z.boolean().optional()
});

export const updateStageSchema = createStageSchema
  .partial()
  .refine((o) => Object.keys(o).length > 0, { message: "At least one field required" });

export const createLeadSchema = z.object({
  name: z.string().trim().min(1).max(200),
  companyName: optionalTrimmed,
  email: optionalEmail,
  phone: optionalPhone,
  whatsappPhone: optionalPhone,
  designation: optionalTrimmed,
  city: optionalTrimmed,
  state: optionalTrimmed,
  country: z.string().trim().max(2).optional().nullable(),
  source: z.nativeEnum(CrmLeadSource).optional(),
  ownerUserId: uuidOpt,
  estimatedValueInPaise: moneyOpt,
  currency: z.string().trim().max(3).optional(),
  expectedCloseDate: dateOnly,
  interestSummary: optionalTrimmed,
  attributionJson: jsonOpt,
  customFields: jsonOpt,
  enquiryThreadId: uuidOpt,
  nextFollowUpAt: dateTimeOpt,
  status: z.nativeEnum(CrmLeadStatus).optional()
});

export const updateLeadSchema = createLeadSchema
  .partial()
  .extend({
    lostReason: optionalTrimmed,
    lastContactedAt: dateTimeOpt
  })
  .refine((o) => Object.keys(o).length > 0, { message: "At least one field required" });

export const leadListQuerySchema = paginationQuerySchema.extend({
  search: z.string().max(120).optional(),
  q: z.string().max(120).optional(),
  status: z.nativeEnum(CrmLeadStatus).optional(),
  source: z.nativeEnum(CrmLeadSource).optional(),
  ownerUserId: z.string().uuid().optional(),
  createdFrom: dateTimeOpt,
  createdTo: dateTimeOpt,
  nextFollowUpFrom: dateTimeOpt,
  nextFollowUpTo: dateTimeOpt
});

export const createAccountSchema = z.object({
  kind: z.nativeEnum(CrmAccountKind).optional(),
  name: z.string().trim().min(1).max(200),
  displayName: optionalTrimmed,
  industry: optionalTrimmed,
  website: optionalTrimmed,
  email: optionalEmail,
  phone: optionalPhone,
  whatsappPhone: optionalPhone,
  gstin: optionalTrimmed,
  billingAddress: jsonOpt,
  shippingAddress: jsonOpt,
  ownerUserId: uuidOpt,
  source: z.nativeEnum(CrmLeadSource).optional().nullable(),
  notes: optionalTrimmed,
  customFields: jsonOpt,
  isActive: z.boolean().optional()
});

export const updateAccountSchema = createAccountSchema
  .partial()
  .refine((o) => Object.keys(o).length > 0, { message: "At least one field required" });

export const accountListQuerySchema = paginationQuerySchema.extend({
  search: z.string().max(120).optional(),
  q: z.string().max(120).optional(),
  ownerUserId: z.string().uuid().optional(),
  isActive: z
    .union([z.literal("true"), z.literal("false"), z.boolean()])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === true || v === "true"))
});

export const createContactSchema = z.object({
  accountId: uuidOpt,
  linkedUserId: uuidOpt,
  firstName: optionalTrimmed,
  lastName: optionalTrimmed,
  displayName: z.string().trim().min(1).max(200),
  email: optionalEmail,
  phone: optionalPhone,
  whatsappPhone: optionalPhone,
  designation: optionalTrimmed,
  department: optionalTrimmed,
  preferredLanguage: optionalTrimmed,
  ownerUserId: uuidOpt,
  source: z.nativeEnum(CrmLeadSource).optional().nullable(),
  notes: optionalTrimmed,
  customFields: jsonOpt,
  isActive: z.boolean().optional()
});

export const updateContactSchema = createContactSchema
  .partial()
  .refine((o) => Object.keys(o).length > 0, { message: "At least one field required" });

export const contactListQuerySchema = paginationQuerySchema.extend({
  search: z.string().max(120).optional(),
  q: z.string().max(120).optional(),
  accountId: z.string().uuid().optional(),
  ownerUserId: z.string().uuid().optional(),
  isActive: z
    .union([z.literal("true"), z.literal("false"), z.boolean()])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === true || v === "true"))
});

export const createDealSchema = z.object({
  name: z.string().trim().min(1).max(200),
  pipelineId: z.string().uuid(),
  stageId: z.string().uuid(),
  accountId: uuidOpt,
  contactId: uuidOpt,
  sourceLeadId: uuidOpt,
  ownerUserId: uuidOpt,
  amountInPaise: nonNegInt.optional(),
  currency: z.string().trim().max(3).optional(),
  probabilityPercent: z.number().int().min(0).max(100).optional().nullable(),
  expectedCloseDate: dateOnly,
  notes: optionalTrimmed,
  customFields: jsonOpt,
  lostReason: optionalTrimmed
});

export const updateDealSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    pipelineId: z.string().uuid().optional(),
    stageId: z.string().uuid().optional(),
    accountId: uuidOpt,
    contactId: uuidOpt,
    ownerUserId: uuidOpt,
    amountInPaise: nonNegInt.optional(),
    currency: z.string().trim().max(3).optional(),
    probabilityPercent: z.number().int().min(0).max(100).optional().nullable(),
    expectedCloseDate: dateOnly,
    notes: optionalTrimmed,
    customFields: jsonOpt,
    lostReason: optionalTrimmed,
    status: z.nativeEnum(CrmDealStatus).optional()
  })
  .refine((o) => Object.keys(o).length > 0, { message: "At least one field required" });

export const dealListQuerySchema = paginationQuerySchema.extend({
  search: z.string().max(120).optional(),
  q: z.string().max(120).optional(),
  pipelineId: z.string().uuid().optional(),
  stageId: z.string().uuid().optional(),
  status: z.nativeEnum(CrmDealStatus).optional(),
  ownerUserId: z.string().uuid().optional(),
  accountId: z.string().uuid().optional(),
  contactId: z.string().uuid().optional(),
  expectedCloseFrom: dateOnly,
  expectedCloseTo: dateOnly,
  minAmountInPaise: moneyOpt,
  maxAmountInPaise: moneyOpt
});

export const dealProductSchema = z.object({
  variantId: uuidOpt,
  productName: z.string().trim().min(1).max(300).optional(),
  sku: optionalTrimmed,
  quantity: z.number().int().min(1).optional(),
  unitPriceInPaise: nonNegInt.optional(),
  discountInPaise: nonNegInt.optional(),
  sortOrder: z.number().int().min(0).optional()
});

export const updateDealProductSchema = dealProductSchema
  .partial()
  .refine((o) => Object.keys(o).length > 0, { message: "At least one field required" });

export const convertLeadSchema = z.object({
  createAccount: z.boolean().optional().default(true),
  existingAccountId: uuidOpt,
  account: createAccountSchema.partial().optional(),
  createContact: z.boolean().optional().default(true),
  existingContactId: uuidOpt,
  contact: createContactSchema.partial().optional(),
  createDeal: z.boolean().optional().default(true),
  deal: createDealSchema.partial().extend({
    pipelineId: z.string().uuid().optional(),
    stageId: z.string().uuid().optional(),
    name: z.string().trim().min(1).max(200).optional()
  }).optional()
});

export const createActivitySchema = z.object({
  type: z.nativeEnum(CrmActivityType),
  subject: optionalTrimmed,
  body: optionalTrimmed,
  occurredAt: dateTimeOpt,
  accountId: uuidOpt,
  contactId: uuidOpt,
  leadId: uuidOpt,
  dealId: uuidOpt,
  enquiryThreadId: uuidOpt,
  quotationId: uuidOpt,
  orderId: uuidOpt,
  externalProvider: optionalTrimmed,
  externalRef: optionalTrimmed,
  metadata: jsonOpt
});

export const activityListQuerySchema = paginationQuerySchema.extend({
  accountId: z.string().uuid().optional(),
  contactId: z.string().uuid().optional(),
  leadId: z.string().uuid().optional(),
  dealId: z.string().uuid().optional(),
  type: z.nativeEnum(CrmActivityType).optional()
});

export const createTaskSchema = z.object({
  title: z.string().trim().min(1).max(300),
  description: optionalTrimmed,
  status: z.nativeEnum(CrmTaskStatus).optional(),
  priority: z.nativeEnum(CrmTaskPriority).optional(),
  dueAt: dateTimeOpt,
  reminderAt: dateTimeOpt,
  assignedToUserId: uuidOpt,
  accountId: uuidOpt,
  contactId: uuidOpt,
  leadId: uuidOpt,
  dealId: uuidOpt
});

export const updateTaskSchema = createTaskSchema
  .partial()
  .refine((o) => Object.keys(o).length > 0, { message: "At least one field required" });

export const taskListQuerySchema = paginationQuerySchema.extend({
  assignedToUserId: z.string().uuid().optional(),
  status: z.nativeEnum(CrmTaskStatus).optional(),
  priority: z.nativeEnum(CrmTaskPriority).optional(),
  dueFrom: dateTimeOpt,
  dueTo: dateTimeOpt,
  leadId: z.string().uuid().optional(),
  dealId: z.string().uuid().optional(),
  accountId: z.string().uuid().optional(),
  contactId: z.string().uuid().optional(),
  overdue: z
    .union([z.literal("true"), z.literal("false"), z.boolean()])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === true || v === "true"))
});

export const linkQuotationSchema = z.object({
  quotationId: z.string().uuid()
});

export const linkOrderSchema = z.object({
  orderId: z.string().uuid()
});

export type CreateLeadInput = z.infer<typeof createLeadSchema>;
export type UpdateLeadInput = z.infer<typeof updateLeadSchema>;
export type ConvertLeadInput = z.infer<typeof convertLeadSchema>;
