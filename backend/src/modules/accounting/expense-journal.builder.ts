import { ExpenseJournalImbalanceError } from "./accounting-errors";
import { resolveExpenseAmountSemantics } from "./expense-amount";
import { resolveExpenseGst } from "./expense-gst";
import {
  EXPENSE_GST_ACCOUNT,
  EXPENSE_RECORDED_CALC_VERSION,
  EXPENSE_RECORDED_EVENT_TYPE,
  expenseRecordedUniqueKey
} from "./expense.constants";
import type {
  ExpenseDuplicateClass,
  ExpenseJournalProposal,
  ExpenseSnapshot
} from "./expense.types";

export function buildExpenseRecordedJournal(
  snapshot: ExpenseSnapshot,
  opts: {
    duplicateClass: ExpenseDuplicateClass;
    duplicateBillIds?: string[];
    failOnImbalance?: boolean;
    failOnGstGap?: boolean;
  }
): ExpenseJournalProposal {
  const warnings: string[] = [];
  const amountRes = resolveExpenseAmountSemantics(snapshot);
  if (!amountRes.ok || !amountRes.amount) {
    throw new ExpenseJournalImbalanceError(0, 0, 0, {
      reason: amountRes.reason ?? "AMOUNT_SEMANTICS_INVALID"
    });
  }
  const amount = amountRes.amount;
  const expenseCode = snapshot.mappedExpenseAccountCode;
  const paymentCode = snapshot.resolvedPaymentGlAccountCode;
  if (!expenseCode || !paymentCode) {
    throw new ExpenseJournalImbalanceError(0, 0, 0, { reason: "UNMAPPED_ACCOUNTS" });
  }

  const gst = resolveExpenseGst(snapshot, amount.taxInPaise);
  if (amount.taxInPaise > 0 && !gst.gstRecognized) {
    warnings.push(...gst.dataGapCodes);
    if (opts.failOnGstGap !== false) {
      throw new ExpenseJournalImbalanceError(0, 0, 0, {
        reason: "GST_DATA_GAP",
        dataGapCodes: gst.dataGapCodes
      });
    }
  }

  const lines: ExpenseJournalProposal["lines"] = [];
  lines.push({
    accountCode: expenseCode,
    debitInPaise: amount.netExpenseInPaise,
    creditInPaise: 0,
    lineMemo: `Expense ${snapshot.expenseAccount}`
  });

  if (gst.gstRecognized && amount.taxInPaise > 0) {
    if (gst.jurisdiction === "INTRA_STATE") {
      if (gst.cgstInPaise > 0) {
        lines.push({
          accountCode: EXPENSE_GST_ACCOUNT.INPUT_CGST,
          debitInPaise: gst.cgstInPaise,
          creditInPaise: 0,
          lineMemo: "Provisional Input CGST"
        });
      }
      if (gst.sgstInPaise > 0) {
        lines.push({
          accountCode: EXPENSE_GST_ACCOUNT.INPUT_SGST,
          debitInPaise: gst.sgstInPaise,
          creditInPaise: 0,
          lineMemo: "Provisional Input SGST"
        });
      }
    } else if (gst.jurisdiction === "INTER_STATE" && gst.igstInPaise > 0) {
      lines.push({
        accountCode: EXPENSE_GST_ACCOUNT.INPUT_IGST,
        debitInPaise: gst.igstInPaise,
        creditInPaise: 0,
        lineMemo: "Provisional Input IGST"
      });
    }
  }

  lines.push({
    accountCode: paymentCode,
    debitInPaise: 0,
    creditInPaise: amount.grossPaymentInPaise,
    lineMemo: `Paid via ${snapshot.paidThrough ?? paymentCode}`
  });

  const totalDebitPaise = lines.reduce((s, l) => s + l.debitInPaise, 0);
  const totalCreditPaise = lines.reduce((s, l) => s + l.creditInPaise, 0);
  const imbalancePaise = totalDebitPaise - totalCreditPaise;
  const balanced = imbalancePaise === 0;

  if (!balanced && opts.failOnImbalance !== false) {
    throw new ExpenseJournalImbalanceError(totalDebitPaise, totalCreditPaise, imbalancePaise);
  }

  if (opts.duplicateClass === "POSSIBLE_DUPLICATE_BILL_EXPENSE") {
    warnings.push("POSSIBLE_DUPLICATE_BILL_EXPENSE");
  }

  return {
    calcVersion: EXPENSE_RECORDED_CALC_VERSION,
    eventType: EXPENSE_RECORDED_EVENT_TYPE,
    uniqueKey: expenseRecordedUniqueKey(snapshot.expenseId),
    accountingDate: snapshot.expenseDate,
    currency: (snapshot.currency || "INR").toUpperCase(),
    memo: `${EXPENSE_RECORDED_CALC_VERSION} ${snapshot.expenseAccount}`,
    balanced,
    totalDebitPaise,
    totalCreditPaise,
    imbalancePaise,
    lines,
    diagnostics: {
      amount,
      gst,
      expenseAccountCode: expenseCode,
      paymentAccountCode: paymentCode,
      duplicateClass: opts.duplicateClass,
      duplicateBillIds: opts.duplicateBillIds ?? [],
      warnings
    },
    reconciliationMetadata: {
      expenseId: snapshot.expenseId,
      vendorId: snapshot.vendorId,
      sourceFingerprint: snapshot.sourceFingerprint,
      calcVersion: EXPENSE_RECORDED_CALC_VERSION,
      invoiceNumber: snapshot.invoiceNumber,
      referenceNumber: snapshot.referenceNumber
    }
  };
}
