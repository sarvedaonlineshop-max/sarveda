"use client";

import type { ReactNode } from "react";
import {
  AccountingAlert,
  AccountingEmptyState,
  AccountingMetricCard,
  AccountingPageHeader,
  AccountingQuickAction,
  AccountingSectionCard,
  AccountingSectionHeader,
  AccountingStatusBadge,
  accountingButtonClass,
  accountingInputClass,
  accountingUi,
  type AccountingBadgeTone
} from "@/components/admin/accounting/accounting-ui";
import { AdminSalesNav } from "@/components/admin/accounting/sales/AdminSalesNav";

export {
  AccountingAlert,
  AccountingEmptyState,
  AccountingMetricCard,
  AccountingPageHeader,
  AccountingQuickAction,
  AccountingSectionCard,
  AccountingSectionHeader,
  AccountingStatusBadge,
  accountingButtonClass,
  accountingInputClass,
  accountingUi
};

export function SalesPageShell({
  title,
  subtitle,
  actions,
  children,
  compact
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className="mx-auto max-w-[1600px] space-y-4">
      <AdminSalesNav />
      <div className={compact ? "space-y-4" : "space-y-5"}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <AccountingPageHeader title={title} subtitle={subtitle} />
          {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
        </div>
        {children}
      </div>
    </div>
  );
}

export function SalesTableWrap({ children }: { children: ReactNode }) {
  return (
    <div
      className="overflow-x-auto rounded-[12px] border bg-white"
      style={{ borderColor: accountingUi.border }}
    >
      {children}
    </div>
  );
}

export function salesTh(right = false): string {
  return `px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-[#8a7060] ${
    right ? "text-right" : "text-left"
  }`;
}

export function salesTd(right = false): string {
  return `px-3 py-[11px] text-[13px] text-[#2c2420] ${right ? "text-right tabular-nums" : ""}`;
}

export function moneyClass(): string {
  return "tabular-nums font-semibold text-[#1c352a]";
}

export function fieldLabelClass(): string {
  return "block text-xs font-semibold text-[#6b5c52]";
}

/** Prefer account name; ledger code is secondary. */
export function accountLabel(code: string, name?: string | null): { primary: string; code: string } {
  const friendly = ACCOUNT_FRIENDLY[code];
  const primary = (name && name.trim()) || friendly || code;
  return { primary, code };
}

const ACCOUNT_FRIENDLY: Record<string, string> = {
  "1000": "Cash",
  "1010": "Bank",
  "1020": "Gateway Clearing",
  "1021": "Gateway Clearing",
  "1022": "Gateway Clearing",
  "1100": "Accounts Receivable",
  "2100": "Output CGST",
  "2101": "Output SGST",
  "2102": "Output IGST",
  "4000": "Sales",
  "4100": "Shipping Income",
  "4200": "Discount",
  "5100": "Gateway Fees"
};

/** Soft line-role label from amountSource / account — never raw event types. */
export function lineRoleLabel(accountCode: string, amountSource?: string, accountName?: string): string {
  const byCode = ACCOUNT_FRIENDLY[accountCode];
  if (byCode) return byCode;
  if (accountName) return accountName;
  if (!amountSource) return accountCode;
  const src = amountSource.toLowerCase();
  if (src.includes("cgst")) return "Output CGST";
  if (src.includes("sgst")) return "Output SGST";
  if (src.includes("igst")) return "Output IGST";
  if (src.includes("discount")) return "Discount";
  if (src.includes("shipping")) return "Shipping Income";
  if (src.includes("gateway") || src.includes("clearing")) return "Gateway Clearing";
  if (src.includes("fee") || src.includes("charge")) return "Gateway Fees";
  if (src.includes("sales") || src.includes("taxable") || src.includes("merchandise")) return "Sales";
  if (src.includes("bank") || src.includes("settlement.net")) return "Bank Account";
  return accountName || accountCode;
}

export function providerLabel(provider: string | null | undefined): string {
  if (!provider) return "—";
  const map: Record<string, string> = {
    RAZORPAY: "Razorpay",
    STRIPE: "Stripe",
    PAYPAL: "PayPal",
    COD: "Cash on Delivery"
  };
  return map[provider.toUpperCase()] ?? provider;
}

export function salesEligibilityLabel(input: {
  eligible?: boolean;
  code?: string;
  reason?: string;
  postingStatus?: string | null;
  journalNumber?: string | null;
}): { label: string; tone: AccountingBadgeTone; detail?: string } {
  if (input.postingStatus === "POSTED" || input.journalNumber) {
    return {
      label: "Already recorded",
      tone: "success",
      detail: input.journalNumber ? `Journal ${input.journalNumber}` : undefined
    };
  }
  if (input.eligible) {
    return { label: "Eligible", tone: "success" };
  }
  const code = (input.code ?? "").toUpperCase();
  if (
    code.includes("REVIEW") ||
    code.includes("DATA_GAP") ||
    code.includes("MANUAL") ||
    code.includes("REQUIRED")
  ) {
    return { label: "Needs review", tone: "warning", detail: input.reason };
  }
  return { label: "Not eligible", tone: "neutral", detail: input.reason };
}

export function refundEligibilityLabel(input: {
  autoPostable?: boolean;
  eligible?: boolean;
  code?: string;
  reason?: string;
}): { label: string; tone: AccountingBadgeTone; detail?: string; partialNote?: boolean } {
  const code = (input.code ?? "").toUpperCase();
  if (code === "UNPOSTED_PARTIAL" || code.includes("PARTIAL")) {
    return {
      label: "Needs review",
      tone: "warning",
      detail: input.reason,
      partialNote: true
    };
  }
  if (input.autoPostable || code === "AUTO_POSTABLE_FULL") {
    return { label: "Eligible", tone: "success", detail: input.reason };
  }
  if (code.includes("REVIEW") || code.includes("REQUIRED") || code.includes("DATA_GAP")) {
    return { label: "Needs review", tone: "warning", detail: input.reason };
  }
  if (input.eligible === false) {
    return { label: "Not eligible", tone: "neutral", detail: input.reason };
  }
  return { label: "Needs review", tone: "warning", detail: input.reason };
}

export function settlementStatusLabel(status: string | null | undefined): string {
  if (!status) return "—";
  const map: Record<string, string> = {
    IMPORTED: "Imported",
    PREVIEWED: "Ready to record",
    POSTED: "Recorded",
    FAILED: "Needs review",
    MISMATCH: "Needs review"
  };
  return map[status] ?? status.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

export function settlementStatusTone(status: string | null | undefined): AccountingBadgeTone {
  if (status === "POSTED") return "success";
  if (status === "FAILED" || status === "MISMATCH") return "error";
  if (status === "PREVIEWED" || status === "IMPORTED") return "warning";
  return "neutral";
}

export function formatSalesDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export function softUnavailableMessage(kind: "sales" | "refunds" | "settlements"): string {
  const map = {
    sales: "Sales entry recording is currently unavailable. Contact an administrator to enable this feature.",
    refunds: "Refund recording is currently unavailable. Contact an administrator to enable this feature.",
    settlements:
      "Settlement recording is currently unavailable. Contact an administrator to enable this feature."
  };
  return map[kind];
}

export function humanizePostingError(message: string): string {
  if (!message) return "Something went wrong. Please try again.";
  if (/ACCOUNTING_|ENABLED|flag/i.test(message)) {
    return "This recording action is currently unavailable. Contact an administrator if you need access.";
  }
  return message;
}
