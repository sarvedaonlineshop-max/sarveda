import type { NextFunction, Request, Response } from "express";
import { z } from "zod";

import { prisma } from "../../config/db";

const optionalAddr = z.string().max(500).optional();
const weekday = z.enum(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);

const pickupFields = {
  label: z.string().min(1).max(200),
  shiprocketPickupName: z.string().min(1).max(200),
  delhiveryPickupName: z.string().max(200).optional().nullable(),
  contactPerson: z.string().max(200).optional().nullable(),
  phone: z.string().max(20).optional().nullable(),
  email: z.string().email().max(200).optional().nullable().or(z.literal("")),
  line1: optionalAddr.nullable(),
  line2: optionalAddr.nullable(),
  city: z.string().max(100).optional().nullable(),
  state: z.string().max(100).optional().nullable(),
  postalCode: z.string().max(20).optional().nullable(),
  country: z.string().max(2).optional(),
  defaultPickupSlot: z.string().max(120).optional().nullable(),
  workingDays: z.array(weekday).optional().nullable(),
  returnSameAsPickup: z.boolean().optional(),
  returnLine1: optionalAddr.nullable(),
  returnLine2: optionalAddr.nullable(),
  returnCity: z.string().max(100).optional().nullable(),
  returnState: z.string().max(100).optional().nullable(),
  returnPostalCode: z.string().max(20).optional().nullable(),
  returnCountry: z.string().max(2).optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
  isPrimary: z.boolean().optional(),
  sortOrder: z.number().int().optional()
};

export const createPickupLocationSchema = z.object(pickupFields);

export const updatePickupLocationSchema = z
  .object({
    ...Object.fromEntries(
      Object.entries(pickupFields).map(([k, v]) => [k, v.optional()])
    ),
    isActive: z.boolean().optional()
  })
  .refine((o) => Object.keys(o).length > 0, { message: "At least one field is required" });

function normalizeBody(body: z.infer<typeof createPickupLocationSchema>) {
  return {
    label: body.label.trim(),
    shiprocketPickupName: body.shiprocketPickupName.trim(),
    delhiveryPickupName: body.delhiveryPickupName?.trim() || null,
    contactPerson: body.contactPerson?.trim() || null,
    phone: body.phone?.trim() || null,
    email: body.email?.trim() || null,
    line1: body.line1?.trim() || null,
    line2: body.line2?.trim() || null,
    city: body.city?.trim() || null,
    state: body.state?.trim() || null,
    postalCode: body.postalCode?.trim() || null,
    country: (body.country?.trim() || "IN").toUpperCase(),
    defaultPickupSlot: body.defaultPickupSlot?.trim() || null,
    workingDays: body.workingDays?.length ? body.workingDays : null,
    returnSameAsPickup: body.returnSameAsPickup ?? true,
    returnLine1: body.returnLine1?.trim() || null,
    returnLine2: body.returnLine2?.trim() || null,
    returnCity: body.returnCity?.trim() || null,
    returnState: body.returnState?.trim() || null,
    returnPostalCode: body.returnPostalCode?.trim() || null,
    returnCountry: body.returnCountry?.trim() || null,
    notes: body.notes?.trim() || null,
    isPrimary: body.isPrimary ?? false,
    sortOrder: body.sortOrder ?? 0
  };
}

export async function listPickupLocations(req: Request, res: Response, next: NextFunction) {
  try {
    const activeOnly =
      String(req.query.activeOnly ?? "") === "1" || String(req.query.activeOnly).toLowerCase() === "true";
    const q = typeof req.query.q === "string" ? req.query.q.trim().toLowerCase() : "";
    const status = typeof req.query.status === "string" ? req.query.status.toLowerCase() : "";

    const rows = await prisma.pickupLocation.findMany({
      where: {
        ...(activeOnly ? { isActive: true } : {}),
        ...(status === "active" ? { isActive: true } : {}),
        ...(status === "inactive" ? { isActive: false } : {}),
        ...(q
          ? {
              OR: [
                { label: { contains: q, mode: "insensitive" } },
                { city: { contains: q, mode: "insensitive" } },
                { delhiveryPickupName: { contains: q, mode: "insensitive" } },
                { shiprocketPickupName: { contains: q, mode: "insensitive" } }
              ]
            }
          : {})
      },
      orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }, { label: "asc" }]
    });
    res.json({ success: true, data: { items: rows } });
  } catch (err) {
    next(err);
  }
}

