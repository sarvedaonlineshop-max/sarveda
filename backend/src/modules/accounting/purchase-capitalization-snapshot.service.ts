import { prisma } from "../../config/db";

import { classifyVariantForInventory } from "./inventory-classification";
import { computeBillLineNetAllocations } from "./vendor-bill-journal.builder";
import { loadVendorBillSnapshotById } from "./vendor-bill-snapshot.service";
import type { ReceiptLineCapitalizationSnapshot } from "./purchase-capitalization.types";

type BillMatch = {
  vendorBillId: string;
  vendorBillLineId: string;
  billNumber: string;
  billDate: Date;
  billLineQuantity: number;
  billLineRateInPaise: number;
  billSourceFingerprint: string;
  netUnitCostInPaise: number;
  allocatedBaseInPaise: number;
  capitalizationValueInPaise: number;
  previouslyCapitalizedQty: number;
};

export async function resolveBillMatchForReceiptLine(input: {
  purchaseOrderId: string;
  variantId: string;
  quantityReceived: number;
}): Promise<{ match: BillMatch | null; code?: "MISSING_VENDOR_BILL" | "AMBIGUOUS_BILL_MATCH" }> {
  const bills = await prisma.vendorBill.findMany({
    where: {
      purchaseOrderId: input.purchaseOrderId,
      status: { in: ["OPEN", "PAID"] }
    },
    include: { lines: true },
    orderBy: [{ billDate: "asc" }, { createdAt: "asc" }]
  });

  const stockBillLines = bills.flatMap((b) =>
    b.lines
      .filter((l) => l.variantId === input.variantId)
      .map((l) => ({ bill: b, line: l }))
  );

  if (stockBillLines.length === 0) {
    return { match: null, code: "MISSING_VENDOR_BILL" };
  }

  const billIds = [...new Set(stockBillLines.map((x) => x.bill.id))];
  if (billIds.length > 1) {
    return { match: null, code: "AMBIGUOUS_BILL_MATCH" };
  }

  const { bill, line } = stockBillLines[0]!;
  const billSnapshot = await loadVendorBillSnapshotById(bill.id);
  const allocations = computeBillLineNetAllocations(billSnapshot);
  const billAlloc = allocations.find((a) => a.billLineId === line.id);
  if (!billAlloc || billAlloc.classification !== "STOCK") {
    return { match: null, code: "MISSING_VENDOR_BILL" };
  }

  const previouslyCapitalizedQty = await sumCapitalizedQtyForBillLine(line.id);
  const capitalizationValueInPaise = Math.round(
    (billAlloc.allocatedBaseInPaise * input.quantityReceived) / Math.max(billAlloc.quantity, 1)
  );

  return {
    match: {
      vendorBillId: bill.id,
      vendorBillLineId: line.id,
      billNumber: bill.billNumber,
      billDate: bill.billDate,
      billLineQuantity: line.quantity,
      billLineRateInPaise: line.rateInPaise,
      billSourceFingerprint: billSnapshot.sourceFingerprint,
      netUnitCostInPaise:
        billAlloc.quantity > 0 ? Math.round(billAlloc.allocatedBaseInPaise / billAlloc.quantity) : 0,
      allocatedBaseInPaise: billAlloc.allocatedBaseInPaise,
      capitalizationValueInPaise,
      previouslyCapitalizedQty
    }
  };
}

export async function loadReceiptLineCapitalizationSnapshot(input: {
  receiptLineId: string;
}): Promise<ReceiptLineCapitalizationSnapshot | null> {
  const receiptLine = await prisma.purchaseReceiptLine.findUnique({
    where: { id: input.receiptLineId },
    include: {
      receipt: { include: { purchaseOrder: { select: { id: true, poNumber: true } } } },
      poLine: {
        include: {
          variant: {
            select: {
              id: true,
              sku: true,
              productRel: { select: { name: true, productType: true, catalogHidden: true } }
            }
          }
        }
      }
    }
  });

  if (!receiptLine?.poLine?.variantId || !receiptLine.poLine.variant) {
    return null;
  }

  const poLine = receiptLine.poLine;
  const variant = poLine.variant!;

  const variantId = poLine.variantId;
  if (!variantId) return null;

  const billResolved = await resolveBillMatchForReceiptLine({
    purchaseOrderId: receiptLine.receipt.purchaseOrderId,
    variantId,
    quantityReceived: receiptLine.quantityReceived
  });

  if (!billResolved.match) {
    return null;
  }

  const m = billResolved.match;
  const classification = classifyVariantForInventory({
    sku: variant.sku,
    productType: variant.productRel.productType,
    catalogHidden: variant.productRel.catalogHidden,
    onHand: 0
  });

  return {
    receiptId: receiptLine.receiptId,
    receiptLineId: receiptLine.id,
    receiptDate: receiptLine.receipt.receivedAt,
    purchaseOrderId: receiptLine.receipt.purchaseOrderId,
    poNumber: receiptLine.receipt.purchaseOrder.poNumber,
    poLineId: poLine.id,
    variantId,
    sku: variant.sku,
    productName: variant.productRel.name,
    quantityReceived: receiptLine.quantityReceived,
    poLineRateInPaise: poLine.rateInPaise,
    poLineQuantity: poLine.quantity,
    poLineReceivedQty: poLine.receivedQty,
    vendorBillId: m.vendorBillId,
    vendorBillLineId: m.vendorBillLineId,
    billNumber: m.billNumber,
    billDate: m.billDate,
    billLineQuantity: m.billLineQuantity,
    billLineRateInPaise: m.billLineRateInPaise,
    billSourceFingerprint: m.billSourceFingerprint,
    netUnitCostInPaise: m.netUnitCostInPaise,
    allocatedBaseInPaise: m.allocatedBaseInPaise,
    capitalizationValueInPaise: m.capitalizationValueInPaise,
    previouslyCapitalizedQty: m.previouslyCapitalizedQty,
    classification
  };
}

