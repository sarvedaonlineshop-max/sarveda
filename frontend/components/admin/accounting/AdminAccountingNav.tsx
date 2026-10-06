"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, type ReactNode } from "react";
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
  Scale,
  ScrollText,
  Settings2,
  ShoppingBag,
  Wallet
} from "lucide-react";

import { AccountingPageHeader } from "@/components/admin/accounting/accounting-ui";
import { isPurchasesEnabled } from "@/lib/purchases-api";
import {
  applySidebarHover,
  clearSidebarHover,
  sidebarLinkStyle,
  sidebarNavStyles
} from "@/components/admin/sidebarNavStyles";

const iconProps = { size: 18, strokeWidth: 2 } as const;

type NavItem = {
  href: string;
  label: string;
  icon: ReactNode;
  exact?: boolean;
};

type NavGroup = {
  id: string;
  title: string;
  items: NavItem[];
  muted?: boolean;
};

/**
 * Business-friendly accounting IA. Routes unchanged — labels only.
 * Dashboard is a direct child of Accounting (no Overview accordion).
 */
export function buildAccountingNavGroups(includePurchasesOps: boolean): NavGroup[] {
  const purchasesOps: NavItem[] = includePurchasesOps
    ? [
        { href: "/admin/purchases/vendors", label: "Vendors", icon: <Building2 {...iconProps} /> },
        {
          href: "/admin/purchases/purchase-orders",
          label: "Purchase Orders",
          icon: <ClipboardList {...iconProps} />
        },
        { href: "/admin/purchases/bills", label: "Bills", icon: <FileText {...iconProps} /> },
        { href: "/admin/purchases/expenses", label: "Expenses", icon: <Receipt {...iconProps} /> }
      ]
    : [];

  return [
    {
      id: "sales",
      title: "Sales",
      items: [
        {
          href: "/admin/accounting/sales",
          label: "Overview",
          icon: <LayoutDashboard {...iconProps} />,
          exact: true
        },
        { href: "/admin/accounting/order-paid", label: "Sales Entries", icon: <ShoppingBag {...iconProps} /> },
        { href: "/admin/accounting/quotes", label: "Quotes", icon: <ScrollText {...iconProps} /> },
        {
          href: "/admin/accounting/order-refunded-full",
          label: "Refunds",
          icon: <RotateCcw {...iconProps} />
        },
        {
          href: "/admin/accounting/settlements",
          label: "Gateway Settlements",
          icon: <Landmark {...iconProps} />
        }
      ]
    },
    {
      id: "purchases",
      title: "Purchases",
      items: [
        ...purchasesOps,
        {
          href: "/admin/accounting/vendor-payments",
          label: "Vendor Payments",
          icon: <Wallet {...iconProps} />
        }
      ]
    },
    {
      id: "banking",
      title: "Banking",
      items: [
        { href: "/admin/accounting/banking", label: "Overview", icon: <LayoutDashboard {...iconProps} />, exact: true },
        { href: "/admin/accounting/banking/accounts", label: "Bank & Cash", icon: <Landmark {...iconProps} /> },
        { href: "/admin/accounting/banking/statements", label: "Statements", icon: <FileText {...iconProps} /> },
        { href: "/admin/accounting/banking/transfers", label: "Transfers", icon: <Wallet {...iconProps} /> },
        { href: "/admin/accounting/banking/reconciliation", label: "Reconciliation", icon: <RotateCcw {...iconProps} /> },
        { href: "/admin/accounting/banking/gateway", label: "Gateway Clearing", icon: <Building2 {...iconProps} /> }
      ]
    },
    {
      id: "inventory",
      title: "Inventory Accounting",
      items: [
        {
          href: "/admin/accounting/inventory",
          label: "Overview",
          icon: <LayoutDashboard {...iconProps} />,
          exact: true
        },
        {
          href: "/admin/accounting/inventory/valuation",
          label: "Valuation",
          icon: <Package {...iconProps} />
        },
        {
          href: "/admin/accounting/inventory/reconciliation",
          label: "Reconciliation",
          icon: <RotateCcw {...iconProps} />
        },
        {
          href: "/admin/accounting/inventory/capitalization",
          label: "Purchase Capitalization",
          icon: <ClipboardList {...iconProps} />
        },
        {
          href: "/admin/accounting/inventory/cogs",
          label: "Cost of Goods Sold",
          icon: <ShoppingBag {...iconProps} />
        },
        {
          href: "/admin/accounting/inventory/reversals",
          label: "Reversals",
          icon: <RotateCcw {...iconProps} />
        }
      ]
    },
    {
      id: "gst",
      title: "GST & Tax",
      items: [
        { href: "/admin/accounting/gst", label: "Overview", icon: <Receipt {...iconProps} />, exact: true },
        { href: "/admin/accounting/gst/sales", label: "Sales GST", icon: <ShoppingBag {...iconProps} /> },
        {
          href: "/admin/accounting/gst/itc",
          label: "Purchase GST / ITC",
          icon: <Package {...iconProps} />
        },
        { href: "/admin/accounting/gst/ledger", label: "GST Ledger", icon: <BookOpen {...iconProps} /> },
        {
          href: "/admin/accounting/gst/reconciliation",
          label: "Reconciliation",
          icon: <Scale {...iconProps} />
        },
        {
          href: "/admin/accounting/gst/reports",
          label: "Reports & Export",
          icon: <PieChart {...iconProps} />
        }
      ]
    },
    {
      id: "accountant",
      title: "Accountant",
      items: [
        {
          href: "/admin/accounting/accountant",
          label: "Overview",
          icon: <LayoutDashboard {...iconProps} />,
          exact: true
        },
        { href: "/admin/accounting/accounts", label: "Chart of Accounts", icon: <BookOpen {...iconProps} /> },
        { href: "/admin/accounting/journals", label: "Journal Entries", icon: <ScrollText {...iconProps} /> }
      ]
    },
    {
      id: "reports",
      title: "Financial Reports",
      items: [
        {
          href: "/admin/accounting/reports",
          label: "Statements & Ledgers",
          icon: <PieChart {...iconProps} />
        }
      ]
    },
    {
      id: "advanced",
      title: "Advanced",
      muted: true,
      items: [
        {
          href: "/admin/accounting/expense-mappings",
          label: "Expense Account Rules",
          icon: <Settings2 {...iconProps} />
        },
        {
          href: "/admin/accounting/vendor-bills",
          label: "Bill Recognition",
          icon: <FileText {...iconProps} />
        },
        {
          href: "/admin/accounting/expenses",
          label: "Expense Recognition",
          icon: <Receipt {...iconProps} />
        },
        {
          href: "/admin/accounting/purchases",
          label: "Purchase Reconciliation",
          icon: <Package {...iconProps} />
        },
        {
          href: "/admin/accounting/opening",
          label: "Opening Balances",
          icon: <DoorOpen {...iconProps} />
        },
        {
          href: "/admin/accounting/inventory/opening",
          label: "Inventory Opening",
          icon: <Package {...iconProps} />
        }
      ]
    }
  ];
}

