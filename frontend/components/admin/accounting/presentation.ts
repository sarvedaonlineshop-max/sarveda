/**
 * Presentation-only humanizers for Accounting Reports / Advanced.
 * Does not change stored event types, integrity codes, or calculations.
 */

import type { AccountingBadgeTone } from "@/components/admin/accounting/accounting-ui";
import { humanizePostingEvent } from "@/components/admin/accounting/accountant/accountant-ui";

/** GL / report source labels (shorter business names). */
export function humanizeGlSource(eventType: string | null | undefined): string {
  const raw = (eventType ?? "").trim();
  if (!raw) return "—";
  const e = raw.toUpperCase().replace(/_V\d+$/i, "");
  const map: Record<string, string> = {
    ORDER_PAID: "Sales Entry",
    ORDER_REFUNDED_FULL: "Sales Refund",
    VENDOR_BILL_POSTED: "Vendor Bill",
    VENDOR_BILL: "Vendor Bill",
    VENDOR_PAYMENT_POSTED: "Vendor Payment",
    VENDOR_PAYMENT_MADE: "Vendor Payment",
    VENDOR_PAYMENT: "Vendor Payment",
    EXPENSE_RECORDED: "Expense",
    EXPENSE: "Expense",
    PAYMENT_GATEWAY_SETTLED: "Gateway Settlement",
    RAZORPAY_SETTLEMENT: "Gateway Settlement",
    GATEWAY_SETTLEMENT: "Gateway Settlement",
    SETTLEMENT: "Gateway Settlement",
    BANK_TRANSFER: "Bank Transfer",
    BANK_OPENING: "Bank Opening",
    BANK_CHARGE: "Bank Charge",
    BANK_INTEREST: "Bank Interest",
    PURCHASE_CAPITALIZATION: "Inventory Purchase",
    INVENTORY_COGS: "Cost of Goods Sold",
    INVENTORY_COGS_REVERSED: "Inventory Cost Reversal",
    PRODUCTION_OPENING_BALANCE: "Opening Balances",
    OPENING_INVENTORY: "Inventory Opening",
    INVENTORY_OPENING: "Inventory Opening"
  };
  if (map[e]) return map[e];
  if (e.includes("ORDER_PAID")) return "Sales Entry";
  if (e.includes("REFUND")) return "Sales Refund";
  if (e.includes("VENDOR_BILL")) return "Vendor Bill";
  if (e.includes("VENDOR_PAYMENT")) return "Vendor Payment";
  if (e.includes("EXPENSE")) return "Expense";
  if (e.includes("GATEWAY") || e.includes("SETTLEMENT")) return "Gateway Settlement";
  if (e.includes("BANK_TRANSFER")) return "Bank Transfer";
  if (e.includes("COGS_REVERS")) return "Inventory Cost Reversal";
  if (e.includes("COGS")) return "Cost of Goods Sold";
  if (e.includes("CAPITAL")) return "Inventory Purchase";
  if (e.includes("OPENING")) return "Opening Balances";
  return humanizePostingEvent(raw);
}

const INTEGRITY_CHECK_TITLES: Record<string, string> = {
  UNBALANCED_POSTED_JOURNALS: "Journal totals agree",
  ZERO_LINE_POSTED_JOURNALS: "Journal lines have amounts",
  TB_DEBITS_EQUAL_CREDITS: "Trial Balance is balanced",
  PL_NET_PROFIT_RECONCILES_TO_TEMPORARY_ACCOUNTS: "Profit & Loss agrees with temporary accounts",
  BS_ASSETS_EQUAL_LIABILITIES_PLUS_EQUITY: "Balance Sheet is balanced",
  RETAINED_EARNINGS_3100_UNTOUCHED: "Retained earnings account is intact",
  AR_GL_VS_SUBLEDGER: "Accounts receivable needs review",
  AP_GL_VS_SUBLEDGER: "Accounts payable agrees with bills",
  INVENTORY_GL_VS_FIFO: "Inventory ledger agrees with stock valuation",
  BANK_GL_VS_BOOK_BALANCE: "Bank ledger agrees with book balances",
  GATEWAY_CLEARING_CONTROL: "Gateway clearing balance looks reasonable",
  GST_GL_VS_GST_REPORT: "GST ledger agrees with GST reports",
  PURCHASE_CLEARING_1210_CONTROL: "Purchase clearing account needs review",
  ORPHAN_JOURNALS: "Journals without a source event",
  ORPHAN_POSTING_EVENTS: "Posting events without journals",
  TEST_FIXTURE_CONTAMINATION: "Training or test entries present",
  HISTORICAL_NATIVE_GL_GAP: "Historical ledger coverage gap"
};

