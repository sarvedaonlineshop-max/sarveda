import type { NextFunction, Request, Response } from "express";
import { ExpenseStatus, PurchaseOrderStatus, VendorBillStatus } from "@prisma/client";
import { z } from "zod";

import { prisma } from "../../config/db";
import { generateBillNumber, generatePoNumber } from "./purchases-number";
import {
  billInclude,
  enrichLines,
  markBillPaid,
  poInclude,
  receivePurchaseOrder,
  sumDocumentTotals,
  vendorInclude,
  type LineInput
} from "./purchases.service";

const optionalStr = z.string().max(500).optional().nullable();
const dateStr = z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}/)).optional().nullable();

const lineSchema = z.object({
  variantId: z.string().uuid().optional().nullable(),
  itemName: z.string().max(500).optional(),
  sku: z.string().max(120).optional().nullable(),
  hsnCode: z.string().max(20).optional().nullable(),
  quantity: z.number().int().min(1),
  rateInPaise: z.number().int().min(0),
  taxClass: z.string().max(64).optional().nullable(),
  sortOrder: z.number().int().optional()
});

export const createVendorSchema = z.object({
  name: z.string().min(1).max(200),
  displayName: optionalStr,
  email: z.string().email().max(200).optional().nullable().or(z.literal("")),
  phone: z.string().max(20).optional().nullable(),
  gstin: z.string().max(20).optional().nullable(),
  pan: z.string().max(20).optional().nullable(),
  paymentTerms: z.string().max(100).optional().nullable(),
  currency: z.string().max(3).optional(),
  billingLine1: optionalStr,
  billingLine2: optionalStr,
  billingCity: z.string().max(100).optional().nullable(),
  billingState: z.string().max(100).optional().nullable(),
  billingPostalCode: z.string().max(20).optional().nullable(),
  billingCountry: z.string().max(2).optional(),
  shippingLine1: optionalStr,
  shippingLine2: optionalStr,
  shippingCity: z.string().max(100).optional().nullable(),
  shippingState: z.string().max(100).optional().nullable(),
  shippingPostalCode: z.string().max(20).optional().nullable(),
  shippingCountry: z.string().max(2).optional(),
  notes: z.string().max(2000).optional().nullable(),
  zohoContactId: z.string().max(64).optional().nullable()
});

export const updateVendorSchema = createVendorSchema.partial().extend({
  isActive: z.boolean().optional()
}).refine((o) => Object.keys(o).length > 0, { message: "At least one field required" });

export const createPoSchema = z.object({
  vendorId: z.string().uuid(),
  referenceNumber: z.string().max(120).optional().nullable(),
  orderDate: dateStr,
  expectedDeliveryDate: dateStr,
  paymentTerms: z.string().max(100).optional().nullable(),
  shipmentPreference: z.string().max(200).optional().nullable(),
  reverseCharge: z.boolean().optional(),
  pickupLocationId: z.string().uuid().optional().nullable(),
  taxTreatment: z.string().max(100).optional().nullable(),
  notes: z.string().max(5000).optional().nullable(),
  termsAndConditions: z.string().max(5000).optional().nullable(),
  discountPercent: z.number().int().min(0).max(100).optional(),
  adjustmentInPaise: z.number().int().optional(),
  adjustmentLabel: z.string().max(100).optional().nullable(),
  lines: z.array(lineSchema).min(1),
  status: z.enum(["DRAFT", "SENT"]).optional()
});

export const updatePoSchema = createPoSchema
  .partial()
  .extend({ status: z.nativeEnum(PurchaseOrderStatus).optional() })
  .refine((o) => Object.keys(o).length > 0, { message: "At least one field required" });

export const receivePoSchema = z.object({
  notes: z.string().max(2000).optional().nullable(),
  lines: z
    .array(
      z.object({
        poLineId: z.string().uuid(),
        quantityReceived: z.number().int().min(1)
      })
    )
    .min(1)
});

