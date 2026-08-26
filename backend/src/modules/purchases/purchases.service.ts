import type { PurchaseOrderStatus, Prisma, VendorBillStatus } from "@prisma/client";

import { prisma } from "../../config/db";
import { gstRatePercent } from "../../utils/gst";

export type LineInput = {
  variantId?: string | null;
  itemName: string;
  sku?: string | null;
  hsnCode?: string | null;
  quantity: number;
  rateInPaise: number;
  taxClass?: string | null;
  sortOrder?: number;
};

export function computeLineTotals(line: LineInput): {
  taxInPaise: number;
  lineTotalInPaise: number;
} {
  const base = line.quantity * line.rateInPaise;
  const rate = gstRatePercent(line.taxClass);
  const taxInPaise = rate > 0 ? Math.round((base * rate) / 100) : 0;
  return { taxInPaise, lineTotalInPaise: base + taxInPaise };
}

export function sumDocumentTotals(
  lines: Array<{ lineTotalInPaise: number; taxInPaise: number; quantity: number; rateInPaise: number }>,
  opts?: { discountPercent?: number; discountInPaise?: number; adjustmentInPaise?: number }
): { subtotalInPaise: number; taxInPaise: number; totalInPaise: number; discountInPaise: number } {
  const subtotalInPaise = lines.reduce((s, l) => s + l.quantity * l.rateInPaise, 0);
  const taxInPaise = lines.reduce((s, l) => s + l.taxInPaise, 0);
  const pct = opts?.discountPercent ?? 0;
  const discountFromPct = pct > 0 ? Math.round((subtotalInPaise * pct) / 100) : 0;
  const discountInPaise = opts?.discountInPaise ?? discountFromPct;
  const adjustmentInPaise = opts?.adjustmentInPaise ?? 0;
  const totalInPaise = subtotalInPaise - discountInPaise + taxInPaise + adjustmentInPaise;
  return { subtotalInPaise, taxInPaise, totalInPaise, discountInPaise };
}

export async function resolveVariantLineMeta(variantId: string | null | undefined): Promise<{
  itemName: string;
  sku: string | null;
  hsnCode: string | null;
  taxClass: string | null;
  rateInPaise: number | null;
}> {
  if (!variantId) {
    return { itemName: "", sku: null, hsnCode: null, taxClass: null, rateInPaise: null };
  }
  const v = await prisma.productVariant.findUnique({
    where: { id: variantId },
    select: {
      sku: true,
      costInPaise: true,
      productRel: { select: { name: true, hsnCode: true, taxClass: true } }
    }
  });
  if (!v) {
    return { itemName: "", sku: null, hsnCode: null, taxClass: null, rateInPaise: null };
  }
  return {
    itemName: v.productRel.name,
    sku: v.sku,
    hsnCode: v.productRel.hsnCode,
    taxClass: v.productRel.taxClass,
    rateInPaise: v.costInPaise
  };
}

export async function enrichLines(raw: LineInput[]): Promise<
  Array<LineInput & { taxInPaise: number; lineTotalInPaise: number }>
> {
  const out: Array<LineInput & { taxInPaise: number; lineTotalInPaise: number }> = [];
  for (let i = 0; i < raw.length; i++) {
    const line = raw[i];
    const meta = line.variantId ? await resolveVariantLineMeta(line.variantId) : null;
    const itemName = line.itemName?.trim() || meta?.itemName || "Item";
    const sku = line.sku ?? meta?.sku ?? null;
    const hsnCode = line.hsnCode ?? meta?.hsnCode ?? null;
    const taxClass = line.taxClass ?? meta?.taxClass ?? "standard";
    const rateInPaise = line.rateInPaise ?? meta?.rateInPaise ?? 0;
    const enriched: LineInput = {
      ...line,
      itemName,
      sku,
      hsnCode,
      taxClass,
      rateInPaise,
      sortOrder: line.sortOrder ?? i
    };
    const totals = computeLineTotals(enriched);
    out.push({ ...enriched, ...totals });
  }
  return out;
}

export function derivePoStatus(
  lines: Array<{ quantity: number; receivedQty: number }>,
  current: PurchaseOrderStatus
): PurchaseOrderStatus {
  if (current === "CANCELLED") return "CANCELLED";
  const totalQty = lines.reduce((s, l) => s + l.quantity, 0);
  const receivedQty = lines.reduce((s, l) => s + l.receivedQty, 0);
  if (receivedQty <= 0) return current === "DRAFT" ? "DRAFT" : "SENT";
  if (receivedQty >= totalQty) return "RECEIVED";
  return "PARTIALLY_RECEIVED";
}