/** Load receipt context even when vendor bill is not yet available. */
export async function loadReceiptLineContext(receiptLineId: string) {
  const receiptLine = await prisma.purchaseReceiptLine.findUnique({
    where: { id: receiptLineId },
    include: {
      receipt: { include: { purchaseOrder: { select: { id: true, poNumber: true } } } },
      poLine: {
        include: {
          variant: {
            select: {
              id: true,
              sku: true,
              productRel: { select: { name: true, productType: true, catalogHidden: true } }
            }
          }
        }
      }
    }
  });
  return receiptLine;
}

export async function sumCapitalizedQtyForBillLine(vendorBillLineId: string): Promise<number> {
  const events = await prisma.accountingPostingEvent.findMany({
    where: {
      eventType: "INVENTORY_PURCHASE_CAPITALIZED",
      status: "POSTED"
    },
    select: { payloadJson: true }
  });

  let total = 0;
  for (const e of events) {
    const p = e.payloadJson as Record<string, unknown> | null;
    if (p?.vendorBillLineId === vendorBillLineId && typeof p.quantityReceived === "number") {
      total += p.quantityReceived;
    }
  }
  return total;
}

export async function isVendorBillPostedForCapitalization(billId: string): Promise<boolean> {
  const { getPostingEvent } = await import("./posting-event.service");
  const { VENDOR_BILL_POSTED_EVENT_TYPE, vendorBillPostedUniqueKey } = await import("./vendor-bill.constants");
  const event = await getPostingEvent(VENDOR_BILL_POSTED_EVENT_TYPE, vendorBillPostedUniqueKey(billId));
  return event?.status === "POSTED";
}

export async function findPurchaseCapitalizationDiscoveryCandidates(opts: {
  receiptId?: string;
  purchaseOrderId?: string;
  vendorBillId?: string;
  variantId?: string;
  since?: Date;
  until?: Date;
  limit: number;
}): Promise<Array<{ receiptLineId: string; receiptId: string; receivedAt: Date }>> {
  if (opts.receiptId) {
    const lines = await prisma.purchaseReceiptLine.findMany({
      where: { receiptId: opts.receiptId },
      include: { receipt: { select: { receivedAt: true } } },
      take: opts.limit
    });
    return lines.map((l) => ({
      receiptLineId: l.id,
      receiptId: l.receiptId,
      receivedAt: l.receipt.receivedAt
    }));
  }

  const receipts = await prisma.purchaseReceipt.findMany({
    where: {
      ...(opts.purchaseOrderId ? { purchaseOrderId: opts.purchaseOrderId } : {}),
      ...(opts.since || opts.until
        ? {
            receivedAt: {
              ...(opts.since ? { gte: opts.since } : {}),
              ...(opts.until ? { lte: opts.until } : {})
            }
          }
        : {})
    },
    include: {
      lines: {
        include: {
          poLine: { select: { variantId: true } }
        }
      }
    },
    orderBy: [{ receivedAt: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    take: opts.limit
  });

  const out: Array<{ receiptLineId: string; receiptId: string; receivedAt: Date }> = [];
  for (const r of receipts) {
    for (const line of r.lines) {
      if (opts.variantId && line.poLine.variantId !== opts.variantId) continue;
      if (opts.vendorBillId) {
        const bill = await prisma.vendorBill.findFirst({
          where: { id: opts.vendorBillId, purchaseOrderId: r.purchaseOrderId },
          select: { id: true }
        });
        if (!bill) continue;
      }
      out.push({ receiptLineId: line.id, receiptId: r.id, receivedAt: r.receivedAt });
      if (out.length >= opts.limit) return out;
    }
  }
  return out;
}
