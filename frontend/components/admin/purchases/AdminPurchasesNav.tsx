"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Building2, ClipboardList, FileText, Receipt, Wallet } from "lucide-react";

import { AccountingPageHeader } from "@/components/admin/accounting/accounting-ui";
import { isAccountingEnabled } from "@/lib/accounting-api";

const iconProps = { size: 16, strokeWidth: 2 } as const;

const tabs = [
  { href: "/admin/purchases/vendors", label: "Vendors", icon: <Building2 {...iconProps} /> },
  {
    href: "/admin/purchases/purchase-orders",
    label: "Purchase Orders",
    icon: <ClipboardList {...iconProps} />
  },
  { href: "/admin/purchases/bills", label: "Vendor Bills", icon: <FileText {...iconProps} /> },
  { href: "/admin/purchases/expenses", label: "Expenses", icon: <Receipt {...iconProps} /> },
  {
    href: "/admin/accounting/vendor-payments",
    label: "Vendor Payments",
    icon: <Wallet {...iconProps} />,
    accountingOnly: true
  }
];

/** Standalone Purchases rail — only used when Accounting/Books is disabled. */
export function AdminPurchasesNav() {
  const pathname = usePathname();
  const accountingOn = isAccountingEnabled();
  const visible = tabs.filter((t) => !t.accountingOnly || accountingOn);

  return (
    <aside
      className="w-full shrink-0 rounded-xl border border-[#e8e2d9] bg-[#faf5ec] lg:sticky lg:top-20 lg:w-52 lg:self-start"
      aria-label="Purchases modules"
    >
      <div className="border-b border-[#e8e2d9] px-3 py-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8a7060]">Purchases</p>
        <p className="mt-0.5 text-sm font-semibold text-[#1c352a]">Workflow</p>
      </div>
      <nav className="space-y-0.5 px-2 py-3">
        {visible.map((tab) => {
          const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex items-center gap-2 rounded-md px-2.5 py-2 text-[13px] transition-[background-color,color,transform] duration-150 active:scale-[0.98] ${
                active
                  ? "bg-[#1c352a] font-medium text-white"
                  : "text-[#2c2420] hover:bg-white"
              }`}
            >
              <span className={active ? "text-[#b98a3e]" : "text-[#8a7060]"}>{tab.icon}</span>
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}

export function AdminPurchasesHeader({
  title,
  subtitle,
  meta
}: {
  title: string;
  subtitle?: string;
  meta?: ReactNode;
}) {
  return <AccountingPageHeader title={title} subtitle={subtitle} meta={meta} />;
}
