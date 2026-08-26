import {
  VENDOR_PAYMENT_ACCOUNT,
  VENDOR_PAYMENT_MADE_CALC_VERSION,
  VENDOR_PAYMENT_MADE_EVENT_TYPE,
  VENDOR_PAYMENT_MAX_IMBALANCE_PAISE,
  vendorPaymentMadeUniqueKey
} from "./vendor-payment.constants";
import type { VendorPaymentJournalProposal, VendorPaymentSnapshot } from "./vendor-payment.types";
import { VendorPaymentJournalImbalanceError } from "./accounting-errors";

/** Pure VENDOR_PAYMENT_MADE_V1 — one journal per payment. */
export function buildVendorPaymentMadeJournal(
  snapshot: VendorPaymentSnapshot,
  opts?: { failOnImbalance?: boolean }
): VendorPaymentJournalProposal {
  const failOnImbalance = opts?.failOnImbalance ?? true;
  const amount = snapshot.amountInPaise;
  const creditAccount = snapshot.creditGlAccountCode;

  const allocMemo = snapshot.allocations
    .map((a) => `${a.billNumber}:${a.amountInPaise}`)
    .join(", ");

  const lines = [
    {
      accountCode: VENDOR_PAYMENT_ACCOUNT.AP,
      debitInPaise: amount,
      creditInPaise: 0,
      lineMemo: `AP settlement ${snapshot.paymentNumber} [${allocMemo}]`,
      amountSource: "payment.amount"
    },
    {
      accountCode: creditAccount,
      debitInPaise: 0,
      creditInPaise: amount,
      lineMemo: `${snapshot.paymentMethod} ${snapshot.utr ? `UTR ${snapshot.utr}` : "cash"} ${snapshot.paymentNumber}`,
      amountSource: "payment.bank_cash"
    }
  ];

  const totalDebitPaise = lines.reduce((s, l) => s + l.debitInPaise, 0);
  const totalCreditPaise = lines.reduce((s, l) => s + l.creditInPaise, 0);
  const imbalancePaise = totalDebitPaise - totalCreditPaise;
  const balanced = Math.abs(imbalancePaise) <= VENDOR_PAYMENT_MAX_IMBALANCE_PAISE;

  if (failOnImbalance && !balanced) {
    throw new VendorPaymentJournalImbalanceError(totalDebitPaise, totalCreditPaise, imbalancePaise);
  }

  return {
    calcVersion: VENDOR_PAYMENT_MADE_CALC_VERSION,
    eventType: VENDOR_PAYMENT_MADE_EVENT_TYPE,
    uniqueKey: vendorPaymentMadeUniqueKey(snapshot.paymentId),
    accountingDate: snapshot.paymentDate,
    currency: snapshot.currency,
    memo: `${VENDOR_PAYMENT_MADE_CALC_VERSION} ${snapshot.paymentNumber} ${snapshot.vendorName}`,
    balanced,
    imbalancePaise,
    totalDebitPaise,
    totalCreditPaise,
    lines,
    diagnostics: {
      apDebitInPaise: amount,
      cashBankCreditInPaise: amount,
      paidAccountCode: snapshot.paidAccountCode,
      creditGlAccountCode: creditAccount,
      bankAccountId: snapshot.bankAccountId,
      paymentMethod: snapshot.paymentMethod,
      allocationCount: snapshot.allocations.length,
      warnings: []
    },
    reconciliationMetadata: {
      paymentId: snapshot.paymentId,
      paymentNumber: snapshot.paymentNumber,
      vendorId: snapshot.vendorId,
      bankAccountId: snapshot.bankAccountId,
      allocations: snapshot.allocations.map((a) => ({
        vendorBillId: a.vendorBillId,
        billNumber: a.billNumber,
        amountInPaise: a.amountInPaise
      })),
      sourceFingerprint: snapshot.sourcePayloadHash,
      calcVersion: VENDOR_PAYMENT_MADE_CALC_VERSION
    }
  };
}