export const createBillSchema = z.object({
  vendorId: z.string().uuid(),
  purchaseOrderId: z.string().uuid().optional().nullable(),
  referenceNumber: z.string().max(120).optional().nullable(),
  billDate: dateStr,
  dueDate: dateStr,
  paymentTerms: z.string().max(100).optional().nullable(),
  reverseCharge: z.boolean().optional(),
  subject: z.string().max(250).optional().nullable(),
  notes: z.string().max(5000).optional().nullable(),
  discountInPaise: z.number().int().min(0).optional(),
  adjustmentInPaise: z.number().int().optional(),
  lines: z.array(lineSchema).min(1),
  status: z.enum(["DRAFT", "OPEN"]).optional()
});

export const updateBillSchema = createBillSchema
  .partial()
  .extend({ status: z.nativeEnum(VendorBillStatus).optional(), paidInPaise: z.number().int().min(0).optional() })
  .refine((o) => Object.keys(o).length > 0, { message: "At least one field required" });

export const createExpenseSchema = z.object({
  expenseAccount: z.string().min(1).max(200),
  vendorId: z.string().uuid().optional().nullable(),
  amountInPaise: z.number().int().min(1),
  currency: z.string().max(3).optional(),
  expenseDate: dateStr,
  paidThrough: z.string().max(200).optional().nullable(),
  expenseType: z.enum(["GOODS", "SERVICES"]).optional(),
  hsnSac: z.string().max(20).optional().nullable(),
  gstTreatment: z.string().max(100).optional().nullable(),
  sourceOfSupply: z.string().max(100).optional().nullable(),
  destinationOfSupply: z.string().max(100).optional().nullable(),
  reverseCharge: z.boolean().optional(),
  taxInPaise: z.number().int().min(0).optional(),
  taxInclusive: z.boolean().optional(),
  invoiceNumber: z.string().max(120).optional().nullable(),
  referenceNumber: z.string().max(120).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  status: z.nativeEnum(ExpenseStatus).optional()
});

export const updateExpenseSchema = createExpenseSchema
  .partial()
  .refine((o) => Object.keys(o).length > 0, { message: "At least one field required" });

function parseDate(v: string | null | undefined, fallback = new Date()): Date {
  if (!v) return fallback;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? fallback : d;
}

function normalizeVendorBody(body: z.infer<typeof createVendorSchema>) {
  return {
    name: body.name.trim(),
    displayName: body.displayName?.trim() || null,
    email: body.email?.trim() || null,
    phone: body.phone?.trim() || null,
    gstin: body.gstin?.trim().toUpperCase() || null,
    pan: body.pan?.trim().toUpperCase() || null,
    paymentTerms: body.paymentTerms?.trim() || "Due on Receipt",
    currency: (body.currency?.trim() || "INR").toUpperCase(),
    billingLine1: body.billingLine1?.trim() || null,
    billingLine2: body.billingLine2?.trim() || null,
    billingCity: body.billingCity?.trim() || null,
    billingState: body.billingState?.trim() || null,
    billingPostalCode: body.billingPostalCode?.trim() || null,
    billingCountry: (body.billingCountry?.trim() || "IN").toUpperCase(),
    shippingLine1: body.shippingLine1?.trim() || null,
    shippingLine2: body.shippingLine2?.trim() || null,
    shippingCity: body.shippingCity?.trim() || null,
    shippingState: body.shippingState?.trim() || null,
    shippingPostalCode: body.shippingPostalCode?.trim() || null,
    shippingCountry: (body.shippingCountry?.trim() || "IN").toUpperCase(),
    notes: body.notes?.trim() || null,
    zohoContactId: body.zohoContactId?.trim() || null
  };
}

async function buildPoLines(lines: LineInput[]) {
  const enriched = await enrichLines(lines);
  const totals = sumDocumentTotals(enriched, {});
  return { enriched, totals };
}

// --- Vendors ---

