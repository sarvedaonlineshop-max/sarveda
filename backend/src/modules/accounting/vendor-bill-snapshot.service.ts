import { createHash } from "crypto";

import type { VendorBill, VendorBillLine, Vendor, PurchaseOrder } from "@prisma/client";

import { VendorBillSnapshotNotFoundError } from "./accounting-errors";
import { prisma } from "../../config/db";
import type { VendorBillLineClass, VendorBillLineSnapshot, VendorBillSnapshot } from "./vendor-bill.types";

type BillRow = VendorBill & {
  vendor: Vendor;
  purchaseOrder: Pick<PurchaseOrder, "id" | "poNumber"> | null;
  lines: VendorBillLine[];
};

export function classifyBillLine(variantId: string | null | undefined): VendorBillLineClass {
  return variantId ? "STOCK" : "NON_STOCK";
}

export function fingerprintVendorBillFinancials(input: {
  status: string;
  subtotalInPaise: number;
  discountInPaise: number;
  adjustmentInPaise: number;
  taxInPaise: number;
  totalInPaise: number;
  lines: Array<{
    id: string;
    variantId: string | null;
    quantity: number;
    rateInPaise: number;
    taxInPaise: number;
    lineTotalInPaise: number;
  }>;
}): string {
  const payload = {
    status: input.status,
    subtotalInPaise: input.subtotalInPaise,
    discountInPaise: input.discountInPaise,
    adjustmentInPaise: input.adjustmentInPaise,
    taxInPaise: input.taxInPaise,
    totalInPaise: input.totalInPaise,
    lines: input.lines.map((l) => ({
      id: l.id,
      variantId: l.variantId,
      quantity: l.quantity,
      rateInPaise: l.rateInPaise,
      taxInPaise: l.taxInPaise,
      lineTotalInPaise: l.lineTotalInPaise
    }))
  };
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

function toSnapshot(bill: BillRow): VendorBillSnapshot {
  const lines: VendorBillLineSnapshot[] = bill.lines
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((l) => ({
      id: l.id,
      variantId: l.variantId,
      itemName: l.itemName,
      sku: l.sku,
      quantity: l.quantity,
      rateInPaise: l.rateInPaise,
      taxClass: l.taxClass,
      taxInPaise: l.taxInPaise,
      lineTotalInPaise: l.lineTotalInPaise,
      sortOrder: l.sortOrder,
      classification: classifyBillLine(l.variantId),
      exclusiveBaseInPaise: l.quantity * l.rateInPaise
    }));

  return {
    billId: bill.id,
    billNumber: bill.billNumber,
    referenceNumber: bill.referenceNumber,
    billDate: bill.billDate,
    dueDate: bill.dueDate,
    status: bill.status,
    purchaseOrderId: bill.purchaseOrderId,
    purchaseOrderNumber: bill.purchaseOrder?.poNumber ?? null,
    vendorId: bill.vendorId,
    vendorName: bill.vendor.name,
    vendorGstin: bill.vendor.gstin,
    vendorBillingState: bill.vendor.billingState,
    vendorBillingCountry: bill.vendor.billingCountry,
    vendorCurrency: bill.vendor.currency,
    subtotalInPaise: bill.subtotalInPaise,
    discountInPaise: bill.discountInPaise,
    adjustmentInPaise: bill.adjustmentInPaise,
    taxInPaise: bill.taxInPaise,
    totalInPaise: bill.totalInPaise,
    paidInPaise: bill.paidInPaise,
    reverseCharge: bill.reverseCharge,
    lines,
    sourceFingerprint: fingerprintVendorBillFinancials({
      status: bill.status,
      subtotalInPaise: bill.subtotalInPaise,
      discountInPaise: bill.discountInPaise,
      adjustmentInPaise: bill.adjustmentInPaise,
      taxInPaise: bill.taxInPaise,
      totalInPaise: bill.totalInPaise,
      lines: bill.lines
    }),
    updatedAt: bill.updatedAt
  };
}

const billInclude = {
  vendor: true,
  purchaseOrder: { select: { id: true, poNumber: true } },
  lines: true
} as const;

export async function loadVendorBillSnapshotById(billId: string): Promise<VendorBillSnapshot> {
  const bill = await prisma.vendorBill.findUnique({
    where: { id: billId },
    include: billInclude
  });
  if (!bill) throw new VendorBillSnapshotNotFoundError(billId);
  return toSnapshot(bill);
}

export async function loadVendorBillSnapshot(identifier: {
  billId?: string;
  billNumber?: string;
}): Promise<VendorBillSnapshot> {
  if (identifier.billId) return loadVendorBillSnapshotById(identifier.billId);
  if (identifier.billNumber) {
    const bill = await prisma.vendorBill.findUnique({
      where: { billNumber: identifier.billNumber },
      include: billInclude
    });
    if (!bill) throw new VendorBillSnapshotNotFoundError(identifier.billNumber);
    return toSnapshot(bill);
  }
  throw new VendorBillSnapshotNotFoundError("(missing identifier)");
}

export async function findVendorBillDiscoveryCandidates(opts: {
  billId?: string;
  billNumber?: string;
  vendorId?: string;
  since?: Date;
  until?: Date;
  limit: number;
}): Promise<Array<{ id: string; billNumber: string; billDate: Date; status: string }>> {
  if (opts.billId) {
    const one = await prisma.vendorBill.findUnique({
      where: { id: opts.billId },
      select: { id: true, billNumber: true, billDate: true, status: true }
    });
    return one ? [one] : [];
  }
  if (opts.billNumber) {
    const one = await prisma.vendorBill.findUnique({
      where: { billNumber: opts.billNumber },
      select: { id: true, billNumber: true, billDate: true, status: true }
    });
    return one ? [one] : [];
  }

  return prisma.vendorBill.findMany({
    where: {
      status: { in: ["OPEN", "PAID"] },
      ...(opts.vendorId ? { vendorId: opts.vendorId } : {}),
      ...(opts.since || opts.until
        ? {
            billDate: {
              ...(opts.since ? { gte: opts.since } : {}),
              ...(opts.until ? { lte: opts.until } : {})
            }
          }
        : {})
    },
    orderBy: [{ billDate: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    take: opts.limit,
    select: { id: true, billNumber: true, billDate: true, status: true }
  });
}
