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
import { AdminGstNav } from "@/components/admin/accounting/gst/AdminGstNav";

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

export const GST_ACCOUNT_LABELS: Record<string, string> = {
  "2100": "Output CGST",
  "2101": "Output SGST",
  "2102": "Output IGST",
  "2200": "Input CGST",
  "2201": "Input SGST",
  "2202": "Input IGST"
};

export function GstPageShell({
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
      <AdminGstNav />
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

export function GstTableWrap({ children }: { children: ReactNode }) {
  return (
    <div
      className="overflow-x-auto rounded-[12px] border bg-white"
      style={{ borderColor: accountingUi.border }}
    >
      {children}
    </div>
  );
}

export function gstTh(right = false): string {
  return `px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-[#8a7060] ${
    right ? "text-right" : "text-left"
  }`;
}

export function gstTd(right = false): string {
  return `px-3 py-[11px] text-[13px] text-[#2c2420] ${right ? "text-right tabular-nums" : ""}`;
}

export function moneyClass(): string {
  return "tabular-nums font-semibold text-[#1c352a]";
}

export function fieldLabelClass(): string {
  return "block text-xs font-semibold text-[#6b5c52]";
}

export function GstSkeleton({ rows = 5 }: { rows?: number }) {
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

export function MonthFilter({
  month,
  onChange,
  disabled
}: {
  month: string;
  onChange: (m: string) => void;
  disabled?: boolean;
}) {
  return (
    <label className="flex items-center gap-2 text-sm text-[#6b5c52]">
      <span className="text-xs font-semibold uppercase tracking-wide text-[#8a7060]">Month</span>
      <input
        type="month"
        className={accountingInputClass()}
        value={month}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

export function gstAccountLabel(code: string, fallbackName?: string): string {
  return GST_ACCOUNT_LABELS[code] ?? fallbackName ?? code;
}

export function humanizeGstStatus(raw: string | null | undefined): string {
  const s = (raw ?? "").toUpperCase();
  const map: Record<string, string> = {
    MATCHED: "Balanced",
    MISSING_JOURNAL: "Accounting entry missing",
    MISSING_TAX_DOCUMENT: "Tax document missing",
    GST_DATA_GAP: "GST information incomplete",
    AMOUNT_MISMATCH: "Amount mismatch",
    RATE_MISMATCH: "Rate mismatch",
    PLACE_OF_SUPPLY_MISMATCH: "Place of supply mismatch",
    ITC_UNVERIFIED: "ITC unverified",
    PDF_JOURNAL_TAX_DIVERGENCE: "Document vs accounting difference",
    SHIPPING_GST_DATA_GAP: "Shipping GST unavailable",
    PARTIAL_REFUND_GST_DATA_GAP: "Partial-refund GST unavailable",
    RCM_DATA_GAP: "Reverse charge unavailable",
    BUYER_GSTIN_MISSING: "Buyer GSTIN unavailable",
    GATEWAY_GST_PROVISIONAL: "Payment fee tax (not input credit)",
    TAX_CLASS_DEFAULTED: "Tax class defaulted",
    HSN_DEFAULTED: "HSN defaulted",
    INVALID_GSTIN: "Invalid GSTIN format",
    UNVERIFIED_PENDING_TAX_INVOICE: "Awaiting verification",
    ELIGIBLE: "Eligible for claimability",
    BLOCKED: "Blocked",
    REVERSED: "Reversed",
    CLAIMED: "Claimed",
    DATA_GAP: "Needs review",
    VENDOR_BILL: "Vendor bill",
    EXPENSE: "Expense",
    GATEWAY_SETTLEMENT: "Payment gateway",
    SALES: "Sales",
    FULL_REFUNDS: "Full refunds",
    VENDOR_BILLS: "Vendor bills",
    EXPENSES: "Expenses",
    GATEWAY_FEES: "Payment fees",
    INTRA: "Intra-state",
    INTER: "Inter-state",
    B2B: "B2B",
    B2C: "B2C",
    B2B_DATA_GAP: "B2B incomplete",
    PASS: "Aligned",
    FAIL: "Needs review",
    WARN: "Needs review",
    OK: "Aligned"
  };
  if (map[s]) return map[s];
  if (!s) return "—";
  return s
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function gstStatusTone(raw: string | null | undefined): AccountingBadgeTone {
  const s = (raw ?? "").toUpperCase();
  if (s === "MATCHED" || s === "ELIGIBLE" || s === "PASS" || s === "OK") return "success";
  if (
    s.includes("GAP") ||
    s.includes("MISSING") ||
    s.includes("MISMATCH") ||
    s === "BLOCKED" ||
    s === "FAIL" ||
    s === "UNVERIFIED_PENDING_TAX_INVOICE" ||
    s === "ITC_UNVERIFIED" ||
    s === "BUYER_GSTIN_MISSING"
  ) {
    return "warning";
  }
  return "neutral";
}

export function humanizeSupplyType(raw: string | null | undefined): string {
  const s = (raw ?? "").toUpperCase();
  if (s === "INTRA" || s === "INTRA_STATE" || s.includes("INTRA")) return "Intra-state";
  if (s === "INTER" || s === "INTER_STATE" || s.includes("INTER")) return "Inter-state";
  if (s.includes("POS") && s.includes("GAP")) return "Place of supply incomplete";
  return humanizeGstStatus(raw);
}

export function humanizeClassification(raw: string | null | undefined): string {
  const s = (raw ?? "").toUpperCase();
  if (s === "B2B") return "B2B";
  if (s === "B2C") return "B2C";
  if (s.includes("B2B") && s.includes("GAP")) return "B2B incomplete";
  return humanizeGstStatus(raw);
}

export function formatPlaceOfSupply(code: string | null | undefined): string {
  if (!code) return "—";
  const c = String(code).trim();
  if (/^\d{2}$/.test(c)) return `State code ${c}`;
  return c;
}

export function reconReference(row: {
  reference?: string | null;
  details?: Record<string, unknown>;
}): string {
  if (row.reference?.trim()) return row.reference.trim();
  const d = row.details ?? {};
  for (const key of [
    "orderNumber",
    "billNumber",
    "documentReference",
    "invoiceReference",
    "poNumber",
    "expenseReference"
  ]) {
    const v = d[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "—";
}

export function currentGstMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

export function GstUnavailableState({
  title = "GST accounting is not available",
  description = "GST reporting and ledgers are not enabled for this environment. Contact an administrator if you need access."
}: {
  title?: string;
  description?: string;
}) {
  return <AccountingEmptyState title={title} description={description} />;
}

/** Presentation-only: actionable review vs known limitation. */
export type GstAttentionKind = "action" | "info";

export function gstAttentionKindFromCode(codeOrLabel: string): GstAttentionKind {
  const s = codeOrLabel.toUpperCase();
  if (
    s.includes("BUYER_GSTIN") ||
    s.includes("SHIPPING_GST") ||
    s.includes("PARTIAL_REFUND") ||
    s.includes("RCM_") ||
    s.includes("HSN_DEFAULTED") ||
    s.includes("TAX_CLASS_DEFAULTED") ||
    s.includes("GATEWAY") ||
    /buyer gstin|shipping gst|partial-refund|reverse charge|hsn defaulted|tax class defaulted|payment fee/i.test(
      codeOrLabel
    )
  ) {
    return "info";
  }
  return "action";
}

/**
 * Prefer a calmer primary reference when a technical/test order id is present
 * and a journal entry number already exists on the row.
 */
export function salesDocumentRefs(row: Record<string, unknown>): {
  primary: string;
  secondary: string | null;
} {
  const order = String(row.orderNumber ?? row.invoiceReference ?? "").trim();
  const journal = String(row.journalEntryNumber ?? "").trim();
  const technical =
    /^TEST[-_]/i.test(order) ||
    /^ACC[-_]/i.test(order) ||
    (order.length > 28 && !/^SRV-/i.test(order));

  if (technical && journal) {
    return { primary: journal, secondary: order };
  }
  if (order) {
    return {
      primary: order,
      secondary: journal && journal !== order ? journal : null
    };
  }
  return { primary: journal || "—", secondary: null };
}
