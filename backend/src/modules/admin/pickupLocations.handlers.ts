import type { NextFunction, Request, Response } from "express";
import { z } from "zod";

import { prisma } from "../../config/db";

const optionalAddr = z.string().max(300).optional();

export const createPickupLocationSchema = z.object({
  label: z.string().min(1).max(200),
  shiprocketPickupName: z.string().min(1).max(200),
  line1: optionalAddr,
  line2: optionalAddr,
  city: z.string().max(100).optional(),
  state: z.string().max(100).optional(),
  postalCode: z.string().max(20).optional(),
  notes: z.string().max(1000).optional(),
  isPrimary: z.boolean().optional(),
  sortOrder: z.number().int().optional()
});

export const updatePickupLocationSchema = z
  .object({
    label: z.string().min(1).max(200).optional(),
    shiprocketPickupName: z.string().min(1).max(200).optional(),
    line1: z.string().max(300).nullable().optional(),
    line2: z.string().max(300).nullable().optional(),
    city: z.string().max(100).nullable().optional(),
    state: z.string().max(100).nullable().optional(),
    postalCode: z.string().max(20).nullable().optional(),
    notes: z.string().max(1000).nullable().optional(),
    isPrimary: z.boolean().optional(),
    sortOrder: z.number().int().optional(),
    isActive: z.boolean().optional()
  })
  .refine((o) => Object.keys(o).length > 0, { message: "At least one field is required" });

export async function listPickupLocations(req: Request, res: Response, next: NextFunction) {
  try {
    const activeOnly =
      String(req.query.activeOnly ?? "") === "1" || String(req.query.activeOnly).toLowerCase() === "true";
    const rows = await prisma.pickupLocation.findMany({
      where: activeOnly ? { isActive: true } : undefined,
      orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }, { label: "asc" }]
    });
    res.json({ success: true, data: { items: rows } });
  } catch (err) {
    next(err);
  }
}

export async function createPickupLocation(req: Request, res: Response, next: NextFunction) {
  try {
    const body = req.body as z.infer<typeof createPickupLocationSchema>;
    const row = await prisma.$transaction(async (tx) => {
      const created = await tx.pickupLocation.create({
        data: {
          label: body.label.trim(),
          shiprocketPickupName: body.shiprocketPickupName.trim(),
          line1: body.line1?.trim() || null,
          line2: body.line2?.trim() || null,
          city: body.city?.trim() || null,
          state: body.state?.trim() || null,
          postalCode: body.postalCode?.trim() || null,
          notes: body.notes?.trim() || null,
          isPrimary: body.isPrimary ?? false,
          sortOrder: body.sortOrder ?? 0
        }
      });
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
    const body = req.body as z.infer<typeof updatePickupLocationSchema>;
    const exists = await prisma.pickupLocation.findFirst({ where: { id } });
    if (!exists) {
      res.status(404).json({ success: false, error: "Pickup location not found", code: "NOT_FOUND" });
      return;
    }
    const row = await prisma.$transaction(async (tx) => {
      const updated = await tx.pickupLocation.update({
        where: { id },
        data: {
          ...(body.label !== undefined ? { label: body.label.trim() } : {}),
          ...(body.shiprocketPickupName !== undefined
            ? { shiprocketPickupName: body.shiprocketPickupName.trim() }
            : {}),
          ...(body.line1 !== undefined ? { line1: body.line1?.trim() || null } : {}),
          ...(body.line2 !== undefined ? { line2: body.line2?.trim() || null } : {}),
          ...(body.city !== undefined ? { city: body.city?.trim() || null } : {}),
          ...(body.state !== undefined ? { state: body.state?.trim() || null } : {}),
          ...(body.postalCode !== undefined ? { postalCode: body.postalCode?.trim() || null } : {}),
          ...(body.notes !== undefined ? { notes: body.notes?.trim() || null } : {}),
          ...(body.sortOrder !== undefined ? { sortOrder: body.sortOrder } : {}),
          ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
          ...(body.isPrimary !== undefined ? { isPrimary: body.isPrimary } : {})
        }
      });
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
