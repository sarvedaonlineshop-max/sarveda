import { prisma } from "../../config/db";

import { getAccountingAccountByCode } from "./seed-coa";
import { computeBillLineNetAllocations } from "./vendor-bill-journal.builder";
import { loadVendorBillSnapshotById } from "./vendor-bill-snapshot.service";
import { VENDOR_BILL_POSTED_EVENT_TYPE } from "./vendor-bill.constants";
import { sumCapitalizedQtyForBillLine } from "./purchase-capitalization-snapshot.service";
import type { PurchaseCapitalizationClearingRow, PurchaseCapitalizationClearingStatus } from "./purchase-capitalization.types";

function deriveClearingStatus(input: {
  billedQuantity: number;
  receivedQuantity: number;
  capitalizedQuantity: number;
  clearing1210OutstandingInPaise: number;
  warnings: string[];
}): PurchaseCapitalizationClearingStatus {
  if (input.warnings.some((w) => w.includes("COST_MISMATCH"))) return "COST_MISMATCH";
  if (input.warnings.some((w) => w.includes("QUANTITY_MISMATCH"))) return "QUANTITY_MISMATCH";
  if (input.warnings.some((w) => w.includes("DATA_GAP"))) return "DATA_GAP";

  if (input.capitalizedQuantity <= 0 && input.receivedQuantity <= 0) {
    return "WAITING_FOR_RECEIPT";
  }
  if (input.capitalizedQuantity <= 0 && input.receivedQuantity > 0) {
    return "WAITING_FOR_BILL";
  }
  if (input.clearing1210OutstandingInPaise === 0 && input.capitalizedQuantity >= input.billedQuantity) {
    return "CLEARED";
  }
  if (input.capitalizedQuantity > 0 && input.clearing1210OutstandingInPaise > 0) {
    return "PARTIALLY_CAPITALIZED";
  }
  if (input.receivedQuantity > input.billedQuantity) {
    return "QUANTITY_MISMATCH";
  }
  return "PARTIALLY_CAPITALIZED";
}

export async function buildPurchaseCapitalizationClearingReport(opts?: {
  vendorBillId?: string;
  purchaseOrderId?: string;
  limit?: number;
}) {
  const limit = Math.min(Math.max(opts?.limit ?? 100, 1), 500);

  const bills = await prisma.vendorBill.findMany({
    where: {
      status: { in: ["OPEN", "PAID"] },
      ...(opts?.vendorBillId ? { id: opts.vendorBillId } : {}),
      ...(opts?.purchaseOrderId ? { purchaseOrderId: opts.purchaseOrderId } : {})
    },
    include: {
      lines: true,
      purchaseOrder: { select: { id: true, poNumber: true, lines: { include: { receiptLines: true } } } }
    },
    orderBy: [{ billDate: "desc" }],
    take: limit
  });

  const clearingAccount = await getAccountingAccountByCode("1210");
  let clearing1210GlBalance = 0;
  if (clearingAccount) {
    const agg = await prisma.accountingJournalLine.aggregate({
      where: { accountId: clearingAccount.id, journalEntry: { status: "POSTED" } },
      _sum: { debitInPaise: true, creditInPaise: true }
    });
    clearing1210GlBalance = (agg._sum.debitInPaise ?? 0) - (agg._sum.creditInPaise ?? 0);
  }

  const rows: PurchaseCapitalizationClearingRow[] = [];

  for (const bill of bills) {
    const billPosted = await prisma.accountingPostingEvent.findFirst({
      where: { eventType: VENDOR_BILL_POSTED_EVENT_TYPE, sourceId: bill.id, status: "POSTED" }
    });

    let snapshot;
    try {
      snapshot = billPosted ? await loadVendorBillSnapshotById(bill.id) : null;
    } catch {
      snapshot = null;
    }

    const allocations = snapshot ? computeBillLineNetAllocations(snapshot) : [];

    for (const line of bill.lines.filter((l) => l.variantId)) {
      const alloc = allocations.find((a) => a.billLineId === line.id);
      const billedValue = alloc?.allocatedBaseInPaise ?? line.quantity * line.rateInPaise;

      const poLine = bill.purchaseOrder?.lines.find((pl) => pl.variantId === line.variantId);
      const receivedQuantity =
        poLine?.receiptLines.reduce((s, rl) => s + rl.quantityReceived, 0) ?? poLine?.receivedQty ?? 0;

      const capitalizedQuantity = await sumCapitalizedQtyForBillLine(line.id);
      const capitalizedValueInPaise = capitalizedQuantity * (alloc?.netUnitCostInPaise ?? line.rateInPaise);

      const warnings: string[] = [];
      if (poLine && poLine.rateInPaise !== line.rateInPaise) {
        warnings.push("COST_MISMATCH: PO rate differs from bill rate");
      }
      if (poLine && poLine.quantity !== line.quantity) {
        warnings.push("QUANTITY_MISMATCH: PO qty differs from bill qty");
      }
      if (!billPosted) {
        warnings.push("WAITING_FOR_BILL: Vendor bill not posted to 1210/AP");
      }
      if (receivedQuantity > line.quantity) {
        warnings.push("OVER_RECEIPT: received exceeds billed");
      }

      const clearing1210BilledInPaise = billPosted && alloc?.classification === "STOCK" ? billedValue : 0;
      const clearing1210CapitalizedInPaise = capitalizedValueInPaise;
      const clearing1210OutstandingInPaise = Math.max(
        0,
        clearing1210BilledInPaise - clearing1210CapitalizedInPaise
      );

      rows.push({
        vendorBillId: bill.id,
        billNumber: bill.billNumber,
        purchaseOrderId: bill.purchaseOrderId,
        poNumber: bill.purchaseOrder?.poNumber ?? null,
        variantId: line.variantId,
        sku: line.sku,
        billedQuantity: line.quantity,
        billedValueInPaise: billedValue,
        receivedQuantity,
        capitalizedQuantity,
        capitalizedValueInPaise,
        clearing1210BilledInPaise,
        clearing1210CapitalizedInPaise,
        clearing1210OutstandingInPaise,
        status: deriveClearingStatus({
          billedQuantity: line.quantity,
          receivedQuantity,
          capitalizedQuantity,
          clearing1210OutstandingInPaise,
          warnings
        }),
        warnings
      });
    }
  }

  return {
    version: "purchase_capitalization_clearing_v1",
    generatedAt: new Date().toISOString(),
    rowCount: rows.length,
    clearing1210GlBalanceInPaise: clearing1210GlBalance,
    rows
  };
}
