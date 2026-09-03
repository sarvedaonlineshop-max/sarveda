import type { ProposedJournalLine } from "./order-paid-journal.types";

/**
 * Invert posted ORDER_PAID lines (swap debit/credit) for sale reversals.
 * Shared by ORDER_REFUNDED_FULL and ORDER_CANCELLED — do not duplicate invert math.
 */
export function invertPostedSaleLines(
  lines: ProposedJournalLine[],
  memoPrefix: string
): ProposedJournalLine[] {
  return lines.map((line) => ({
    accountCode: line.accountCode,
    accountName: line.accountName,
    debitInPaise: line.creditInPaise,
    creditInPaise: line.debitInPaise,
    amountSource: `invert:${line.amountSource}`,
    lineMemo: line.lineMemo
      ? `${memoPrefix}: ${line.lineMemo}`
      : `${memoPrefix} of ${line.accountCode}`
  }));
}