function itemActive(pathname: string, item: NavItem): boolean {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export function isAccountingWorkspacePath(pathname: string): boolean {
  return pathname.startsWith("/admin/accounting") || pathname.startsWith("/admin/purchases");
}

export function AdminAccountingHeader({
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

/**
 * Accounting menu for the dedicated sidebar. Starts at Dashboard.
 * Every section stays open — there is no Accounting dropdown.
 */
export function AdminAccountingSidebarTree({
  onNavigate,
  beginNavigation
}: {
  onNavigate?: () => void;
  beginNavigation?: (href: string) => void;
}) {
  const pathname = usePathname();
  const groups = useMemo(() => buildAccountingNavGroups(isPurchasesEnabled()), []);
  const dashboardActive = pathname === "/admin/accounting";

  return (
    <div>
      <Link
        href="/admin/accounting"
        onClick={() => {
          beginNavigation?.("/admin/accounting");
          onNavigate?.();
        }}
        style={sidebarLinkStyle(dashboardActive)}
        onMouseEnter={(e) => applySidebarHover(e.currentTarget, dashboardActive)}
        onMouseLeave={(e) => clearSidebarHover(e.currentTarget, dashboardActive)}
      >
        <span
          data-nav-icon
          style={{
            color: dashboardActive ? sidebarNavStyles.activeIcon : sidebarNavStyles.idleIcon,
            flexShrink: 0
          }}
        >
          <LayoutDashboard {...iconProps} />
        </span>
        Dashboard
      </Link>

      {groups.map((group) => {
        const muted = Boolean(group.muted);
        return (
          <div key={group.id} style={{ marginTop: 8, opacity: muted ? 0.9 : 1 }}>
            <p
              style={{
                color: "rgba(185,138,62,0.72)",
                fontSize: "14px",
                fontWeight: 700,
                letterSpacing: "0.04em",
                textTransform: "uppercase",
                padding: "10px 12px 4px",
                margin: 0
              }}
            >
              {group.title}
            </p>
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {group.items.map((item) => {
                const active = itemActive(pathname, item);
                return (
                  <li key={`${group.id}-${item.href}`}>
                    <Link
                      href={item.href}
                      title={item.label}
                      onClick={() => {
                        beginNavigation?.(item.href);
                        onNavigate?.();
                      }}
                      style={sidebarLinkStyle(active)}
                      onMouseEnter={(e) => applySidebarHover(e.currentTarget, active)}
                      onMouseLeave={(e) => clearSidebarHover(e.currentTarget, active)}
                    >
                      <span
                        data-nav-icon
                        style={{
                          color: active ? sidebarNavStyles.activeIcon : sidebarNavStyles.idleIcon,
                          flexShrink: 0
                        }}
                      >
                        {item.icon}
                      </span>
                      <span style={{ lineHeight: 1.3 }}>{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
