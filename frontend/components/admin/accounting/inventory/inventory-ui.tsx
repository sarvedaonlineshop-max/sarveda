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
import { AdminInventoryNav } from "@/components/admin/accounting/inventory/AdminInventoryNav";

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

export function InventoryPageShell({
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
      <AdminInventoryNav />
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

export function InventoryTableWrap({ children }: { children: ReactNode }) {
  return (
    <div
      className="overflow-x-auto rounded-[12px] border bg-white"
      style={{ borderColor: accountingUi.border }}
    >
      {children}
    </div>
  );
}

export function invTh(right = false): string {
  return `px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-[#8a7060] ${
    right ? "text-right" : "text-left"
  }`;
}

export function invTd(right = false): string {
  return `px-3 py-[11px] text-[13px] text-[#2c2420] ${right ? "text-right tabular-nums" : ""}`;
}

export function moneyClass(): string {
  return "tabular-nums font-semibold text-[#1c352a]";
}

export function fieldLabelClass(): string {
  return "block text-xs font-semibold text-[#6b5c52]";
}

export function PreviewFact({
  label,
  children,
  emphasize
}: {
  label: string;
  children: ReactNode;
  emphasize?: boolean;
}) {
  return (
    <div
      className="rounded-lg border px-3 py-2.5"
      style={{ borderColor: accountingUi.border, background: accountingUi.cream }}
    >
      <dt className="text-[11px] font-medium uppercase tracking-wide text-[#8a7060]">{label}</dt>
      <dd className={`mt-1 text-sm ${emphasize ? moneyClass() : "font-semibold text-[#2c2420]"}`}>
        {children}
      </dd>
    </div>
  );
}

export function InventorySkeleton({ rows = 5 }: { rows?: number }) {
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

export function inventoryStatusLabel(status: string | null | undefined): string {
  const s = (status ?? "").toUpperCase();
  const map: Record<string, string> = {
    MATCHED: "Balanced",
    OPENING_POSTED: "Balanced",
    QUANTITY_MISMATCH: "Quantity mismatch",
    VALUE_DATA_GAP: "Value needs review",
    OPENING_REQUIRED: "Opening valuation needed",
    COGS_UNPOSTED: "Cost of goods not recorded",
    INSUFFICIENT_COST_LAYERS: "Cost information incomplete",
    COST_DATA_GAP: "Cost information incomplete",
    NON_INVENTORY_EXCLUDED: "Not inventory",
    CLASSIFICATION_REQUIRED: "Needs classification",
    PRE_CUTOVER: "Outside accounting cutover",
    NEGATIVE_STOCK: "Needs review",
    SOURCE_CHANGED_AFTER_POST: "Needs review",
    RETURN_COGS_UNPOSTED: "Return cost needs review",
    RESTOCK_WITHOUT_SOURCE_COGS: "Cost information incomplete",
    RETURN_QTY_EXCEEDS_REVERSIBLE_COGS: "Needs review",
    DAMAGED_NO_RESTOCK_VALUE: "No inventory cost reversal required",
    NON_RESTOCKABLE: "No inventory cost reversal required",
    DATA_GAP: "Needs review",
    ERROR: "Needs review",
    WAITING_FOR_RECEIPT: "Waiting for receipt",
    WAITING_FOR_BILL: "Waiting for vendor bill",
    CLEARED: "Already recorded",
    PARTIALLY_CAPITALIZED: "Ready to record",
    COST_MISMATCH: "Needs review",
    QUANTITY_MISMATCH_CLEARING: "Needs review"
  };
  if (map[s]) return map[s];
  if (s.includes("NON_INVENTORY")) return "Not inventory";
  return s
    ? s.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())
    : "—";
}

export function inventoryStatusTone(status: string | null | undefined): AccountingBadgeTone {
  const s = (status ?? "").toUpperCase();
  if (s === "MATCHED" || s === "OPENING_POSTED" || s === "CLEARED") return "success";
  if (
    s.includes("NON_INVENTORY") ||
    s === "PRE_CUTOVER" ||
    s === "DAMAGED_NO_RESTOCK_VALUE" ||
    s === "NON_RESTOCKABLE"
  ) {
    return "neutral";
  }
  if (
    s.includes("MISMATCH") ||
    s.includes("REQUIRED") ||
    s.includes("UNPOSTED") ||
    s.includes("GAP") ||
    s.includes("INSUFFICIENT") ||
    s === "PARTIALLY_CAPITALIZED" ||
    s === "WAITING_FOR_BILL" ||
    s === "WAITING_FOR_RECEIPT" ||
    s === "ERROR"
  ) {
    return "warning";
  }
  return "neutral";
}

export function clearingStatusLabel(status: string): string {
  const s = status.toUpperCase();
  if (s === "CLEARED") return "Already recorded";
  if (s === "WAITING_FOR_BILL") return "Waiting for vendor bill";
  if (s === "WAITING_FOR_RECEIPT") return "Waiting for receipt";
  if (s === "PARTIALLY_CAPITALIZED") return "Ready to record";
  if (s === "COST_MISMATCH" || s === "QUANTITY_MISMATCH" || s === "DATA_GAP") return "Needs review";
  return inventoryStatusLabel(status);
}

export function averageRemainingCost(valueInPaise: number, qty: number): number | null {
  if (!qty || qty <= 0) return null;
  return Math.round(valueInPaise / qty);
}

export function humanizeInventoryError(message: string): string {
  if (!message) return "Something went wrong. Please try again.";
  if (/INSUFFICIENT_COST_LAYERS|COST_LAYER_DATA_GAP/i.test(message)) {
    return "Accounting does not have enough inventory cost information to record this entry.";
  }
  if (/ACCOUNTING_|ENABLED|flag/i.test(message)) {
    return "This recording action is currently unavailable. Contact an administrator if you need access.";
  }
  return message;
}

export function ZeroLayerEmptyState({ showOpeningLink }: { showOpeningLink?: boolean }) {
  return (
    <AccountingEmptyState
      title="Accounting inventory values have not been established yet"
      description={
        showOpeningLink
          ? "Inventory quantities exist, but accounting cost layers have not been created. Opening inventory or recorded inventory purchases are required before Sarveda can calculate inventory cost and cost of goods sold."
          : "Inventory quantities exist, but accounting cost layers have not been created yet."
      }
    />
  );
}