export async function receivePurchaseOrder(
  purchaseOrderId: string,
  lineReceipts: Array<{ poLineId: string; quantityReceived: number }>,
  notes?: string | null
): Promise<{ receiptId: string; poStatus: PurchaseOrderStatus }> {
  return prisma.$transaction(async (tx) => {
    const po = await tx.purchaseOrder.findUnique({
      where: { id: purchaseOrderId },
      include: { lines: true }
    });
    if (!po) throw new Error("Purchase order not found");
    if (po.status === "CANCELLED") throw new Error("Cannot receive a cancelled PO");
    if (po.status === "DRAFT") throw new Error("Mark PO as sent before receiving goods");

    const lineMap = new Map(po.lines.map((l) => [l.id, l]));
    for (const r of lineReceipts) {
      const line = lineMap.get(r.poLineId);
      if (!line) throw new Error(`PO line not found: ${r.poLineId}`);
      if (r.quantityReceived <= 0) throw new Error("Quantity must be positive");
      const remaining = line.quantity - line.receivedQty;
      if (r.quantityReceived > remaining) {
        throw new Error(`Cannot receive ${r.quantityReceived} for ${line.sku ?? line.itemName}; ${remaining} remaining`);
      }
    }

    const receipt = await tx.purchaseReceipt.create({
      data: {
        purchaseOrderId,
        notes: notes?.trim() || null,
        lines: {
          create: lineReceipts.map((r) => ({
            poLineId: r.poLineId,
            quantityReceived: r.quantityReceived
          }))
        }
      }
    });

    for (const r of lineReceipts) {
      const line = lineMap.get(r.poLineId)!;
      await tx.purchaseOrderLine.update({
        where: { id: r.poLineId },
        data: { receivedQty: line.receivedQty + r.quantityReceived }
      });

      if (line.variantId) {
        const inv = await tx.inventory.findUnique({ where: { variantId: line.variantId } });
        if (inv) {
          await tx.inventory.update({
            where: { variantId: line.variantId },
            data: { onHand: inv.onHand + r.quantityReceived }
          });
        } else {
          await tx.inventory.create({
            data: { variantId: line.variantId, onHand: r.quantityReceived }
          });
        }
        if (line.rateInPaise > 0) {
          await tx.productVariant.update({
            where: { id: line.variantId },
            data: { costInPaise: line.rateInPaise }
          });
        }
      }
    }

    const updatedLines = await tx.purchaseOrderLine.findMany({ where: { purchaseOrderId } });
    const poStatus = derivePoStatus(updatedLines, po.status);
    await tx.purchaseOrder.update({ where: { id: purchaseOrderId }, data: { status: poStatus } });

    return { receiptId: receipt.id, poStatus };
  });
}

export async function markBillPaid(billId: string, paidInPaise?: number): Promise<VendorBillStatus> {
  const bill = await prisma.vendorBill.findUnique({ where: { id: billId } });
  if (!bill) throw new Error("Bill not found");
  if (bill.status === "VOID") throw new Error("Cannot pay a void bill");
  const paid = paidInPaise ?? bill.totalInPaise;
  const status: VendorBillStatus = paid >= bill.totalInPaise ? "PAID" : "OPEN";
  await prisma.vendorBill.update({
    where: { id: billId },
    data: { paidInPaise: paid, status: status === "PAID" ? "PAID" : "OPEN" }
  });
  return status;
}

export const vendorInclude = {
  purchaseOrders: { select: { id: true, poNumber: true, status: true, totalInPaise: true, orderDate: true } },
  _count: { select: { purchaseOrders: true, bills: true, expenses: true } }
} satisfies Prisma.VendorInclude;

export const poInclude = {
  vendor: { select: { id: true, name: true, email: true, phone: true, gstin: true } },
  pickupLocation: { select: { id: true, label: true } },
  lines: { orderBy: { sortOrder: "asc" as const } },
  receipts: { include: { lines: true }, orderBy: { receivedAt: "desc" as const } }
} satisfies Prisma.PurchaseOrderInclude;

export const billInclude = {
  vendor: { select: { id: true, name: true, gstin: true } },
  purchaseOrder: { select: { id: true, poNumber: true } },
  lines: { orderBy: { sortOrder: "asc" as const } }
} satisfies Prisma.VendorBillInclude;