export async function listVendors(req: Request, res: Response, next: NextFunction) {
  try {
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const activeOnly = req.query.activeOnly === "1" || req.query.activeOnly === "true";
    const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? "25"), 10) || 25));
    const skip = (page - 1) * limit;
    const where = {
      ...(activeOnly ? { isActive: true } : {}),
      ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" as const } }, { gstin: { contains: q, mode: "insensitive" as const } }] } : {})
    };
    const [total, items] = await Promise.all([
      prisma.vendor.count({ where }),
      prisma.vendor.findMany({ where, orderBy: { name: "asc" }, skip, take: limit, include: vendorInclude })
    ]);
    res.json({ success: true, data: { items, pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) } } });
  } catch (err) {
    next(err);
  }
}

export async function getVendor(req: Request, res: Response, next: NextFunction) {
  try {
    const item = await prisma.vendor.findUnique({ where: { id: req.params.id }, include: vendorInclude });
    if (!item) {
      res.status(404).json({ success: false, error: "Vendor not found", code: "NOT_FOUND" });
      return;
    }
    res.json({ success: true, data: { item } });
  } catch (err) {
    next(err);
  }
}

export async function createVendor(req: Request, res: Response, next: NextFunction) {
  try {
    const item = await prisma.vendor.create({ data: normalizeVendorBody(req.body) });
    res.status(201).json({ success: true, data: { item } });
  } catch (err) {
    next(err);
  }
}

export async function updateVendor(req: Request, res: Response, next: NextFunction) {
  try {
    const body = req.body as z.infer<typeof updateVendorSchema>;
    const data: Record<string, unknown> = {};
    if (body.name) Object.assign(data, normalizeVendorBody({ ...body, name: body.name }));
    else {
      if (body.displayName !== undefined) data.displayName = body.displayName?.trim() || null;
      if (body.email !== undefined) data.email = body.email?.trim() || null;
      if (body.phone !== undefined) data.phone = body.phone?.trim() || null;
      if (body.gstin !== undefined) data.gstin = body.gstin?.trim().toUpperCase() || null;
      if (body.pan !== undefined) data.pan = body.pan?.trim().toUpperCase() || null;
      if (body.paymentTerms !== undefined) data.paymentTerms = body.paymentTerms?.trim() || null;
      if (body.notes !== undefined) data.notes = body.notes?.trim() || null;
    }
    if (body.isActive !== undefined) data.isActive = body.isActive;
    const item = await prisma.vendor.update({ where: { id: req.params.id }, data });
    res.json({ success: true, data: { item } });
  } catch (err) {
    next(err);
  }
}

// --- Purchase Orders ---

export async function listPurchaseOrders(req: Request, res: Response, next: NextFunction) {
  try {
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const status = typeof req.query.status === "string" ? req.query.status.toUpperCase() : "";
    const vendorId = typeof req.query.vendorId === "string" ? req.query.vendorId : "";
    const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? "25"), 10) || 25));
    const skip = (page - 1) * limit;
    const where = {
      ...(status && status !== "ALL" ? { status: status as PurchaseOrderStatus } : {}),
      ...(vendorId ? { vendorId } : {}),
      ...(q
        ? {
            OR: [
              { poNumber: { contains: q, mode: "insensitive" as const } },
              { referenceNumber: { contains: q, mode: "insensitive" as const } },
              { vendor: { name: { contains: q, mode: "insensitive" as const } } }
            ]
          }
        : {})
    };
    const [total, items] = await Promise.all([
      prisma.purchaseOrder.count({ where }),
      prisma.purchaseOrder.findMany({
        where,
        orderBy: { orderDate: "desc" },
        skip,
        take: limit,
        include: {
          vendor: { select: { id: true, name: true } },
          pickupLocation: { select: { id: true, label: true } },
          lines: { select: { id: true, quantity: true, receivedQty: true } }
        }
      })
    ]);
    res.json({ success: true, data: { items, pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) } } });
  } catch (err) {
    next(err);
  }
}

