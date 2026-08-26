import { prisma } from "../../config/db";

import { normalizeSupplierDocumentRef } from "./expense.constants";
import type { ExpenseDuplicateClass, ExpenseSnapshot } from "./expense.types";
import { resolveExpenseAmountSemantics } from "./expense-amount";

const AMOUNT_TOLERANCE_PAISE = 2;
const DATE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export type ExpenseDuplicateResult = {
  classification: ExpenseDuplicateClass;
  billIds: string[];
  reasons: string[];
};

/**
 * High-confidence: same vendor + same normalized invoice/ref + matching gross.
 * Possible: same vendor + same ref with amount mismatch, or same vendor + amount match within date window.
 */
export async function classifyExpenseBillDuplicate(
  snapshot: ExpenseSnapshot
): Promise<ExpenseDuplicateResult> {
  if (!snapshot.vendorId) {
    return { classification: "NO_DUPLICATE", billIds: [], reasons: [] };
  }

  const semantics = resolveExpenseAmountSemantics(snapshot);
  if (!semantics.ok || !semantics.amount) {
    return { classification: "NO_DUPLICATE", billIds: [], reasons: [] };
  }
  const gross = semantics.amount.grossPaymentInPaise;
  const inv = normalizeSupplierDocumentRef(snapshot.invoiceNumber);
  const ref = normalizeSupplierDocumentRef(snapshot.referenceNumber);
  const docKeys = [...new Set([inv, ref].filter(Boolean) as string[])];

  const bills = await prisma.vendorBill.findMany({
    where: {
      vendorId: snapshot.vendorId,
      status: { in: ["OPEN", "PAID", "DRAFT"] }
    },
    select: {
      id: true,
      billNumber: true,
      referenceNumber: true,
      totalInPaise: true,
      taxInPaise: true,
      billDate: true
    },
    take: 200
  });

  const high: string[] = [];
  const possible: string[] = [];
  const reasons: string[] = [];

  for (const b of bills) {
    const billRef = normalizeSupplierDocumentRef(b.referenceNumber);
    const amountMatch = Math.abs(b.totalInPaise - gross) <= AMOUNT_TOLERANCE_PAISE;
    const sharedDoc = billRef != null && docKeys.includes(billRef);
    const dateClose =
      Math.abs(b.billDate.getTime() - snapshot.expenseDate.getTime()) <= DATE_WINDOW_MS;

    if (sharedDoc && amountMatch) {
      high.push(b.id);
      reasons.push(`HIGH:${b.billNumber}:same_vendor_doc_amount`);
      continue;
    }
    if (sharedDoc && !amountMatch) {
      possible.push(b.id);
      reasons.push(`POSSIBLE:${b.billNumber}:same_doc_amount_mismatch`);
      continue;
    }
    if (!sharedDoc && amountMatch && dateClose && (inv || ref || billRef)) {
      // Without shared doc but close date+amount is only possible if both have some identity signal
      possible.push(b.id);
      reasons.push(`POSSIBLE:${b.billNumber}:amount_date_near`);
    } else if (!sharedDoc && amountMatch && dateClose && !inv && !ref) {
      possible.push(b.id);
      reasons.push(`POSSIBLE:${b.billNumber}:amount_date_near_no_ref`);
    }
  }

  if (high.length) {
    return {
      classification: "DUPLICATE_SUPPLIER_DOCUMENT",
      billIds: [...new Set(high)],
      reasons
    };
  }
  if (possible.length) {
    return {
      classification: "POSSIBLE_DUPLICATE_BILL_EXPENSE",
      billIds: [...new Set(possible)],
      reasons
    };
  }
  return { classification: "NO_DUPLICATE", billIds: [], reasons: [] };
}

export type BillExpenseDuplicateResult = {
  classification: ExpenseDuplicateClass;
  expenseIds: string[];
  reasons: string[];
};

/** Reverse lookup: possible Bill+Expense duplicates for a VendorBill row. */
export async function findExpenseDuplicatesForBill(billId: string): Promise<BillExpenseDuplicateResult> {
  const bill = await prisma.vendorBill.findUnique({
    where: { id: billId },
    select: {
      id: true,
      vendorId: true,
      referenceNumber: true,
      totalInPaise: true,
      billDate: true
    }
  });
  if (!bill?.vendorId) {
    return { classification: "NO_DUPLICATE", expenseIds: [], reasons: [] };
  }

  const billRef = normalizeSupplierDocumentRef(bill.referenceNumber);
  const expenses = await prisma.expense.findMany({
    where: {
      vendorId: bill.vendorId,
      status: { in: ["RECORDED", "DRAFT"] }
    },
    select: {
      id: true,
      invoiceNumber: true,
      referenceNumber: true,
      amountInPaise: true,
      taxInPaise: true,
      taxInclusive: true,
      expenseDate: true
    },
    take: 200
  });

  const high: string[] = [];
  const possible: string[] = [];
  const reasons: string[] = [];

  for (const e of expenses) {
    const inv = normalizeSupplierDocumentRef(e.invoiceNumber);
    const ref = normalizeSupplierDocumentRef(e.referenceNumber);
    const docKeys = [...new Set([inv, ref].filter(Boolean) as string[])];
    const gross = e.taxInclusive
      ? e.amountInPaise
      : e.amountInPaise + e.taxInPaise;
    const amountMatch = Math.abs(bill.totalInPaise - gross) <= AMOUNT_TOLERANCE_PAISE;
    const sharedDoc = billRef != null && docKeys.includes(billRef);
    const dateClose = Math.abs(bill.billDate.getTime() - e.expenseDate.getTime()) <= DATE_WINDOW_MS;

    if (sharedDoc && amountMatch) {
      high.push(e.id);
      reasons.push(`HIGH:expense:${e.id}:same_vendor_doc_amount`);
      continue;
    }
    if (sharedDoc && !amountMatch) {
      possible.push(e.id);
      reasons.push(`POSSIBLE:expense:${e.id}:same_doc_amount_mismatch`);
      continue;
    }
    if (!sharedDoc && amountMatch && dateClose && (inv || ref || billRef)) {
      possible.push(e.id);
      reasons.push(`POSSIBLE:expense:${e.id}:amount_date_near`);
    }
  }

  if (high.length) {
    return {
      classification: "DUPLICATE_SUPPLIER_DOCUMENT",
      expenseIds: [...new Set(high)],
      reasons
    };
  }
  if (possible.length) {
    return {
      classification: "POSSIBLE_DUPLICATE_BILL_EXPENSE",
      expenseIds: [...new Set(possible)],
      reasons
    };
  }
  return { classification: "NO_DUPLICATE", expenseIds: [], reasons: [] };
}