export function humanizeIntegrityCheck(code: string | null | undefined): string {
  const c = (code ?? "").trim().toUpperCase();
  if (!c) return "Check";
  if (INTEGRITY_CHECK_TITLES[c]) return INTEGRITY_CHECK_TITLES[c];
  return c
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
}

export function humanizeIntegrityStatus(status: string | null | undefined): string {
  const s = (status ?? "").toUpperCase();
  if (s === "PASS") return "Healthy";
  if (s === "WARNING") return "Warning";
  if (s === "FAIL" || s === "DATA_GAP") return "Needs attention";
  return s
    ? s.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (ch) => ch.toUpperCase())
    : "—";
}

export function integrityStatusTone(status: string | null | undefined): AccountingBadgeTone {
  const s = (status ?? "").toUpperCase();
  if (s === "PASS") return "success";
  if (s === "WARNING") return "warning";
  if (s === "FAIL") return "error";
  if (s === "DATA_GAP") return "warning";
  return "neutral";
}

export function humanizeIntegritySeverity(severity: string | null | undefined): string {
  const s = (severity ?? "").toUpperCase();
  if (s === "BLOCKER") return "Critical";
  if (s === "HIGH") return "High";
  if (s === "MEDIUM") return "Medium";
  if (s === "LOW") return "Low";
  if (s === "INFO") return "Info";
  return s
    ? s.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (ch) => ch.toUpperCase())
    : "—";
}

/** Known expense CoA labels for mapping UI (presentation only). */
export const EXPENSE_COA_OPTIONS: { code: string; name: string }[] = [
  { code: "5300", name: "Purchase / Operating Expense" },
  { code: "5310", name: "Office Expense" },
  { code: "5320", name: "Professional Fees" },
  { code: "5330", name: "Utilities" },
  { code: "5340", name: "Travel" },
  { code: "5350", name: "Repairs & Maintenance" },
  { code: "5360", name: "Marketing / Advertising" },
  { code: "5370", name: "Software / Subscription" },
  { code: "5380", name: "Misc Operating Expense" }
];

export const PAYMENT_COA_OPTIONS: { code: "1000" | "1010"; name: string }[] = [
  { code: "1000", name: "Cash" },
  { code: "1010", name: "Bank" }
];

export function expenseCoaLabel(code: string | null | undefined): string {
  const c = (code ?? "").trim();
  const hit = EXPENSE_COA_OPTIONS.find((o) => o.code === c) ?? PAYMENT_COA_OPTIONS.find((o) => o.code === c);
  if (hit) return hit.name;
  return c || "—";
}

export function humanizeEligibilityCode(code: string | null | undefined): string {
  const c = (code ?? "").trim().toUpperCase();
  if (!c) return "—";
  const map: Record<string, string> = {
    ELIGIBLE: "Ready to record",
    POSTED: "Already recorded",
    ALREADY_POSTED: "Already recorded",
    RCM_DATA_GAP: "Reverse charge not supported yet",
    GST_DATA_GAP: "GST details incomplete",
    UNMAPPED_ACCOUNT: "Expense account not mapped",
    UNMAPPED_PAYMENT: "Payment account not mapped",
    UNMAPPED_EXPENSE_ACCOUNT: "Expense account not mapped",
    DUPLICATE_RISK: "Possible duplicate",
    SOURCE_CHANGED_AFTER_POST: "Source changed after posting",
    DATA_GAP: "Data incomplete",
    NOT_ELIGIBLE: "Not eligible",
    DRAFT: "Still a draft",
    PRE_CUTOVER: "Before accounting cutover",
    CLOSED_PERIOD: "Accounting period is closed"
  };
  if (map[c]) return map[c];
  return c
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
}

export function journalsDetailHref(journalEntryId: string): string {
  return `/admin/accounting/journals?id=${encodeURIComponent(journalEntryId)}`;
}
