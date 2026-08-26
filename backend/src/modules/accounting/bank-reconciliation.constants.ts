/** Phase 4D bank reconciliation + categorization constants. */

export const BANK_CHARGE_CALC_VERSION = "BANK_CHARGE_V1";
export const BANK_CHARGE_EVENT_TYPE = "BANK_CHARGE";
export const BANK_CHARGE_SOURCE_TYPE = "BANK_STATEMENT_LINE";
export const BANK_CHARGE_DOCUMENT_TYPE = "BANK_CHARGE";
export const BANK_CHARGE_EXPENSE_CODE = "5390";

export const BANK_INTEREST_CALC_VERSION = "BANK_INTEREST_V1";
export const BANK_INTEREST_EVENT_TYPE = "BANK_INTEREST";
export const BANK_INTEREST_SOURCE_TYPE = "BANK_STATEMENT_LINE";
export const BANK_INTEREST_DOCUMENT_TYPE = "BANK_INTEREST";
export const BANK_INTEREST_INCOME_CODE = "4500";

export const GATEWAY_CLEARING_CODES = {
  RAZORPAY: "1020",
  STRIPE: "1021",
  PAYPAL: "1022",
  COD_AR: "1100"
} as const;

export function bankChargeUniqueKey(statementLineId: string): string {
  return `bank_charge:${statementLineId}`;
}

export function bankInterestUniqueKey(statementLineId: string): string {
  return `bank_interest:${statementLineId}`;
}
