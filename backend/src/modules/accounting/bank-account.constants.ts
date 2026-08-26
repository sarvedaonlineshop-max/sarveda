/** Phase 4B — banking registry & transfers. */

export const LEGACY_CASH_ACCOUNT_CODE = "1000";
export const LEGACY_BANK_ACCOUNT_CODE = "1010";
export const OPENING_BALANCE_EQUITY_CODE = "3900";

export const BANK_TRANSFER_MADE_CALC_VERSION = "BANK_TRANSFER_V1";
export const BANK_TRANSFER_MADE_EVENT_TYPE = "BANK_TRANSFER";
export const BANK_TRANSFER_MADE_SOURCE_TYPE = "BANK_TRANSFER";
export const BANK_TRANSFER_DOCUMENT_TYPE = "BANK_TRANSFER";

export const BANK_OPENING_BALANCE_CALC_VERSION = "BANK_OPENING_BALANCE_V1";
export const BANK_OPENING_BALANCE_EVENT_TYPE = "BANK_OPENING_BALANCE";
export const BANK_OPENING_BALANCE_SOURCE_TYPE = "BANK_ACCOUNT";

export const BANK_TRANSFER_MAX_IMBALANCE_PAISE = 0;

export function bankTransferMadeUniqueKey(transferId: string): string {
  return `bank_transfer:${transferId}`;
}

export function bankOpeningBalanceUniqueKey(bankAccountId: string): string {
  return `bank_opening:${bankAccountId}:cutover`;
}

/**
 * System ASSET codes that must never be bound as operational bank/cash registry GLs.
 * (Clearing, AR, inventory — would corrupt book balance / settlement / matching.)
 */
export const BANK_REGISTRY_RESERVED_GL_CODES = new Set([
  "1020", // Razorpay Clearing
  "1021", // Stripe Clearing
  "1022", // PayPal Clearing
  "1100", // Accounts Receivable
  "1200", // Inventory Asset
  "1210" // Inventory Purchases Clearing
]);

/** Mask full account numbers — store/display last 4 only. */
export function maskAccountNumber(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 4) return `****${digits}`;
  return `****${digits.slice(-4)}`;
}
