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

import { AccountingPageHeader } from "@/components/admin/accounting/accounting-ui";
import { isPurchasesEnabled } from "@/lib/purchases-api";
import {
  applySidebarHover,
  clearSidebarHover,
  sidebarLinkStyle,
  sidebarNavStyles
} from "@/components/admin/sidebarNavStyles";

const iconProps = { size: 15, strokeWidth: 2 } as const;

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
};

/**
 * Business-friendly accounting IA. Routes unchanged — labels only.
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
      id: "overview",
      title: "Overview",
      items: [
        {
          href: "/admin/accounting",
          label: "Dashboard",
          icon: <LayoutDashboard {...iconProps} />,
          exact: true
        }
      ]
    },
    {
      id: "sales",
      title: "Sales",
      items: [
        { href: "/admin/accounting/order-paid", label: "Sales Entries", icon: <ShoppingBag {...iconProps} /> },
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
      items: [{ href: "/admin/accounting/banking", label: "Banking", icon: <Wallet {...iconProps} /> }]
    },
    {
      id: "inventory",
      title: "Inventory",
      items: [
        {
          href: "/admin/accounting/inventory",
          label: "Inventory Valuation",
          icon: <Package {...iconProps} />
        }
      ]
    },
    {
      id: "gst",
      title: "GST & Tax",
      items: [{ href: "/admin/accounting/gst", label: "GST & ITC", icon: <Receipt {...iconProps} /> }]
    },
    {
      id: "accountant",
      title: "Accountant",
      items: [
        { href: "/admin/accounting/accounts", label: "Chart of Accounts", icon: <BookOpen {...iconProps} /> },
        { href: "/admin/accounting/journals", label: "Journals", icon: <ScrollText {...iconProps} /> }
      ]
    },
    {
      id: "reports",
      title: "Reports",
      items: [
        {
          href: "/admin/accounting/reports",
          label: "Financial Reports",
          icon: <PieChart {...iconProps} />
        }
      ]
    },
    {
      id: "advanced",
      title: "Advanced",
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
        }
      ]
    }
  ];
}

function itemActive(pathname: string, item: NavItem): boolean {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

function groupHasActive(pathname: string, group: NavGroup): boolean {
  return group.items.some((item) => itemActive(pathname, item));
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
 * Nested Accounting tree for the main dark admin sidebar (not an in-page panel).
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
  const workspaceActive = isAccountingWorkspacePath(pathname);
  const [rootOpen, setRootOpen] = useState(workspaceActive);
  const [openIds, setOpenIds] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (workspaceActive) setRootOpen(true);
    setOpenIds((prev) => {
      const next = { ...prev };
      for (const group of groups) {
        if (groupHasActive(pathname, group)) next[group.id] = true;
      }
      return next;
    });
  }, [pathname, groups, workspaceActive]);

  return (
    <div style={{ marginBottom: "2px" }}>
      <button
        type="button"
        aria-expanded={rootOpen}
        onClick={() => setRootOpen((v) => !v)}
        style={{
          ...sidebarLinkStyle(workspaceActive && !rootOpen),
          justifyContent: "space-between",
          cursor: "pointer",
          background: workspaceActive || rootOpen ? sidebarNavStyles.activeBg : "transparent",
          color: workspaceActive || rootOpen ? sidebarNavStyles.activeColor : sidebarNavStyles.idleColor,
          borderLeft:
            workspaceActive || rootOpen
              ? `3px solid ${sidebarNavStyles.activeBorder}`
              : "3px solid transparent",
          width: "100%",
          textAlign: "left",
          borderTop: "none",
          borderRight: "none",
          borderBottom: "none",
          fontFamily: "inherit"
        }}
        onMouseEnter={(e) => {
          if (!(workspaceActive || rootOpen)) applySidebarHover(e.currentTarget, false);
        }}
        onMouseLeave={(e) => {
          if (!(workspaceActive || rootOpen)) clearSidebarHover(e.currentTarget, false);
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <span
            data-nav-icon
            style={{
              color: workspaceActive || rootOpen ? sidebarNavStyles.activeIcon : sidebarNavStyles.idleIcon,
              flexShrink: 0
            }}
          >
            <Landmark size={18} strokeWidth={2} />
          </span>
          Accounting
        </span>
        <ChevronDown
          size={14}
          strokeWidth={2}
          style={{
            flexShrink: 0,
            opacity: 0.7,
            transform: rootOpen ? "rotate(180deg)" : "none",
            transition: "transform 0.15s ease"
          }}
          aria-hidden
        />
      </button>

      {rootOpen ? (
        <div style={{ padding: "2px 0 6px 10px", marginLeft: "8px", borderLeft: "1px solid rgba(185,138,62,0.18)" }}>
          {groups.map((group) => {
            const sectionActive = groupHasActive(pathname, group);
            const open = Boolean(openIds[group.id]);
            return (
              <div key={group.id} style={{ marginBottom: "2px" }}>
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() =>
                    setOpenIds((prev) => ({
                      ...prev,
                      [group.id]: !prev[group.id]
                    }))
                  }
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    width: "100%",
                    boxSizing: "border-box",
                    padding: "7px 10px",
                    borderRadius: "8px",
                    border: "none",
                    background: sectionActive ? "rgba(185,138,62,0.10)" : "transparent",
                    color: sectionActive ? "#f0e2b8" : "rgba(220,210,190,0.55)",
                    fontSize: "12px",
                    fontWeight: 600,
                    letterSpacing: "0.02em",
                    cursor: "pointer",
                    fontFamily: "inherit",
                    textAlign: "left"
                  }}
                >
                  <span>{group.title}</span>
                  <ChevronDown
                    size={12}
                    strokeWidth={2}
                    style={{
                      opacity: 0.65,
                      transform: open ? "rotate(180deg)" : "none",
                      transition: "transform 0.15s ease"
                    }}
                    aria-hidden
                  />
                </button>
                {open ? (
                  <ul style={{ listStyle: "none", margin: "2px 0 4px", padding: "0 0 0 6px" }}>
                    {group.items.map((item) => {
                      const active = itemActive(pathname, item);
                      return (
                        <li key={`${group.id}-${item.href}`}>
                          <Link
                            href={item.href}
                            onClick={() => {
                              beginNavigation?.(item.href);
                              onNavigate?.();
                            }}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "8px",
                              width: "100%",
                              boxSizing: "border-box",
                              padding: "6px 10px",
                              borderRadius: "8px",
                              marginBottom: "1px",
                              textDecoration: "none",
                              fontSize: "12px",
                              fontWeight: active ? 600 : 400,
                              color: active ? sidebarNavStyles.activeColor : sidebarNavStyles.idleColor,
                              background: active ? sidebarNavStyles.activeBg : "transparent",
                              borderLeft: active
                                ? `2px solid ${sidebarNavStyles.activeBorder}`
                                : "2px solid transparent"
                            }}
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
                            <span style={{ lineHeight: 1.25 }}>{item.label}</span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
