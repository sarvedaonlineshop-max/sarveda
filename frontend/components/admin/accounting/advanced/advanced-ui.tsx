"use client";

import type { ReactNode } from "react";
import { AdminAccountingHeader } from "@/components/admin/accounting/AdminAccountingNav";
import {
  AccountingAlert,
  AccountingSectionCard,
  AccountingSectionHeader,
  accountingUi
} from "@/components/admin/accounting/accounting-ui";

/** Shared shell for Advanced (low-frequency / cutover) screens. */
export function AdvancedPageShell({
  title,
  subtitle,
  children
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-[1400px] space-y-4">
      <div className="rounded-[10px] border border-[#ebe4db] bg-[#faf5ec]/70 px-3 py-2 text-[12px] text-[#6b5c52]">
        <span className="font-semibold text-[#8a7060]">Advanced</span>
        <span className="mx-2 text-[#d4c4b0]">·</span>
        Low-frequency accounting setup and cutover tools — not part of daily bookkeeping.
      </div>
      <AdminAccountingHeader title={title} subtitle={subtitle} />
      {children}
    </div>
  );
}

export function AdvancedSection({
  title,
  children
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <AccountingSectionCard>
      <AccountingSectionHeader title={title} />
      {children}
    </AccountingSectionCard>
  );
}

export function AdvancedWarning({ children }: { children: ReactNode }) {
  return <AccountingAlert tone="warning">{children}</AccountingAlert>;
}

export { AccountingSectionCard, AccountingSectionHeader, accountingUi };