export async function getPurchaseOrder(req: Request, res: Response, next: NextFunction) {
  try {
    const item = await prisma.purchaseOrder.findUnique({ where: { id: req.params.id }, include: poInclude });
    if (!item) {
      res.status(404).json({ success: false, error: "Purchase order not found", code: "NOT_FOUND" });
      return;
    }
    res.json({ success: true, data: { item } });
  } catch (err) {
    next(err);
  }
}

export async function createPurchaseOrder(req: Request, res: Response, next: NextFunction) {
  try {
    const body = req.body as z.infer<typeof createPoSchema>;
    const { enriched, totals } = await buildPoLines(body.lines as LineInput[]);
    const poNumber = await generatePoNumber();
    const status = body.status ?? "DRAFT";
    const finalTotal = sumDocumentTotals(enriched, {
      discountPercent: body.discountPercent ?? 0,
      adjustmentInPaise: body.adjustmentInPaise ?? 0
    });
    const item = await prisma.purchaseOrder.create({
      data: {
        poNumber,
        vendorId: body.vendorId,
        status,
        referenceNumber: body.referenceNumber?.trim() || null,
        orderDate: parseDate(body.orderDate ?? undefined),
        expectedDeliveryDate: body.expectedDeliveryDate ? parseDate(body.expectedDeliveryDate) : null,
        paymentTerms: body.paymentTerms?.trim() || null,
        shipmentPreference: body.shipmentPreference?.trim() || null,
        reverseCharge: body.reverseCharge ?? false,
        pickupLocationId: body.pickupLocationId || null,
        taxTreatment: body.taxTreatment?.trim() || "At Transaction Level",
        notes: body.notes?.trim() || null,
        termsAndConditions: body.termsAndConditions?.trim() || null,
        discountPercent: body.discountPercent ?? 0,
        discountInPaise: finalTotal.discountInPaise,
        adjustmentInPaise: body.adjustmentInPaise ?? 0,
        adjustmentLabel: body.adjustmentLabel?.trim() || "Adjustment",
        subtotalInPaise: finalTotal.subtotalInPaise,
        taxInPaise: finalTotal.taxInPaise,
        totalInPaise: finalTotal.totalInPaise,
        lines: {
          create: enriched.map((l) => ({
            variantId: l.variantId || null,
            itemName: l.itemName,
            sku: l.sku,
            hsnCode: l.hsnCode,
            quantity: l.quantity,
            rateInPaise: l.rateInPaise,
            taxClass: l.taxClass,
            taxInPaise: l.taxInPaise,
            lineTotalInPaise: l.lineTotalInPaise,
            sortOrder: l.sortOrder ?? 0
          }))
        }
      },
      include: poInclude
    });
    res.status(201).json({ success: true, data: { item } });
  } catch (err) {
    next(err);
  }
}

