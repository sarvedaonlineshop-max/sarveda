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
import { AdminAccountantNav } from "@/components/admin/accounting/accountant/AdminAccountantNav";

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
export type { AccountingBadgeTone };

export function AccountantPageShell({
  title,
  subtitle,
  actions,
  children
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-[1600px] space-y-4">
      <AdminAccountantNav />
      <div className="space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <AccountingPageHeader title={title} subtitle={subtitle} />
          {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
        </div>
        {children}
      </div>
    </div>
  );
}

export function AccTableWrap({ children }: { children: ReactNode }) {
  return (
    <div
      className="overflow-x-auto rounded-[12px] border bg-white"
      style={{ borderColor: accountingUi.border }}
    >
      {children}
    </div>
  );
}

export function accTh(right = false): string {
  return `px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-[#8a7060] ${
    right ? "text-right" : "text-left"
  }`;
}

export function accTd(right = false): string {
  return `px-3 py-[11px] text-[13px] text-[#2c2420] ${right ? "text-right tabular-nums" : ""}`;
}

export function moneyClass(): string {
  return "tabular-nums font-semibold text-[#1c352a]";
}

export function AccountantSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-3 animate-pulse">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-20 rounded-[12px] bg-[#ebe4db]/80" />
        ))}
      </div>
      <div className="rounded-[12px] border border-[#ebe4db] bg-white p-4 space-y-2">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="h-8 rounded bg-[#faf5ec]" />
        ))}
      </div>
    </div>
  );
}

export function humanizeAccountType(type: string | null | undefined): string {
  const t = (type ?? "").toUpperCase();
  const map: Record<string, string> = {
    ASSET: "Asset",
    LIABILITY: "Liability",
    EQUITY: "Equity",
    INCOME: "Income",
    REVENUE: "Income",
    EXPENSE: "Expense",
    COGS: "Cost of Goods Sold"
  };
  return map[t] ?? (t ? t.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()) : "—");
}

export function humanizeJournalStatus(status: string | null | undefined): string {
  const s = (status ?? "").toUpperCase();
  if (s === "POSTED") return "Posted";
  if (s === "DRAFT") return "Draft";
  if (s === "VOID") return "Void";
  return s
    ? s.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())
    : "—";
}

export function journalStatusTone(status: string | null | undefined): AccountingBadgeTone {
  const s = (status ?? "").toUpperCase();
  if (s === "POSTED") return "success";
  if (s === "VOID") return "neutral";
  if (s === "DRAFT") return "warning";
  return "neutral";
}

