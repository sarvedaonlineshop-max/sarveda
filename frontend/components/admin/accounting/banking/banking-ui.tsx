"use client";

import type { ReactNode } from "react";
import type { BankAccountRow } from "@/lib/accounting-api";
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

export function BankingPageShell({
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
    <div className={compact ? "space-y-4" : "space-y-5"}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <AccountingPageHeader title={title} subtitle={subtitle} />
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>
      {children}
    </div>
  );
}

export function BankingTableWrap({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-[12px] border bg-white" style={{ borderColor: accountingUi.border }}>
      {children}
    </div>
  );
}

export function bankingTh(right = false): string {
  return `px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-[#8a7060] ${right ? "text-right" : "text-left"}`;
}

export function bankingTd(right = false): string {
  return `px-3 py-[11px] text-[13px] text-[#2c2420] ${right ? "text-right tabular-nums" : ""}`;
}

export function moneyClass(): string {
  return "tabular-nums font-semibold text-[#1c352a]";
}

export function fieldLabelClass(): string {
  return "block text-xs font-semibold text-[#6b5c52]";
}

export function accountTypeLabel(type: string): string {
  return type === "BANK" ? "Bank" : type === "CASH" ? "Cash" : type === "PETTY_CASH" ? "Petty Cash" : type;
}

export function matchStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    UNMATCHED: "Unmatched",
    MATCHED_EXACT: "Matched",
    MATCHED_MANUAL: "Matched",
    MATCHED_CATEGORIZED: "Categorized",
    POSSIBLE: "Suggested Match",
    DUPLICATE: "Possible Duplicate",
    REVIEW_REQUIRED: "Needs Review",
    IGNORED: "Ignored"
  };
  return labels[status] ?? status.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

export function matchStatusTone(status: string): AccountingBadgeTone {
  if (status.startsWith("MATCHED")) return "success";
  if (status === "REVIEW_REQUIRED" || status === "DUPLICATE") return "error";
  if (status === "POSSIBLE" || status === "UNMATCHED") return "warning";
  return "neutral";
}

export function confidenceLabel(confidence: string): string {
  return confidence === "EXACT" ? "Exact match" : confidence === "HIGH" ? "Strong match" : confidence === "POSSIBLE" ? "Possible match" : confidence;
}

export function reconStatusLabel(status: string | null | undefined): string {
  const labels: Record<string, string> = {
    OPEN: "Open",
    IN_PROGRESS: "In progress",
    RECONCILED: "Reconciled",
    REOPENED: "Reopened"
  };
  return status ? labels[status] ?? status : "Not started";
}

export function reconAttentionLabel(account: Pick<BankAccountRow, "reconciliationStatus">): string {
  if (account.reconciliationStatus === "RECONCILED") return "Reconciled";
  if (account.reconciliationStatus === "IN_PROGRESS" || account.reconciliationStatus === "REOPENED") return "In progress";
  if (account.reconciliationStatus === "OPEN") return "Needs reconciliation";
  return "Not started";
}

export function gatewayStatusLabel(status: string): string {
  if (status === "CLEAR") return "Clear";
  if (status === "OUTSTANDING") return "Outstanding";
  if (status === "REVIEW_REQUIRED") return "Needs review";
  if (status.includes("SETTLEMENT_NOT_CONFIGURED")) return "Settlement tracking not configured";
  if (status === "DATA_GAP") return "Data incomplete";
  return status.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

export function transferKindLabel(kind: string): string {
  return kind === "INTERNAL_TRANSFER" ? "Bank to Bank" : kind === "CASH_DEPOSIT" ? "Cash Deposit" : kind === "CASH_WITHDRAWAL" ? "Cash Withdrawal" : kind;
}

export function formatBankDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export function accountDisplayName(a: Pick<BankAccountRow, "name" | "maskedAccountNumber">): ReactNode {
  return (
    <span>
      <span className="block font-semibold text-[#2c2420]">{a.name}</span>
      {a.maskedAccountNumber ? <span className="block text-xs text-[#8a7060]">•••• {a.maskedAccountNumber.replace(/^.*?(\d{4})$/, "$1")}</span> : null}
    </span>
  );
}

export function humanizeBankingError(message: string): string {
  if (/duplicate|already imported/i.test(message)) {
    return "This statement appears to have already been imported for this account.";
  }
  if (/gateway|settlement fee|POSSIBLE_DUPLICATE_GATEWAY_FEE/i.test(message)) {
    return "This transaction may be related to a payment gateway settlement fee. Review it before recording a separate bank charge.";
  }
  return message;
}

export function humanizeGatewayWarning(message: string): string {
  const m = message.trim();
  if (/non-zero POSTED GL|non-zero.*clearing/i.test(m)) {
    return "Clearing balance is outstanding and needs settlement review.";
  }
  if (/no posted Razorpay settlements/i.test(m)) {
    return "Clearing activity exists, but no Razorpay settlements have been recorded yet.";
  }
  if (/Stripe settlement accounting is not configured/i.test(m)) {
    return "Stripe settlement tracking is not configured yet.";
  }
  if (/PayPal settlement accounting is not configured/i.test(m)) {
    return "PayPal settlement tracking is not configured yet.";
  }
  if (/Captured Stripe payments/i.test(m)) {
    return "Stripe payments exist without matching settlement records.";
  }
  if (/Captured PayPal payments/i.test(m)) {
    return "PayPal payments exist without matching settlement records.";
  }
  if (/COD remittance|COD_REMITTANCE/i.test(m)) {
    return "COD remittance tracking is not available yet.";
  }
  if (/fulfillment is NOT financial|do not treat as remitted/i.test(m)) {
    return "Order fulfilment is not the same as cash remittance.";
  }
  if (/fulfilled COD order/i.test(m)) {
    return m.replace(/fulfilled COD order\(s\) exist — do not treat as remitted cash/i, "fulfilled COD orders — remittance still needs confirmation");
  }
  return m
    .replace(/\bPOSTED GL\b/gi, "ledger")
    .replace(/\bGL\b/g, "ledger")
    .replace(/\bnative accounting V1\b/gi, "accounting")
    .replace(/\bV1\b/g, "")
    .replace(/\bstub\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function humanizeGatewayNotes(warnings: string[]): string {
  if (!warnings.length) return "—";
  const unique = Array.from(new Set(warnings.map(humanizeGatewayWarning).filter(Boolean)));
  return unique.join(" · ");
}

export function FeatureUnavailable({ children }: { children: ReactNode }) {
  return <AccountingAlert tone="warning" title="Feature currently unavailable">{children}</AccountingAlert>;
}