export async function updatePurchaseOrder(req: Request, res: Response, next: NextFunction) {
  try {
    const id = req.params.id;
    const existing = await prisma.purchaseOrder.findUnique({ where: { id }, include: { lines: true } });
    if (!existing) {
      res.status(404).json({ success: false, error: "Purchase order not found", code: "NOT_FOUND" });
      return;
    }
    if (existing.status === "RECEIVED" || existing.status === "CANCELLED") {
      res.status(400).json({ success: false, error: "Cannot edit a received or cancelled PO", code: "INVALID_STATE" });
      return;
    }
    const body = req.body as z.infer<typeof updatePoSchema>;
    const data: Record<string, unknown> = {};
    if (body.referenceNumber !== undefined) data.referenceNumber = body.referenceNumber?.trim() || null;
    if (body.orderDate) data.orderDate = parseDate(body.orderDate);
    if (body.expectedDeliveryDate !== undefined) data.expectedDeliveryDate = body.expectedDeliveryDate ? parseDate(body.expectedDeliveryDate) : null;
    if (body.paymentTerms !== undefined) data.paymentTerms = body.paymentTerms?.trim() || null;
    if (body.shipmentPreference !== undefined) data.shipmentPreference = body.shipmentPreference?.trim() || null;
    if (body.reverseCharge !== undefined) data.reverseCharge = body.reverseCharge;
    if (body.pickupLocationId !== undefined) data.pickupLocationId = body.pickupLocationId || null;
    if (body.taxTreatment !== undefined) data.taxTreatment = body.taxTreatment?.trim() || null;
    if (body.notes !== undefined) data.notes = body.notes?.trim() || null;
    if (body.termsAndConditions !== undefined) data.termsAndConditions = body.termsAndConditions?.trim() || null;
    if (body.status !== undefined) data.status = body.status;
    if (body.vendorId) data.vendorId = body.vendorId;

    if (body.lines) {
      const { enriched, totals } = await buildPoLines(body.lines as LineInput[]);
      const finalTotal = sumDocumentTotals(enriched, {
        discountPercent: body.discountPercent ?? existing.discountPercent,
        adjustmentInPaise: body.adjustmentInPaise ?? existing.adjustmentInPaise
      });
      Object.assign(data, {
        subtotalInPaise: finalTotal.subtotalInPaise,
        discountPercent: body.discountPercent ?? existing.discountPercent,
        discountInPaise: finalTotal.discountInPaise,
        adjustmentInPaise: body.adjustmentInPaise ?? existing.adjustmentInPaise,
        taxInPaise: finalTotal.taxInPaise,
        totalInPaise: finalTotal.totalInPaise
      });
      await prisma.purchaseOrderLine.deleteMany({ where: { purchaseOrderId: id } });
      await prisma.purchaseOrderLine.createMany({
        data: enriched.map((l) => ({
          purchaseOrderId: id,
          variantId: l.variantId || null,
          itemName: l.itemName,
          sku: l.sku,
          hsnCode: l.hsnCode,
          quantity: l.quantity,
          rateInPaise: l.rateInPaise,
          taxClass: l.taxClass,
          taxInPaise: l.taxInPaise,
          lineTotalInPaise: l.lineTotalInPaise,
          sortOrder: l.sortOrder ?? 0
        }))
      });
    }

    await prisma.purchaseOrder.update({ where: { id }, data });
    const item = await prisma.purchaseOrder.findUnique({ where: { id }, include: poInclude });
    res.json({ success: true, data: { item } });
  } catch (err) {
    next(err);
  }
}

export async function receivePurchaseOrderHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const body = req.body as z.infer<typeof receivePoSchema>;
    const result = await receivePurchaseOrder(req.params.id, body.lines, body.notes);
    const item = await prisma.purchaseOrder.findUnique({ where: { id: req.params.id }, include: poInclude });
    res.json({ success: true, data: { ...result, item } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Receive failed";
    res.status(400).json({ success: false, error: msg, code: "RECEIVE_FAILED" });
  }
}

// --- Bills ---

export async function listBills(req: Request, res: Response, next: NextFunction) {
  try {
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const status = typeof req.query.status === "string" ? req.query.status.toUpperCase() : "";
    const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? "25"), 10) || 25));
    const skip = (page - 1) * limit;
    const where = {
      ...(status && status !== "ALL" ? { status: status as VendorBillStatus } : {}),
      ...(q
        ? {
            OR: [
              { billNumber: { contains: q, mode: "insensitive" as const } },
              { referenceNumber: { contains: q, mode: "insensitive" as const } },
              { vendor: { name: { contains: q, mode: "insensitive" as const } } }
            ]
          }
        : {})
    };
    const [total, items] = await Promise.all([
      prisma.vendorBill.count({ where }),
      prisma.vendorBill.findMany({
        where,
        orderBy: { billDate: "desc" },
        skip,
        take: limit,
        include: { vendor: { select: { id: true, name: true } } }
      })
    ]);
    const openBills = await prisma.vendorBill.findMany({
      where: { status: "OPEN" },
      select: { totalInPaise: true, paidInPaise: true, dueDate: true }
    });
    const now = new Date();
    let outstandingInPaise = 0;
    let overdueInPaise = 0;
    for (const b of openBills) {
      const balance = b.totalInPaise - b.paidInPaise;
      outstandingInPaise += balance;
      if (b.dueDate && b.dueDate < now) overdueInPaise += balance;
    }
    res.json({
      success: true,
      data: {
        items,
        summary: { outstandingInPaise, overdueInPaise },
        pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) }
      }
    });
  } catch (err) {
    next(err);
  }
}