export function humanizePostingEvent(eventType: string | null | undefined): string {
  const raw = (eventType ?? "").trim();
  if (!raw) return "—";
  const e = raw.toUpperCase().replace(/_V\d+$/i, "");
  const map: Record<string, string> = {
    ORDER_PAID: "Customer payment received",
    ORDER_REFUNDED_FULL: "Sales refund",
    VENDOR_BILL_POSTED: "Vendor bill recorded",
    VENDOR_BILL: "Vendor bill recorded",
    VENDOR_PAYMENT_POSTED: "Vendor payment",
    VENDOR_PAYMENT_MADE: "Vendor payment",
    VENDOR_PAYMENT: "Vendor payment",
    EXPENSE_RECORDED: "Expense recorded",
    EXPENSE: "Expense recorded",
    PAYMENT_GATEWAY_SETTLED: "Gateway settlement",
    RAZORPAY_SETTLEMENT: "Gateway settlement",
    GATEWAY_SETTLEMENT: "Gateway settlement",
    SETTLEMENT: "Gateway settlement",
    BANK_TRANSFER: "Bank transfer",
    BANK_OPENING: "Bank opening",
    BANK_CHARGE: "Bank charge",
    BANK_INTEREST: "Bank interest",
    PURCHASE_CAPITALIZATION: "Inventory purchase recorded",
    INVENTORY_COGS: "Cost of goods sold",
    INVENTORY_COGS_REVERSED: "Inventory cost reversal",
    PRODUCTION_OPENING_BALANCE: "Opening balances",
    OPENING_INVENTORY: "Inventory opening",
    INVENTORY_OPENING: "Inventory opening"
  };
  if (map[e]) return map[e];
  if (e.includes("ORDER_PAID")) return "Customer payment received";
  if (e.includes("REFUND")) return "Sales refund";
  if (e.includes("VENDOR_BILL")) return "Vendor bill recorded";
  if (e.includes("VENDOR_PAYMENT")) return "Vendor payment";
  if (e.includes("EXPENSE")) return "Expense recorded";
  if (e.includes("GATEWAY") || e.includes("SETTLEMENT")) return "Gateway settlement";
  if (e.includes("BANK_TRANSFER")) return "Bank transfer";
  if (e.includes("COGS_REVERS")) return "Inventory cost reversal";
  if (e.includes("COGS")) return "Cost of goods sold";
  if (e.includes("CAPITAL")) return "Inventory purchase recorded";
  if (e.includes("OPENING")) return "Opening balances";
  return e
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Presentation-only: turn memo/event strings like EXPENSE_RECORDED_V1 into
 * accountant-facing descriptions. Does not change stored values.
 */
export function humanizeJournalDescription(
  memoOrEvent: string | null | undefined,
  eventType?: string | null
): string {
  if (eventType?.trim()) {
    return humanizePostingEvent(eventType);
  }
  const raw = (memoOrEvent ?? "").trim();
  if (!raw) return "—";

  // Prefer leading EVENT_STYLE token (optionally with _Vn and trailing context)
  const tokenMatch = raw.match(/^([A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*)(?:_V\d+)?(?:\b|[|:\s-]|$)/);
  if (tokenMatch?.[1] && /_/.test(tokenMatch[1])) {
    return humanizePostingEvent(tokenMatch[1]);
  }

  // Whole memo is SCREAMING_SNAKE / VERSIONED
  if (/^[A-Z][A-Z0-9_]*(?:_V\d+)?$/.test(raw)) {
    return humanizePostingEvent(raw);
  }

  // Already business prose
  return raw;
}

export function isTechnicalJournalMemo(memo: string | null | undefined): boolean {
  const raw = (memo ?? "").trim();
  if (!raw) return false;
  return (
    /^[A-Z][A-Z0-9_]*(?:_V\d+)?(?:\b|[|:\s-]|$)/.test(raw) ||
    /^[A-Z][A-Z0-9_]*(?:_V\d+)?$/.test(raw)
  );
}

export function humanizeDocumentType(docType: string | null | undefined): string {
  const d = (docType ?? "").toUpperCase();
  const map: Record<string, string> = {
    ORDER: "Order",
    VENDOR_BILL: "Vendor Bill",
    VENDOR_PAYMENT: "Vendor Payment",
    EXPENSE: "Expense",
    SETTLEMENT: "Settlement",
    BANK_TRANSFER: "Bank Transfer",
    GATEWAY_SETTLEMENT: "Settlement",
    OPENING_BATCH: "Opening Batch"
  };
  return map[d] ?? humanizePostingEvent(d);
}

/** Best-effort link to an existing admin screen for a document type. */
export function documentHref(
  documentType: string | null | undefined,
  documentId: string | null | undefined
): string | null {
  if (!documentType || !documentId) return null;
  const d = documentType.toUpperCase();
  if (d === "ORDER" || d.includes("ORDER")) return "/admin/accounting/order-paid";
  if (d.includes("VENDOR_BILL") || d === "BILL") return "/admin/accounting/vendor-bills";
  if (d.includes("VENDOR_PAYMENT") || d.includes("PAYMENT")) {
    return "/admin/accounting/vendor-payments";
  }
  if (d.includes("EXPENSE")) return "/admin/accounting/expenses";
  if (d.includes("SETTLEMENT") || d.includes("GATEWAY")) return "/admin/accounting/settlements";
  if (d.includes("BANK_TRANSFER")) return "/admin/accounting/banking/transfers";
  if (d.includes("OPENING")) return "/admin/accounting/opening";
  return null;
}

export function reportsGlHref(accountCode: string): string {
  return `/admin/accounting/reports?tab=gl&account=${encodeURIComponent(accountCode)}`;
}

export function reportsTbHref(): string {
  return "/admin/accounting/reports?tab=tb";
}

export function reportsTabHref(tab: "gl" | "tb" | "pl" | "bs" | "overview" | "integrity"): string {
  return `/admin/accounting/reports?tab=${tab}`;
}
