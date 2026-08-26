import type { ExpenseAmountSemantics, ExpenseSnapshot } from "./expense.types";

/**
 * Expense amount semantics (traced from purchases create + Phase 3C architecture):
 *
 * taxInclusive = false (default):
 *   amountInPaise = net / taxable base
 *   taxInPaise = GST on top
 *   gross = amount + tax
 *
 * taxInclusive = true:
 *   amountInPaise = gross payment (tax included)
 *   taxInPaise = GST portion inside amount
 *   net = amount - tax
 *
 * Fail closed on inconsistent combinations.
 */
export function resolveExpenseAmountSemantics(snapshot: ExpenseSnapshot): {
  ok: boolean;
  amount: ExpenseAmountSemantics | null;
  code?: string;
  reason?: string;
} {
  const amount = snapshot.amountInPaise;
  const tax = snapshot.taxInPaise;
  if (amount <= 0) {
    return { ok: false, amount: null, code: "AMOUNT_SEMANTICS_INVALID", reason: "amountInPaise must be > 0" };
  }
  if (tax < 0) {
    return { ok: false, amount: null, code: "AMOUNT_SEMANTICS_INVALID", reason: "taxInPaise cannot be negative" };
  }

  if (snapshot.taxInclusive) {
    if (tax > amount) {
      return {
        ok: false,
        amount: null,
        code: "AMOUNT_SEMANTICS_INVALID",
        reason: "taxInclusive: taxInPaise cannot exceed amountInPaise"
      };
    }
    const net = amount - tax;
    if (net <= 0 && tax > 0) {
      return {
        ok: false,
        amount: null,
        code: "AMOUNT_SEMANTICS_INVALID",
        reason: "taxInclusive: net expense must be > 0 when tax present"
      };
    }
    return {
      ok: true,
      amount: {
        netExpenseInPaise: net,
        taxInPaise: tax,
        grossPaymentInPaise: amount,
        taxInclusive: true
      }
    };
  }

  const gross = amount + tax;
  return {
    ok: true,
    amount: {
      netExpenseInPaise: amount,
      taxInPaise: tax,
      grossPaymentInPaise: gross,
      taxInclusive: false
    }
  };
}