export async function getBill(req: Request, res: Response, next: NextFunction) {
  try {
    const item = await prisma.vendorBill.findUnique({ where: { id: req.params.id }, include: billInclude });
    if (!item) {
      res.status(404).json({ success: false, error: "Bill not found", code: "NOT_FOUND" });
      return;
    }
    res.json({ success: true, data: { item } });
  } catch (err) {
    next(err);
  }
}

export async function createBill(req: Request, res: Response, next: NextFunction) {
  try {
    const body = req.body as z.infer<typeof createBillSchema>;
    const { enriched, totals } = await buildPoLines(body.lines as LineInput[]);
    const finalTotal = sumDocumentTotals(enriched, {
      discountInPaise: body.discountInPaise,
      adjustmentInPaise: body.adjustmentInPaise
    });
    const billNumber = await generateBillNumber();
    const item = await prisma.vendorBill.create({
      data: {
        billNumber,
        vendorId: body.vendorId,
        purchaseOrderId: body.purchaseOrderId || null,
        status: body.status ?? "DRAFT",
        referenceNumber: body.referenceNumber?.trim() || null,
        billDate: parseDate(body.billDate ?? undefined),
        dueDate: body.dueDate ? parseDate(body.dueDate) : null,
        paymentTerms: body.paymentTerms?.trim() || null,
        reverseCharge: body.reverseCharge ?? false,
        subject: body.subject?.trim() || null,
        notes: body.notes?.trim() || null,
        subtotalInPaise: finalTotal.subtotalInPaise,
        discountInPaise: finalTotal.discountInPaise,
        adjustmentInPaise: body.adjustmentInPaise ?? 0,
        taxInPaise: finalTotal.taxInPaise,
        totalInPaise: finalTotal.totalInPaise,
        lines: {
          create: enriched.map((l) => ({
            variantId: l.variantId || null,
            itemName: l.itemName,
            sku: l.sku,
            quantity: l.quantity,
            rateInPaise: l.rateInPaise,
            taxClass: l.taxClass,
            taxInPaise: l.taxInPaise,
            lineTotalInPaise: l.lineTotalInPaise,
            sortOrder: l.sortOrder ?? 0
          }))
        }
      },
      include: billInclude
    });
    res.status(201).json({ success: true, data: { item } });
  } catch (err) {
    next(err);
  }
}

