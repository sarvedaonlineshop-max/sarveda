/** V1: exact reference match allows ±3 calendar days from accounting date. */
export const STATEMENT_EXACT_DATE_TOLERANCE_DAYS = 3;

/** V1: amount-only / weak reference search window (POSSIBLE candidates). */
export const STATEMENT_POSSIBLE_DATE_TOLERANCE_DAYS = 7;

/** V1: journal leg search window (bounded, not unbounded). */
export const STATEMENT_JOURNAL_SEARCH_DAYS = 90;

/** V1: HIGH confidence date window when amount + account agree. */
export const STATEMENT_HIGH_DATE_TOLERANCE_DAYS = 3;

export const STATEMENT_SUPPORTED_CURRENCIES = ["INR"] as const;

export const STATEMENT_COLUMN_ALIASES: Record<string, string[]> = {
  transactionDate: [
    "transaction date",
    "txn date",
    "date",
    "trans date",
    "posting date"
  ],
  valueDate: ["value date", "val date", "value_date"],
  description: ["description", "narration", "particulars", "details", "remarks"],
  reference: ["reference", "utr", "ref no", "ref", "cheque no", "transaction id", "txn id"],
  debit: ["debit", "withdrawal", "dr", "debit amount"],
  credit: ["credit", "deposit", "cr", "credit amount"],
  balance: ["balance", "running balance", "closing balance", "available balance"]
};

export function normalizeStatementReference(value: string | null | undefined): string {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

export function normalizeStatementDescription(value: string | null | undefined): string {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 500);
}
