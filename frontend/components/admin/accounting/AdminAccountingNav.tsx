"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  BookOpen,
  Building2,
  ChevronDown,
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
  id: string;
  title: string;
  /** Single top-level link (Dashboard) — no accordion. */
  link?: NavItem;
  items?: NavItem[];
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
      id: "dashboard",
      title: "Dashboard",
      items: [
        {
          href: "/admin/accounting",
          label: "Overview",
          icon: <LayoutDashboard {...iconProps} />,
          exact: true
        }
      ]
    },
    {
      id: "sales",
      title: "Sales",
      items: [
        { href: "/admin/accounting/order-paid", label: "Sales receipts", icon: <ShoppingBag {...iconProps} /> },
        { href: "/admin/accounting/order-refunded-full", label: "Refunds", icon: <RotateCcw {...iconProps} /> },
        { href: "/admin/accounting/settlements", label: "Gateway settlements", icon: <Landmark {...iconProps} /> }
      ]
    },
    {
      id: "purchases",
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
      id: "banking",
      title: "Banking",
      items: [
        { href: "/admin/accounting/banking", label: "Accounts & transfers", icon: <Wallet {...iconProps} /> }
      ]
    },
    {
      id: "accountant",
      title: "Accountant",
      items: [
        { href: "/admin/accounting/accounts", label: "Chart of accounts", icon: <BookOpen {...iconProps} /> },
        { href: "/admin/accounting/journals", label: "Manual journals", icon: <ScrollText {...iconProps} /> },
        { href: "/admin/accounting/inventory", label: "Inventory", icon: <Package {...iconProps} /> },
        { href: "/admin/accounting/opening", label: "Opening balances", icon: <DoorOpen {...iconProps} /> }
      ]
    },
    {
      id: "gst",
      title: "GST",
      items: [{ href: "/admin/accounting/gst", label: "GST & ITC", icon: <Receipt {...iconProps} /> }]
    },
    {
      id: "reports",
      title: "Reports",
      items: [{ href: "/admin/accounting/reports", label: "Financial reports", icon: <PieChart {...iconProps} /> }]
    }
  ];
}

function itemActive(pathname: string, item: NavItem): boolean {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

function groupHasActive(pathname: string, group: NavGroup): boolean {
  if (group.link) return itemActive(pathname, group.link);
  return (group.items ?? []).some((item) => itemActive(pathname, item));
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
      <h1 className="text-2xl font-semibold text-[#1e3a2f]">{title}</h1>
      {subtitle ? <p className="text-sm text-neutral-600">{subtitle}</p> : null}
    </div>
  );
}

function AccordionGroup({
  group,
  pathname,
  open,
  onToggle
}: {
  group: NavGroup;
  pathname: string;
  open: boolean;
  onToggle: () => void;
}) {
  if (group.link) {
    const active = itemActive(pathname, group.link);
    return (
      <Link
        href={group.link.href}
        className={`flex items-center gap-2 rounded-md px-2.5 py-2 text-[13px] transition-colors ${
          active ? "bg-[#1e3a2f] font-medium text-white shadow-sm" : "text-[#2c3d34] hover:bg-[#e8f0eb]"
        }`}
      >
        <span className={active ? "text-brand-gold" : "text-[#6b7c72]"}>{group.link.icon}</span>
        {group.link.label}
      </Link>
    );
  }

  const items = group.items ?? [];
  const sectionActive = groupHasActive(pathname, group);

  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className={`flex w-full items-center justify-between rounded-md px-2.5 py-2 text-left text-[13px] font-semibold transition-colors ${
          sectionActive ? "bg-[#e8f0eb] text-[#1e3a2f]" : "text-[#2c3d34] hover:bg-[#eef3f0]"
        }`}
      >
        <span>{group.title}</span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-[#6b7c72] transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>
      {open ? (
        <ul className="mt-0.5 space-y-0.5 border-l border-[#d9e2dc] ml-3 pl-2">
          {items.map((item) => {
            const active = itemActive(pathname, item);
            return (
              <li key={`${group.id}-${item.href}`}>
                <Link
                  href={item.href}
                  className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-[12.5px] transition-colors ${
                    active
                      ? "bg-[#1e3a2f] font-medium text-white shadow-sm"
                      : "text-[#3d4f45] hover:bg-[#e8f0eb]"
                  }`}
                >
                  <span className={active ? "text-brand-gold" : "text-[#6b7c72]"}>{item.icon}</span>
                  <span className="leading-tight">{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

/** Zoho Books–style left module nav with section dropdowns. */
export function AdminAccountingNav() {
  const pathname = usePathname();
  const groups = useMemo(() => buildNav(isPurchasesEnabled()), []);
  const [openIds, setOpenIds] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setOpenIds((prev) => {
      const next = { ...prev };
      for (const group of groups) {
        if (group.link) continue;
        if (groupHasActive(pathname, group)) next[group.id] = true;
      }
      return next;
    });
  }, [pathname, groups]);

  return (
    <aside
      className="w-full shrink-0 rounded-xl border border-[#d9e2dc] bg-[#f7faf8] lg:sticky lg:top-20 lg:w-56 lg:self-start"
      aria-label="Accounting modules"
    >
      <div className="border-b border-[#d9e2dc] px-3 py-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#6b7c72]">Books</p>
        <p className="mt-0.5 text-sm font-semibold text-[#1e3a2f]">Accounting</p>
      </div>
      <nav className="max-h-[min(70vh,40rem)] space-y-1 overflow-y-auto px-2 py-3 [scrollbar-width:thin]">
        {groups.map((group) => (
          <AccordionGroup
            key={group.id}
            group={group}
            pathname={pathname}
            open={Boolean(openIds[group.id])}
            onToggle={() =>
              setOpenIds((prev) => ({
                ...prev,
                [group.id]: !prev[group.id]
              }))
            }
          />
        ))}
      </nav>
    </aside>
  );
}
