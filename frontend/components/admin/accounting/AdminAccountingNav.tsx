"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import {
  BookOpen,
  Building2,
  ClipboardList,
  DoorOpen,
  FileText,
  Landmark,
  LayoutDashboard,
  Package,
  PieChart,
  Receipt,
  RotateCcw,
  ScrollText,
  Settings2,
  ShoppingBag,
  Wallet
} from "lucide-react";

import { isPurchasesEnabled } from "@/lib/purchases-api";

const iconProps = { size: 16, strokeWidth: 2 } as const;

type NavItem = {
  href: string;
  label: string;
  icon: ReactNode;
  exact?: boolean;
};

type NavGroup = {
  title: string;
  items: NavItem[];
};

function buildNav(includePurchasesOps: boolean): NavGroup[] {
  const purchasesOps: NavItem[] = includePurchasesOps
    ? [
        { href: "/admin/purchases/vendors", label: "Vendors", icon: <Building2 {...iconProps} /> },
        {
          href: "/admin/purchases/purchase-orders",
          label: "Purchase orders",
          icon: <ClipboardList {...iconProps} />
        },
        { href: "/admin/purchases/bills", label: "Bills", icon: <FileText {...iconProps} /> },
        { href: "/admin/purchases/expenses", label: "Expenses", icon: <Receipt {...iconProps} /> }
      ]
    : [];

  return [
    {
      title: "Home",
      items: [
        { href: "/admin/accounting", label: "Dashboard", icon: <LayoutDashboard {...iconProps} />, exact: true }
      ]
    },
    {
      title: "Sales",
      items: [
        { href: "/admin/accounting/order-paid", label: "Sales receipts", icon: <ShoppingBag {...iconProps} /> },
        { href: "/admin/accounting/order-refunded-full", label: "Refunds", icon: <RotateCcw {...iconProps} /> },
        { href: "/admin/accounting/settlements", label: "Gateway settlements", icon: <Landmark {...iconProps} /> }
      ]
    },
    {
      title: "Purchases",
      items: [
        ...purchasesOps,
        { href: "/admin/accounting/vendor-bills", label: "Bill postings", icon: <FileText {...iconProps} /> },
        { href: "/admin/accounting/vendor-payments", label: "Payments made", icon: <Wallet {...iconProps} /> },
        { href: "/admin/accounting/expenses", label: "Expense postings", icon: <Receipt {...iconProps} /> },
        { href: "/admin/accounting/expense-mappings", label: "Expense accounts", icon: <Settings2 {...iconProps} /> },
        { href: "/admin/accounting/purchases", label: "Purchase recon", icon: <Package {...iconProps} /> }
      ]
    },
    {
      title: "Banking",
      items: [{ href: "/admin/accounting/banking", label: "Banking", icon: <Wallet {...iconProps} /> }]
    },
    {
      title: "Accountant",
      items: [
        { href: "/admin/accounting/accounts", label: "Chart of accounts", icon: <BookOpen {...iconProps} /> },
        { href: "/admin/accounting/journals", label: "Manual journals", icon: <ScrollText {...iconProps} /> },
        { href: "/admin/accounting/inventory", label: "Inventory", icon: <Package {...iconProps} /> },
        { href: "/admin/accounting/opening", label: "Opening balances", icon: <DoorOpen {...iconProps} /> }
      ]
    },
    {
      title: "GST",
      items: [{ href: "/admin/accounting/gst", label: "GST & ITC", icon: <Receipt {...iconProps} /> }]
    },
    {
      title: "Reports",
      items: [{ href: "/admin/accounting/reports", label: "Reports", icon: <PieChart {...iconProps} /> }]
    }
  ];
}

function itemActive(pathname: string, item: NavItem): boolean {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export function AdminAccountingHeader({
  title,
  subtitle
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium uppercase tracking-wide text-amber-700">
        Native Accounting — UAT / Training (not official books until 01-Sep-2026)
      </p>
      <h1 className="text-2xl font-semibold text-[#1e3a2f]">{title}</h1>
      {subtitle ? <p className="text-sm text-neutral-600">{subtitle}</p> : null}
    </div>
  );
}

/** Zoho Books–style left module nav for Accounting. */
export function AdminAccountingNav() {
  const pathname = usePathname();
  const groups = buildNav(isPurchasesEnabled());

  return (
    <aside
      className="w-full shrink-0 rounded-xl border border-[#d9e2dc] bg-[#f7faf8] lg:sticky lg:top-20 lg:w-56 lg:self-start"
      aria-label="Accounting modules"
    >
      <div className="border-b border-[#d9e2dc] px-3 py-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#6b7c72]">Books</p>
        <p className="mt-0.5 text-sm font-semibold text-[#1e3a2f]">Accounting</p>
      </div>
      <nav className="max-h-[min(70vh,40rem)] space-y-3 overflow-y-auto px-2 py-3 [scrollbar-width:thin]">
        {groups.map((group) => (
          <div key={group.title}>
            <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#8a9a90]">
              {group.title}
            </p>
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const active = itemActive(pathname, item);
                return (
                  <li key={`${group.title}-${item.href}-${item.label}`}>
                    <Link
                      href={item.href}
                      className={`flex items-center gap-2 rounded-md px-2.5 py-2 text-[13px] transition-colors ${
                        active
                          ? "bg-[#1e3a2f] font-medium text-white shadow-sm"
                          : "text-[#2c3d34] hover:bg-[#e8f0eb]"
                      }`}
                    >
                      <span className={active ? "text-brand-gold" : "text-[#6b7c72]"}>{item.icon}</span>
                      <span className="leading-tight">{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  );
}