export async function updateBill(req: Request, res: Response, next: NextFunction) {
  try {
    const id = req.params.id;
    const existing = await prisma.vendorBill.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ success: false, error: "Bill not found", code: "NOT_FOUND" });
      return;
    }
    const body = req.body as z.infer<typeof updateBillSchema>;
    if (body.status === "PAID" || body.paidInPaise !== undefined) {
      const status = await markBillPaid(id, body.paidInPaise ?? existing.totalInPaise);
      const item = await prisma.vendorBill.findUnique({ where: { id }, include: billInclude });
      res.json({ success: true, data: { item, status } });
      return;
    }
    const data: Record<string, unknown> = {};
    if (body.vendorId) data.vendorId = body.vendorId;
    if (body.purchaseOrderId !== undefined) data.purchaseOrderId = body.purchaseOrderId || null;
    if (body.referenceNumber !== undefined) data.referenceNumber = body.referenceNumber?.trim() || null;
    if (body.billDate) data.billDate = parseDate(body.billDate);
    if (body.dueDate !== undefined) data.dueDate = body.dueDate ? parseDate(body.dueDate) : null;
    if (body.paymentTerms !== undefined) data.paymentTerms = body.paymentTerms?.trim() || null;
    if (body.reverseCharge !== undefined) data.reverseCharge = body.reverseCharge;
    if (body.subject !== undefined) data.subject = body.subject?.trim() || null;
    if (body.notes !== undefined) data.notes = body.notes?.trim() || null;
    if (body.status !== undefined) data.status = body.status;

    if (body.lines) {
      const { enriched, totals } = await buildPoLines(body.lines as LineInput[]);
      const finalTotal = sumDocumentTotals(enriched, {
        discountInPaise: body.discountInPaise ?? existing.discountInPaise,
        adjustmentInPaise: body.adjustmentInPaise ?? existing.adjustmentInPaise
      });
      Object.assign(data, {
        subtotalInPaise: finalTotal.subtotalInPaise,
        discountInPaise: finalTotal.discountInPaise,
        adjustmentInPaise: body.adjustmentInPaise ?? existing.adjustmentInPaise,
        taxInPaise: finalTotal.taxInPaise,
        totalInPaise: finalTotal.totalInPaise
      });
      await prisma.vendorBillLine.deleteMany({ where: { billId: id } });
      await prisma.vendorBillLine.createMany({
        data: enriched.map((l) => ({
          billId: id,
          variantId: l.variantId || null,
          itemName: l.itemName,
          sku: l.sku,
          quantity: l.quantity,
          rateInPaise: l.rateInPaise,
          taxClass: l.taxClass,
          taxInPaise: l.taxInPaise,
          lineTotalInPaise: l.lineTotalInPaise,
          sortOrder: l.sortOrder ?? 0
        }))
      });
    }

    await prisma.vendorBill.update({ where: { id }, data });
    const item = await prisma.vendorBill.findUnique({ where: { id }, include: billInclude });
    res.json({ success: true, data: { item } });
  } catch (err) {
    next(err);
  }
}

// --- Expenses ---

export async function listExpenses(req: Request, res: Response, next: NextFunction) {
  try {
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? "25"), 10) || 25));
    const skip = (page - 1) * limit;
    const where = q
      ? {
          OR: [
            { expenseAccount: { contains: q, mode: "insensitive" as const } },
            { referenceNumber: { contains: q, mode: "insensitive" as const } },
            { vendor: { name: { contains: q, mode: "insensitive" as const } } }
          ]
        }
      : {};
    const [total, items] = await Promise.all([
      prisma.expense.count({ where }),
      prisma.expense.findMany({
        where,
        orderBy: { expenseDate: "desc" },
        skip,
        take: limit,
        include: { vendor: { select: { id: true, name: true } } }
      })
    ]);
    res.json({ success: true, data: { items, pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) } } });
  } catch (err) {
    next(err);
  }
}

export async function getExpense(req: Request, res: Response, next: NextFunction) {
  try {
    const item = await prisma.expense.findUnique({
      where: { id: req.params.id },
      include: { vendor: { select: { id: true, name: true, gstin: true } } }
    });
    if (!item) {
      res.status(404).json({ success: false, error: "Expense not found", code: "NOT_FOUND" });
      return;
    }
    res.json({ success: true, data: { item } });
  } catch (err) {
    next(err);
  }
}

