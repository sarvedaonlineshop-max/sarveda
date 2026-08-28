"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, ClipboardList, FileText, Receipt } from "lucide-react";

const iconProps = { size: 16, strokeWidth: 2 } as const;

const tabs = [
  { href: "/admin/purchases/vendors", label: "Vendors", icon: <Building2 {...iconProps} /> },
  {
    href: "/admin/purchases/purchase-orders",
    label: "Purchase orders",
    icon: <ClipboardList {...iconProps} />
  },
  { href: "/admin/purchases/bills", label: "Bills", icon: <FileText {...iconProps} /> },
  { href: "/admin/purchases/expenses", label: "Expenses", icon: <Receipt {...iconProps} /> }
];

/** Standalone Purchases rail — only used when Accounting/Books is disabled. */
export function AdminPurchasesNav() {
  const pathname = usePathname();
  return (
    <aside
      className="w-full shrink-0 rounded-xl border border-[#d9e2dc] bg-[#f7faf8] lg:sticky lg:top-20 lg:w-52 lg:self-start"
      aria-label="Purchases modules"
    >
      <div className="border-b border-[#d9e2dc] px-3 py-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#6b7c72]">Ops</p>
        <p className="mt-0.5 text-sm font-semibold text-[#1e3a2f]">Purchases</p>
      </div>
      <nav className="space-y-0.5 px-2 py-3">
        {tabs.map((tab) => {
          const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex items-center gap-2 rounded-md px-2.5 py-2 text-[13px] transition-colors ${
                active
                  ? "bg-[#1e3a2f] font-medium text-white shadow-sm"
                  : "text-[#2c3d34] hover:bg-[#e8f0eb]"
              }`}
            >
              <span className={active ? "text-brand-gold" : "text-[#6b7c72]"}>{tab.icon}</span>
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}

export function AdminPurchasesHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div
      style={{
        background: "linear-gradient(135deg, #1c352a 0%, #2d5040 100%)",
        borderRadius: "16px",
        padding: "20px 24px"
      }}
    >
      <h1 className="text-2xl font-bold text-[#faf5ec]">{title}</h1>
      {subtitle ? <p className="mt-1 text-xs text-[#a8c4b0]">{subtitle}</p> : null}
    </div>
  );
}
