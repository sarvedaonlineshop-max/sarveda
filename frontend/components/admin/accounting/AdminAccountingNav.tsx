"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpen,
  FileText,
  LayoutDashboard,
  Landmark,
  Package,
  PieChart,
  Receipt,
  RotateCcw,
  ScrollText,
  Search,
  Wallet,
  DoorOpen
} from "lucide-react";

const iconProps = { size: 16, strokeWidth: 2 } as const;

const nav = [
  { href: "/admin/accounting", label: "Dashboard", icon: <LayoutDashboard {...iconProps} />, exact: true },
  { href: "/admin/accounting/reports", label: "Reports", icon: <PieChart {...iconProps} /> },
  { href: "/admin/accounting/accounts", label: "Chart of Accounts", icon: <BookOpen {...iconProps} /> },
  { href: "/admin/accounting/journals", label: "Journals", icon: <ScrollText {...iconProps} /> },
  { href: "/admin/accounting/order-paid", label: "ORDER_PAID Shadow", icon: <Search {...iconProps} /> },
  {
    href: "/admin/accounting/order-refunded-full",
    label: "Full Refund Shadow",
    icon: <RotateCcw {...iconProps} />
  },
  {
    href: "/admin/accounting/banking",
    label: "Banking",
    icon: <Wallet {...iconProps} />
  },
  {
    href: "/admin/accounting/gst",
    label: "GST",
    icon: <Receipt {...iconProps} />
  },
  {
    href: "/admin/accounting/settlements",
    label: "Settlements",
    icon: <Landmark {...iconProps} />
  },
  {
    href: "/admin/accounting/vendor-bills",
    label: "Vendor Bills / AP",
    icon: <FileText {...iconProps} />
  },
  {
    href: "/admin/accounting/purchases",
    label: "Purchase Recon",
    icon: <Package {...iconProps} />
  },
  {
    href: "/admin/accounting/vendor-payments",
    label: "Vendor Payments",
    icon: <Wallet {...iconProps} />
  },
  {
    href: "/admin/accounting/expenses",
    label: "Expenses",
    icon: <Receipt {...iconProps} />
  },
  {
    href: "/admin/accounting/expense-mappings",
    label: "Expense Mappings",
    icon: <BookOpen {...iconProps} />
  },
  {
    href: "/admin/accounting/inventory",
    label: "Inventory / Opening",
    icon: <Package {...iconProps} />
  },
  {
    href: "/admin/accounting/opening",
    label: "Opening / Cutover",
    icon: <DoorOpen {...iconProps} />
  }
];

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
        Native Accounting — Shadow / Development (Zoho remains authoritative)
      </p>
      <h1 className="text-2xl font-semibold text-[#1e3a2f]">{title}</h1>
      {subtitle ? <p className="text-sm text-neutral-600">{subtitle}</p> : null}
    </div>
  );
}

export function AdminAccountingNav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-wrap gap-2 border-b border-neutral-200 pb-3">
      {nav.map((item) => {
        const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm ${
              active
                ? "bg-[#1e3a2f] text-white"
                : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200"
            }`}
          >
            {item.icon}
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
