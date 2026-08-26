import { prisma } from "../../config/db";

import { VENDOR_BILL_POSTED_EVENT_TYPE, vendorBillPostedUniqueKey } from "./vendor-bill.constants";
import { VENDOR_PAYMENT_MADE_EVENT_TYPE } from "./vendor-payment.constants";

/**
 * Native AP outstanding for a bill:
 * VENDOR_BILL_POSTED total − sum(POSTED VendorPayment allocations).
 * Does NOT use VendorBill.paidInPaise.
 */
export async function getNativeBillApCredit(billId: string): Promise<number | null> {
  const event = await prisma.accountingPostingEvent.findUnique({
    where: {
      eventType_uniqueKey: {
        eventType: VENDOR_BILL_POSTED_EVENT_TYPE,
        uniqueKey: vendorBillPostedUniqueKey(billId)
      }
    },
    include: { journalEntry: true }
  });
  if (!event || event.status !== "POSTED" || !event.journalEntry) return null;
  // AP credit equals bill total stored on journal credit side (or payload)
  const bill = await prisma.vendorBill.findUnique({
    where: { id: billId },
    select: { totalInPaise: true }
  });
  return bill?.totalInPaise ?? event.journalEntry.totalCreditInPaise;
}

export async function getPostedAllocationSumForBill(
  billId: string,
  opts?: { excludePaymentId?: string }
): Promise<number> {
  const rows = await prisma.accountingVendorPaymentAllocation.findMany({
    where: {
      vendorBillId: billId,
      payment: {
        status: "POSTED",
        ...(opts?.excludePaymentId ? { id: { not: opts.excludePaymentId } } : {})
      }
    },
    select: { amountInPaise: true }
  });
  return rows.reduce((s, r) => s + r.amountInPaise, 0);
}

export async function getNativeBillOutstanding(
  billId: string,
  opts?: { excludePaymentId?: string }
): Promise<{
  hasApJournal: boolean;
  apCreditInPaise: number;
  allocatedInPaise: number;
  outstandingInPaise: number;
}> {
  const ap = await getNativeBillApCredit(billId);
  if (ap == null) {
    return {
      hasApJournal: false,
      apCreditInPaise: 0,
      allocatedInPaise: 0,
      outstandingInPaise: 0
    };
  }
  const allocated = await getPostedAllocationSumForBill(billId, opts);
  return {
    hasApJournal: true,
    apCreditInPaise: ap,
    allocatedInPaise: allocated,
    outstandingInPaise: Math.max(0, ap - allocated)
  };
}

export async function listOpenBillsWithNativeOutstanding(vendorId: string) {
  const bills = await prisma.vendorBill.findMany({
    where: { vendorId, status: { in: ["OPEN", "PAID"] } },
    orderBy: [{ billDate: "asc" }, { billNumber: "asc" }],
    select: {
      id: true,
      billNumber: true,
      billDate: true,
      dueDate: true,
      totalInPaise: true,
      paidInPaise: true,
      status: true,
      referenceNumber: true
    }
  });

  const rows = [];
  for (const b of bills) {
    const o = await getNativeBillOutstanding(b.id);
    if (!o.hasApJournal || o.outstandingInPaise <= 0) continue;
    rows.push({
      ...b,
      nativeApCreditInPaise: o.apCreditInPaise,
      nativeAllocatedInPaise: o.allocatedInPaise,
      nativeOutstandingInPaise: o.outstandingInPaise
    });
  }
  return rows;
}

/** True if a VENDOR_PAYMENT_MADE event exists for this payment. */
export async function hasPostedVendorPaymentEvent(paymentId: string): Promise<boolean> {
  const { vendorPaymentMadeUniqueKey } = await import("./vendor-payment.constants");
  const event = await prisma.accountingPostingEvent.findUnique({
    where: {
      eventType_uniqueKey: {
        eventType: VENDOR_PAYMENT_MADE_EVENT_TYPE,
        uniqueKey: vendorPaymentMadeUniqueKey(paymentId)
      }
    },
    select: { status: true }
  });
  return event?.status === "POSTED";
}