export async function createExpense(req: Request, res: Response, next: NextFunction) {
  try {
    const body = req.body as z.infer<typeof createExpenseSchema>;
    const item = await prisma.expense.create({
      data: {
        expenseAccount: body.expenseAccount.trim(),
        vendorId: body.vendorId || null,
        amountInPaise: body.amountInPaise,
        currency: (body.currency?.trim() || "INR").toUpperCase(),
        expenseDate: parseDate(body.expenseDate ?? undefined),
        paidThrough: body.paidThrough?.trim() || null,
        expenseType: body.expenseType ?? "SERVICES",
        hsnSac: body.hsnSac?.trim() || null,
        gstTreatment: body.gstTreatment?.trim() || null,
        sourceOfSupply: body.sourceOfSupply?.trim() || null,
        destinationOfSupply: body.destinationOfSupply?.trim() || "KA",
        reverseCharge: body.reverseCharge ?? false,
        taxInPaise: body.taxInPaise ?? 0,
        taxInclusive: body.taxInclusive ?? false,
        invoiceNumber: body.invoiceNumber?.trim() || null,
        referenceNumber: body.referenceNumber?.trim() || null,
        notes: body.notes?.trim() || null,
        status: body.status ?? "RECORDED"
      },
      include: { vendor: { select: { id: true, name: true } } }
    });
    res.status(201).json({ success: true, data: { item } });
  } catch (err) {
    next(err);
  }
}

export async function updateExpense(req: Request, res: Response, next: NextFunction) {
  try {
    const body = req.body as z.infer<typeof updateExpenseSchema>;
    const data: Record<string, unknown> = {};
    if (body.expenseAccount) data.expenseAccount = body.expenseAccount.trim();
    if (body.vendorId !== undefined) data.vendorId = body.vendorId || null;
    if (body.amountInPaise !== undefined) data.amountInPaise = body.amountInPaise;
    if (body.currency) data.currency = body.currency.trim().toUpperCase();
    if (body.expenseDate) data.expenseDate = parseDate(body.expenseDate);
    if (body.paidThrough !== undefined) data.paidThrough = body.paidThrough?.trim() || null;
    if (body.expenseType) data.expenseType = body.expenseType;
    if (body.hsnSac !== undefined) data.hsnSac = body.hsnSac?.trim() || null;
    if (body.gstTreatment !== undefined) data.gstTreatment = body.gstTreatment?.trim() || null;
    if (body.sourceOfSupply !== undefined) data.sourceOfSupply = body.sourceOfSupply?.trim() || null;
    if (body.destinationOfSupply !== undefined) data.destinationOfSupply = body.destinationOfSupply?.trim() || null;
    if (body.reverseCharge !== undefined) data.reverseCharge = body.reverseCharge;
    if (body.taxInPaise !== undefined) data.taxInPaise = body.taxInPaise;
    if (body.taxInclusive !== undefined) data.taxInclusive = body.taxInclusive;
    if (body.invoiceNumber !== undefined) data.invoiceNumber = body.invoiceNumber?.trim() || null;
    if (body.referenceNumber !== undefined) data.referenceNumber = body.referenceNumber?.trim() || null;
    if (body.notes !== undefined) data.notes = body.notes?.trim() || null;
    if (body.status) data.status = body.status;
    const item = await prisma.expense.update({
      where: { id: req.params.id },
      data,
      include: { vendor: { select: { id: true, name: true } } }
    });
    res.json({ success: true, data: { item } });
  } catch (err) {
    next(err);
  }
}

export async function purchasesStatus(_req: Request, res: Response) {
  res.json({ success: true, data: { enabled: true } });
}

export async function searchCatalogItems(req: Request, res: Response, next: NextFunction) {
  try {
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    if (q.length < 1) {
      res.json({ success: true, data: { items: [] } });
      return;
    }
    const variants = await prisma.productVariant.findMany({
      where: {
        status: "ACTIVE",
        OR: [
          { sku: { contains: q, mode: "insensitive" } },
          { productRel: { name: { contains: q, mode: "insensitive" } } }
        ]
      },
      take: 20,
      select: {
        id: true,
        sku: true,
        costInPaise: true,
        productRel: { select: { name: true, hsnCode: true, taxClass: true } }
      }
    });
    res.json({
      success: true,
      data: {
        items: variants.map((v) => ({
          variantId: v.id,
          sku: v.sku,
          itemName: v.productRel.name,
          hsnCode: v.productRel.hsnCode,
          taxClass: v.productRel.taxClass,
          rateInPaise: v.costInPaise ?? 0
        }))
      }
    });
  } catch (err) {
    next(err);
  }
}