export async function getPickupLocation(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const row = await prisma.pickupLocation.findFirst({ where: { id } });
    if (!row) {
      res.status(404).json({ success: false, error: "Pickup location not found", code: "NOT_FOUND" });
      return;
    }
    res.json({ success: true, data: { item: row } });
  } catch (err) {
    next(err);
  }
}

export async function createPickupLocation(req: Request, res: Response, next: NextFunction) {
  try {
    const body = normalizeBody(req.body as z.infer<typeof createPickupLocationSchema>);
    const row = await prisma.$transaction(async (tx) => {
      const created = await tx.pickupLocation.create({ data: body });
      if (created.isPrimary) {
        await tx.pickupLocation.updateMany({
          where: { id: { not: created.id }, isPrimary: true },
          data: { isPrimary: false }
        });
      }
      return created;
    });
    res.status(201).json({ success: true, data: { item: row } });
  } catch (err) {
    next(err);
  }
}

export async function updatePickupLocation(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const raw = req.body as z.infer<typeof updatePickupLocationSchema>;
    const exists = await prisma.pickupLocation.findFirst({ where: { id } });
    if (!exists) {
      res.status(404).json({ success: false, error: "Pickup location not found", code: "NOT_FOUND" });
      return;
    }

    const data: Record<string, unknown> = {};
    if (raw.label !== undefined) data.label = raw.label.trim();
    if (raw.shiprocketPickupName !== undefined) data.shiprocketPickupName = raw.shiprocketPickupName.trim();
    if (raw.delhiveryPickupName !== undefined) data.delhiveryPickupName = raw.delhiveryPickupName?.trim() || null;
    if (raw.contactPerson !== undefined) data.contactPerson = raw.contactPerson?.trim() || null;
    if (raw.phone !== undefined) data.phone = raw.phone?.trim() || null;
    if (raw.email !== undefined) data.email = raw.email?.trim() || null;
    if (raw.line1 !== undefined) data.line1 = raw.line1?.trim() || null;
    if (raw.line2 !== undefined) data.line2 = raw.line2?.trim() || null;
    if (raw.city !== undefined) data.city = raw.city?.trim() || null;
    if (raw.state !== undefined) data.state = raw.state?.trim() || null;
    if (raw.postalCode !== undefined) data.postalCode = raw.postalCode?.trim() || null;
    if (raw.country !== undefined) data.country = (raw.country?.trim() || "IN").toUpperCase();
    if (raw.defaultPickupSlot !== undefined) data.defaultPickupSlot = raw.defaultPickupSlot?.trim() || null;
    if (raw.workingDays !== undefined) data.workingDays = raw.workingDays?.length ? raw.workingDays : null;
    if (raw.returnSameAsPickup !== undefined) data.returnSameAsPickup = raw.returnSameAsPickup;
    if (raw.returnLine1 !== undefined) data.returnLine1 = raw.returnLine1?.trim() || null;
    if (raw.returnLine2 !== undefined) data.returnLine2 = raw.returnLine2?.trim() || null;
    if (raw.returnCity !== undefined) data.returnCity = raw.returnCity?.trim() || null;
    if (raw.returnState !== undefined) data.returnState = raw.returnState?.trim() || null;
    if (raw.returnPostalCode !== undefined) data.returnPostalCode = raw.returnPostalCode?.trim() || null;
    if (raw.returnCountry !== undefined) data.returnCountry = raw.returnCountry?.trim() || null;
    if (raw.notes !== undefined) data.notes = raw.notes?.trim() || null;
    if (raw.sortOrder !== undefined) data.sortOrder = raw.sortOrder;
    if (raw.isActive !== undefined) data.isActive = raw.isActive;
    if (raw.isPrimary !== undefined) data.isPrimary = raw.isPrimary;

    const row = await prisma.$transaction(async (tx) => {
      const updated = await tx.pickupLocation.update({ where: { id }, data });
      if (updated.isPrimary) {
        await tx.pickupLocation.updateMany({
          where: { id: { not: updated.id }, isPrimary: true },
          data: { isPrimary: false }
        });
      }
      return updated;
    });
    res.json({ success: true, data: { item: row } });
  } catch (err) {
    next(err);
  }
}

export async function deletePickupLocation(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const exists = await prisma.pickupLocation.findFirst({ where: { id } });
    if (!exists) {
      res.status(404).json({ success: false, error: "Pickup location not found", code: "NOT_FOUND" });
      return;
    }
    const item = await prisma.pickupLocation.update({
      where: { id },
      data: { isActive: false, isPrimary: false }
    });
    res.json({ success: true, data: { item } });
  } catch (err) {
    next(err);
  }
}
