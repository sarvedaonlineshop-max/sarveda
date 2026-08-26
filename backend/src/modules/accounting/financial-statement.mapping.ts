import type { AccountingAccountType } from "@prisma/client";

/**
 * Reporting classification for financial statements (Phase 6A/6B).
 * Prisma CoA `type` stays ASSET|LIABILITY|EQUITY|REVENUE|EXPENSE —
 * this layer maps codes to statement presentation without changing CoA.
 */
export type FinancialReportClass =
  | "ASSET"
  | "LIABILITY"
  | "EQUITY"
  | "REVENUE"
  | "CONTRA_REVENUE"
  | "COGS"
  | "EXPENSE"
  | "OTHER_INCOME"
  | "OTHER_EXPENSE"
  | "TAX_ASSET"
  | "TAX_LIABILITY"
  | "PURCHASE_CLEARING_ASSET"
  | "PURCHASE_CLEARING_LIABILITY"
  | "CASH"
  | "BANK";

export type NormalBalanceSide = "DEBIT" | "CREDIT";

/** Static code overrides (Phase 6A CoA). Dynamic bank GLs resolved via registry. */
const CODE_REPORT_CLASS: Record<string, FinancialReportClass> = {
  "1000": "CASH",
  "1010": "BANK",
  "1020": "ASSET",
  "1021": "ASSET",
  "1022": "ASSET",
  "1100": "ASSET",
  "1200": "ASSET",
  // 1210: balance-dependent — see resolveReportClassForBalance
  "2000": "LIABILITY",
  "2100": "TAX_LIABILITY",
  "2101": "TAX_LIABILITY",
  "2102": "TAX_LIABILITY",
  // 2200–2202: balance-dependent
  "3000": "EQUITY",
  "3100": "EQUITY",
  "3900": "EQUITY",
  "4000": "REVENUE",
  "4100": "REVENUE",
  "4200": "CONTRA_REVENUE",
  "4500": "OTHER_INCOME",
  "5000": "COGS",
  "5100": "EXPENSE",
  "5200": "EXPENSE",
  "5300": "EXPENSE",
  "5310": "EXPENSE",
  "5320": "EXPENSE",
  "5330": "EXPENSE",
  "5340": "EXPENSE",
  "5350": "EXPENSE",
  "5360": "EXPENSE",
  "5370": "EXPENSE",
  "5380": "EXPENSE",
  "5390": "EXPENSE"
};

const INPUT_GST_CODES = new Set(["2200", "2201", "2202"]);
const PURCHASE_CLEARING_CODE = "1210";

export type BankGlHint = {
  accountType: "BANK" | "CASH";
};

/**
 * Base report class ignoring live balance (for account pickers / metadata).
 * Balance-dependent codes return a stable default (debit-side presentation class).
 */
export function getBaseReportClass(
  code: string,
  prismaType: AccountingAccountType,
  bankHint?: BankGlHint | null
): FinancialReportClass {
  if (bankHint?.accountType === "CASH") return "CASH";
  if (bankHint?.accountType === "BANK") return "BANK";

  const override = CODE_REPORT_CLASS[code];
  if (override) return override;

  if (code === PURCHASE_CLEARING_CODE) return "PURCHASE_CLEARING_ASSET";
  if (INPUT_GST_CODES.has(code)) return "TAX_ASSET";

  switch (prismaType) {
    case "ASSET":
      return "ASSET";
    case "LIABILITY":
      return "LIABILITY";
    case "EQUITY":
      return "EQUITY";
    case "REVENUE":
      return "REVENUE";
    case "EXPENSE":
      return "EXPENSE";
    default:
      return "ASSET";
  }
}

/**
 * Report class for statement lines given signed net balance (debit − credit).
 * 1210 / 220x flip asset vs liability presentation by side.
 */
export function resolveReportClassForBalance(
  code: string,
  prismaType: AccountingAccountType,
  netDebitMinusCredit: number,
  bankHint?: BankGlHint | null
): FinancialReportClass {
  if (bankHint?.accountType === "CASH") return "CASH";
  if (bankHint?.accountType === "BANK") return "BANK";

  if (code === PURCHASE_CLEARING_CODE) {
    return netDebitMinusCredit >= 0 ? "PURCHASE_CLEARING_ASSET" : "PURCHASE_CLEARING_LIABILITY";
  }
  if (INPUT_GST_CODES.has(code)) {
    return netDebitMinusCredit >= 0 ? "TAX_ASSET" : "TAX_LIABILITY";
  }

  return getBaseReportClass(code, prismaType, bankHint);
}

/** Usual textbook normal balance for the report class (informational). */
export function normalBalanceForReportClass(reportClass: FinancialReportClass): NormalBalanceSide {
  switch (reportClass) {
    case "ASSET":
    case "CASH":
    case "BANK":
    case "TAX_ASSET":
    case "PURCHASE_CLEARING_ASSET":
    case "EXPENSE":
    case "COGS":
    case "CONTRA_REVENUE":
    case "OTHER_EXPENSE":
      return "DEBIT";
    case "LIABILITY":
    case "TAX_LIABILITY":
    case "PURCHASE_CLEARING_LIABILITY":
    case "EQUITY":
    case "REVENUE":
    case "OTHER_INCOME":
      return "CREDIT";
    default:
      return "DEBIT";
  }
}

/**
 * Present a signed net (debit − credit) as exclusive debit OR credit column amounts.
 * Net > 0 → debit; net < 0 → credit; net === 0 → both zero.
 */
export function presentNetAsDebitCredit(netDebitMinusCredit: number): {
  debit: number;
  credit: number;
} {
  if (netDebitMinusCredit > 0) return { debit: netDebitMinusCredit, credit: 0 };
  if (netDebitMinusCredit < 0) return { debit: 0, credit: -netDebitMinusCredit };
  return { debit: 0, credit: 0 };
}

export function isInputGstCode(code: string): boolean {
  return INPUT_GST_CODES.has(code);
}

export function isPurchaseClearingCode(code: string): boolean {
  return code === PURCHASE_CLEARING_CODE;
}
