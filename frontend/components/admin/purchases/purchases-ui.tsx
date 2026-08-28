"use client";

import Link from "next/link";
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

export function PurchasesPageShell({
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
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <AccountingPageHeader title={title} subtitle={subtitle} />
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {children}
    </div>
  );
}

export function PurchasesFilterBar({ children }: { children: ReactNode }) {
  return (
    <div
      className="flex flex-wrap items-end gap-3 rounded-[12px] border bg-white p-3 sm:p-4"
      style={{ borderColor: accountingUi.border }}
    >
      {children}
    </div>
  );
}

export function PurchasesTableWrap({ children }: { children: ReactNode }) {
  return (
    <div
      className="overflow-x-auto rounded-[12px] border bg-white"
      style={{ borderColor: accountingUi.border }}
    >
      {children}
    </div>
  );
}

export function purchasesTh(right = false): string {
  return `px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-[#8a7060] ${
    right ? "text-right" : "text-left"
  }`;
}

export function purchasesTd(right = false): string {
  return `px-3 py-[11px] text-[13px] text-[#2c2420] ${right ? "text-right tabular-nums" : ""}`;
}

export function PurchasesDocLink({
  href,
  children
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className="font-semibold text-[#1c352a] underline-offset-2 transition-colors hover:text-[#2d5040] hover:underline"
    >
      {children}
    </Link>
  );
}

export function moneyClass(): string {
  return "tabular-nums font-semibold text-[#1c352a]";
}

export function fmtPurchasesDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export function poStatusLabel(status: string): string {
  const map: Record<string, string> = {
    DRAFT: "Draft",
    SENT: "Issued",
    PARTIALLY_RECEIVED: "Partially Received",
    RECEIVED: "Received",
    CANCELLED: "Cancelled"
  };
  return map[status] ?? status.replace(/_/g, " ");
}

export function poStatusTone(status: string): AccountingBadgeTone {
  if (status === "RECEIVED") return "success";
  if (status === "PARTIALLY_RECEIVED" || status === "SENT") return "info";
  if (status === "CANCELLED") return "error";
  return "neutral";
}

export function billStatusLabel(status: string): string {
  const map: Record<string, string> = {
    DRAFT: "Draft",
    OPEN: "Open",
    PAID: "Paid",
    VOID: "Void"
  };
  return map[status] ?? status;
}

export function billStatusTone(status: string, overdue = false): AccountingBadgeTone {
  if (overdue && status === "OPEN") return "error";
  if (status === "PAID") return "success";
  if (status === "OPEN") return "warning";
  if (status === "VOID") return "error";
  return "neutral";
}

export function expenseStatusLabel(status: string): string {
  return status === "RECORDED" ? "Recorded" : status === "DRAFT" ? "Draft" : status;
}

export function expenseStatusTone(status: string): AccountingBadgeTone {
  return status === "RECORDED" ? "success" : "neutral";
}

export function isBillOverdue(dueDate: string | null | undefined, status: string): boolean {
  if (status !== "OPEN" || !dueDate) return false;
  const due = new Date(dueDate);
  if (Number.isNaN(due.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return due < today;
}

export function fieldLabelClass(): string {
  return "block text-xs font-semibold text-[#6b5c52]";
}

export function FormSection({
  title,
  description,
  children
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <AccountingSectionCard>
      <AccountingSectionHeader title={title} description={description} />
      <div className="grid gap-3 sm:grid-cols-2">{children}</div>
    </AccountingSectionCard>
  );
}
