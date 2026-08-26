import { prisma } from "../../config/db";

import {
  ALLOWED_EXPENSE_COA_CODES,
  EXPENSE_PAYMENT_ACCOUNT,
  EXPENSE_RECORDED_EVENT_TYPE,
  expenseRecordedUniqueKey
} from "./expense.constants";
import { resolveExpenseAmountSemantics } from "./expense-amount";
import type { ExpenseDuplicateClass, ExpenseEligibility, ExpenseSnapshot } from "./expense.types";

export function isExpenseEligibleForPosting(
  snapshot: ExpenseSnapshot,
  opts?: {
    existingPosted?: boolean;
    duplicateClass?: ExpenseDuplicateClass;
    acknowledgePossibleDuplicate?: boolean;
  }
): ExpenseEligibility {
  const warnings: string[] = [];

  if (snapshot.status === "DRAFT") {
    return { eligible: false, code: "DRAFT", reason: "DRAFT expenses do not post", warnings };
  }
  if (snapshot.status !== "RECORDED") {
    return { eligible: false, code: "DATA_GAP", reason: `Unsupported status ${snapshot.status}`, warnings };
  }
  if (opts?.existingPosted) {
    return { eligible: true, code: "ALREADY_POSTED", warnings: ["Already posted — idempotent"] };
  }

  if ((snapshot.currency || "INR").toUpperCase() !== "INR") {
    return {
      eligible: false,
      code: "MULTI_CURRENCY_DEFERRED",
      reason: "Non-INR deferred in V1",
      warnings
    };
  }

  if (snapshot.reverseCharge) {
    return {
      eligible: false,
      code: "RCM_DATA_GAP",
      reason: "Reverse charge expenses deferred — RCM journals not implemented",
      warnings
    };
  }

  if (!snapshot.mappedExpenseAccountCode) {
    return {
      eligible: false,
      code: "EXPENSE_ACCOUNT_UNMAPPED",
      reason: `No ACTIVE CoA mapping for expenseAccount="${snapshot.expenseAccount}"`,
      warnings
    };
  }
  if (!ALLOWED_EXPENSE_COA_CODES.has(snapshot.mappedExpenseAccountCode)) {
    return {
      eligible: false,
      code: "INVALID_EXPENSE_COA",
      reason: `Mapped CoA ${snapshot.mappedExpenseAccountCode} not in allowed EXPENSE set`,
      warnings
    };
  }

  if (!snapshot.resolvedPaymentGlAccountCode) {
    return {
      eligible: false,
      code: "PAYMENT_ACCOUNT_UNMAPPED",
      reason: snapshot.paidThrough
        ? snapshot.mappedPaymentBankAccountId
          ? `Bank account mapping inactive or invalid for paidThrough="${snapshot.paidThrough}"`
          : `No ACTIVE payment mapping for paidThrough="${snapshot.paidThrough}"`
        : "paidThrough empty — unpaid payable expenses use VendorBill, not Expense posting",
      warnings
    };
  }

  const amount = resolveExpenseAmountSemantics(snapshot);
  if (!amount.ok) {
    return {
      eligible: false,
      code: "AMOUNT_SEMANTICS_INVALID",
      reason: amount.reason,
      warnings
    };
  }

  const dup = opts?.duplicateClass ?? "NO_DUPLICATE";
  if (dup === "DUPLICATE_SUPPLIER_DOCUMENT") {
    return {
      eligible: false,
      code: "DUPLICATE_RISK",
      reason: "High-confidence VendorBill duplicate — posting blocked",
      warnings
    };
  }
  if (dup === "POSSIBLE_DUPLICATE_BILL_EXPENSE") {
    if (!opts?.acknowledgePossibleDuplicate) {
      return {
        eligible: false,
        code: "DUPLICATE_RISK",
        reason: "Possible Bill+Expense duplicate — requires acknowledgePossibleDuplicate",
        warnings: ["POSSIBLE_DUPLICATE_BILL_EXPENSE"],
        requiresDuplicateAck: true
      };
    }
    warnings.push("POSSIBLE_DUPLICATE_ACKNOWLEDGED");
  }

  return { eligible: true, code: "ELIGIBLE", warnings };
}

export async function evaluateExpenseEligibility(
  snapshot: ExpenseSnapshot,
  opts?: {
    duplicateClass?: ExpenseDuplicateClass;
    acknowledgePossibleDuplicate?: boolean;
  }
): Promise<ExpenseEligibility> {
  const existing = await prisma.accountingPostingEvent.findUnique({
    where: {
      eventType_uniqueKey: {
        eventType: EXPENSE_RECORDED_EVENT_TYPE,
        uniqueKey: expenseRecordedUniqueKey(snapshot.expenseId)
      }
    },
    select: { status: true }
  });
  return isExpenseEligibleForPosting(snapshot, {
    existingPosted: existing?.status === "POSTED",
    duplicateClass: opts?.duplicateClass,
    acknowledgePossibleDuplicate: opts?.acknowledgePossibleDuplicate
  });
}
