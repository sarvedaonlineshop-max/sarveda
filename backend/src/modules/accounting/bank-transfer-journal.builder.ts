import {
  BANK_TRANSFER_MADE_CALC_VERSION,
  BANK_TRANSFER_MADE_EVENT_TYPE,
  BANK_TRANSFER_MAX_IMBALANCE_PAISE,
  bankTransferMadeUniqueKey
} from "./bank-account.constants";
import type { BankTransferJournalProposal, BankTransferSnapshot } from "./bank-transfer.types";
import { BankTransferJournalImbalanceError } from "./accounting-errors";

/** Pure BANK_TRANSFER_V1 — Dr destination / Cr source. */
export function buildBankTransferJournal(
  snapshot: BankTransferSnapshot,
  opts?: { failOnImbalance?: boolean }
): BankTransferJournalProposal {
  const failOnImbalance = opts?.failOnImbalance ?? true;
  const amount = snapshot.amountInPaise;

  const lines = [
    {
      accountCode: snapshot.destinationGlAccountCode,
      debitInPaise: amount,
      creditInPaise: 0,
      lineMemo: `${snapshot.transferKind} in ${snapshot.destinationAccountName}`,
      amountSource: "transfer.amount"
    },
    {
      accountCode: snapshot.sourceGlAccountCode,
      debitInPaise: 0,
      creditInPaise: amount,
      lineMemo: `${snapshot.transferKind} out ${snapshot.sourceAccountName}`,
      amountSource: "transfer.amount"
    }
  ];

  const totalDebitPaise = lines.reduce((s, l) => s + l.debitInPaise, 0);
  const totalCreditPaise = lines.reduce((s, l) => s + l.creditInPaise, 0);
  const imbalancePaise = totalDebitPaise - totalCreditPaise;
  const balanced = Math.abs(imbalancePaise) <= BANK_TRANSFER_MAX_IMBALANCE_PAISE;

  if (failOnImbalance && !balanced) {
    throw new BankTransferJournalImbalanceError(totalDebitPaise, totalCreditPaise, imbalancePaise);
  }

  const refMemo = snapshot.reference ? ` ref ${snapshot.reference}` : "";

  return {
    calcVersion: BANK_TRANSFER_MADE_CALC_VERSION,
    eventType: BANK_TRANSFER_MADE_EVENT_TYPE,
    uniqueKey: bankTransferMadeUniqueKey(snapshot.transferId),
    accountingDate: snapshot.transferDate,
    currency: snapshot.currency,
    memo: `${BANK_TRANSFER_MADE_CALC_VERSION} ${snapshot.transferNumber}${refMemo}`,
    balanced,
    imbalancePaise,
    totalDebitPaise,
    totalCreditPaise,
    lines,
    diagnostics: {
      transferKind: snapshot.transferKind,
      sourceGl: snapshot.sourceGlAccountCode,
      destGl: snapshot.destinationGlAccountCode,
      amountInPaise: amount
    },
    reconciliationMetadata: {
      transferId: snapshot.transferId,
      transferNumber: snapshot.transferNumber,
      sourceBankAccountId: snapshot.sourceBankAccountId,
      destinationBankAccountId: snapshot.destinationBankAccountId,
      sourceFingerprint: snapshot.sourcePayloadHash,
      calcVersion: BANK_TRANSFER_MADE_CALC_VERSION
    }
  };
}
