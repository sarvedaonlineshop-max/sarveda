import { randomUUID } from "crypto";

import { enrichLines, sumDocumentTotals } from "../../src/modules/purchases/purchases.service";
import { prisma } from "./commerce";
import { createTestProductWithInventory } from "./commerce";

export type SyntheticVendorOpts = {
  name?: string;
  gstin?: string | null;
  billingState?: string | null;
  billingCountry?: string;
  currency?: string;
};

export async function createSyntheticVendor(opts: SyntheticVendorOpts = {}) {
  const suffix = randomUUID().slice(0, 8);
  return prisma.vendor.create({
    data: {
      name: opts.name ?? `TEST-ACC-PURCHASE-VENDOR-${suffix}`,
      gstin: opts.gstin === undefined ? "29AAAAA0000A1Z5" : opts.gstin,
      pan: "AAAAA0000A",
      billingState: opts.billingState === undefined ? "Karnataka" : opts.billingState,
      billingCountry: opts.billingCountry ?? "IN",
      currency: opts.currency ?? "INR",
      paymentTerms: "Net 30",
      isActive: true
    }
  });
}

export type SyntheticBillLineInput = {
  variantId?: string | null;
  itemName?: string;
  quantity: number;
  rateInPaise: number;
  taxClass?: string | null;
};

export type SyntheticBillOpts = {
  vendorId?: string;
  vendor?: SyntheticVendorOpts;
  status?: "DRAFT" | "OPEN" | "PAID" | "VOID";
  referenceNumber?: string | null;
  discountInPaise?: number;
  adjustmentInPaise?: number;
  purchaseOrderId?: string | null;
  paidInPaise?: number;
  lines: SyntheticBillLineInput[];
  billDate?: Date;
};

/**
 * Create a clearly tagged test VendorBill with correct purchases arithmetic.
 */
export async function createSyntheticVendorBill(opts: SyntheticBillOpts) {
  const vendor =
    opts.vendorId
      ? await prisma.vendor.findUniqueOrThrow({ where: { id: opts.vendorId } })
      : await createSyntheticVendor(opts.vendor);

  const rawLines = opts.lines.map((l, i) => ({
    variantId: l.variantId ?? null,
    itemName: l.itemName ?? (l.variantId ? "Stock item" : "Service item"),
    quantity: l.quantity,
    rateInPaise: l.rateInPaise,
    taxClass: l.taxClass ?? (l.variantId ? "standard" : "gst18"),
    sortOrder: i
  }));
  const enriched = await enrichLines(rawLines);
  const totals = sumDocumentTotals(enriched, {
    discountInPaise: opts.discountInPaise ?? 0,
    adjustmentInPaise: opts.adjustmentInPaise ?? 0
  });

  const suffix = randomUUID().slice(0, 8);
  const bill = await prisma.vendorBill.create({
    data: {
      billNumber: `TEST-ACC-BILL-${suffix}`,
      vendorId: vendor.id,
      purchaseOrderId: opts.purchaseOrderId ?? null,
      status: opts.status ?? "OPEN",
      referenceNumber: opts.referenceNumber === undefined ? `SUP-INV-${suffix}` : opts.referenceNumber,
      billDate: opts.billDate ?? new Date(),
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      subtotalInPaise: totals.subtotalInPaise,
      discountInPaise: totals.discountInPaise,
      adjustmentInPaise: opts.adjustmentInPaise ?? 0,
      taxInPaise: totals.taxInPaise,
      totalInPaise: totals.totalInPaise,
      paidInPaise: opts.paidInPaise ?? (opts.status === "PAID" ? totals.totalInPaise : 0),
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
    include: { lines: true, vendor: true }
  });

  return bill;
}

export async function createStockVariantForPurchase() {
  return createTestProductWithInventory({ onHand: 10, saleInPaise: 100_000 });
}

export type SyntheticPoOpts = {
  vendorId: string;
  variantId: string;
  quantity: number;
  rateInPaise: number;
  status?: "DRAFT" | "SENT" | "PARTIALLY_RECEIVED" | "RECEIVED" | "CANCELLED";
  poNumber?: string;
  taxClass?: string;
};

export async function createSyntheticPurchaseOrder(opts: SyntheticPoOpts) {
  const suffix = randomUUID().slice(0, 8);
  const taxClass = opts.taxClass ?? "standard";
  const base = opts.quantity * opts.rateInPaise;
  const taxInPaise = Math.round((base * 18) / 100);
  return prisma.purchaseOrder.create({
    data: {
      poNumber: opts.poNumber ?? `TEST-ACC-PO-${suffix}`,
      vendorId: opts.vendorId,
      status: opts.status ?? "SENT",
      subtotalInPaise: base,
      taxInPaise,
      totalInPaise: base + taxInPaise,
      lines: {
        create: [
          {
            variantId: opts.variantId,
            itemName: "Test stock item",
            quantity: opts.quantity,
            rateInPaise: opts.rateInPaise,
            taxClass,
            taxInPaise,
            lineTotalInPaise: base + taxInPaise
          }
        ]
      }
    },
    include: { lines: true, vendor: true }
  });
}

export async function cleanupSyntheticPurchaseCapitalization(opts: {
  receiptIds?: string[];
  poIds?: string[];
  billIds?: string[];
  variantIds?: string[];
}) {
  for (const receiptId of opts.receiptIds ?? []) {
    await prisma.purchaseReceipt.delete({ where: { id: receiptId } }).catch(() => undefined);
  }
  for (const poId of opts.poIds ?? []) {
    await prisma.purchaseOrder.delete({ where: { id: poId } }).catch(() => undefined);
  }
  for (const billId of opts.billIds ?? []) {
    await cleanupSyntheticVendorBill(billId);
  }
}

export async function cleanupSyntheticVendorBill(billId: string) {
  const bill = await prisma.vendorBill.findUnique({
    where: { id: billId },
    select: { vendorId: true, purchaseOrderId: true }
  });
  if (!bill) return;
  await prisma.vendorBill.delete({ where: { id: billId } }).catch(() => undefined);
  const remaining = await prisma.vendorBill.count({ where: { vendorId: bill.vendorId } });
  const expenses = await prisma.expense.count({ where: { vendorId: bill.vendorId } });
  const pos = await prisma.purchaseOrder.count({ where: { vendorId: bill.vendorId } });
  if (remaining === 0 && expenses === 0 && pos === 0) {
    await prisma.vendor.delete({ where: { id: bill.vendorId } }).catch(() => undefined);
  }
}
