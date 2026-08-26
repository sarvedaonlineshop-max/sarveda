"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import {
  Activity,
  BookOpen,
  Boxes,
  CalendarDays,
  CircleDollarSign,
  ClipboardList,
  GraduationCap,
  LayoutDashboard,
  Landmark,
  MapPinHouse,
  PackageSearch,
  ScanSearch,
  ShoppingCart,
  Star,
  Tags,
  Truck,
  UserRound,
  Users
} from "lucide-react";
import { logoutSession } from "@/lib/auth-client";
import { isAccountingEmailAllowed } from "@/lib/accounting-access";
import { AdminChatsSidebarLink } from "@/components/admin/AdminChatsSidebarLink";
import { AdminOrdersSidebarLink } from "@/components/admin/AdminOrdersSidebarLink";
import { useAdminNavOptional } from "@/components/admin/AdminNavContext";
import { useAdminUser, useIsSuperAdmin } from "@/components/admin/AdminUserContext";
import { adminTheme as t } from "@/lib/admin-theme";
import {
  applySidebarHover,
  clearSidebarHover,
  sidebarLinkStyle,
  sidebarNavStyles
} from "@/components/admin/sidebarNavStyles";

type NavItem = {
  href: string;
  label: string;
  icon: React.ReactNode;
  match?: "exact" | "prefix";
};

const iconProps = { size: 18, strokeWidth: 2 } as const;

const icon = {
  dashboard: <LayoutDashboard {...iconProps} />,
  enrollments: <Users {...iconProps} />,
  inventory: <ClipboardList {...iconProps} />,
  products: <Boxes {...iconProps} />,
  courses: <BookOpen {...iconProps} />,
  events: <CalendarDays {...iconProps} />,
  customers: <UserRound {...iconProps} />,
  marketplaces: <Truck {...iconProps} />,
  reports: <PackageSearch {...iconProps} />,
  coupons: <Tags {...iconProps} />,
  mentors: <GraduationCap {...iconProps} />,
  reviews: <Star {...iconProps} />,
  reconciliation: <CircleDollarSign {...iconProps} />,
  pickup: <MapPinHouse {...iconProps} />,
  catalogGaps: <ScanSearch {...iconProps} />,
  purchases: <ShoppingCart {...iconProps} />,
  accounting: <Landmark {...iconProps} />,
  activity: <Activity {...iconProps} />
};

const purchasesEnabled =
  process.env.NEXT_PUBLIC_PURCHASES_ENABLED === "1" ||
  process.env.NEXT_PUBLIC_PURCHASES_ENABLED === "true";

const accountingFlagOn =
  process.env.NEXT_PUBLIC_ACCOUNTING_ENABLED === "1" ||
  process.env.NEXT_PUBLIC_ACCOUNTING_ENABLED === "true";

const primaryNav: NavItem[] = [
  { href: "/admin", label: "Dashboard", icon: icon.dashboard, match: "exact" },
  { href: "/admin/enrollments", label: "Enrollments", icon: icon.enrollments },
  { href: "/admin/inventory", label: "Inventory", icon: icon.inventory },
  { href: "/admin/products", label: "Products", icon: icon.products },
  { href: "/admin/courses", label: "Courses", icon: icon.courses },
  { href: "/admin/content?type=events", label: "Events", icon: icon.events },
  { href: "/admin/customers", label: "Customers", icon: icon.customers }
];

const secondaryNav: NavItem[] = [
  { href: "/admin/marketplaces", label: "Marketplaces", icon: icon.marketplaces },
  { href: "/admin/reports", label: "Reports", icon: icon.reports },
  { href: "/admin/coupons", label: "Coupons", icon: icon.coupons },
  { href: "/admin/mentors", label: "Mentors", icon: icon.mentors },
  { href: "/admin/reviews", label: "Reviews", icon: icon.reviews },
  { href: "/admin/reconciliation", label: "Reconciliation", icon: icon.reconciliation }
];

const opsNavBase: NavItem[] = [
  { href: "/admin/settings/pickup-locations", label: "Pickup Locations", icon: icon.pickup },
  { href: "/admin/catalog-gaps", label: "Catalog Gaps", icon: icon.catalogGaps }
];

const superAdminNav: NavItem[] = [{ href: "/admin/activity", label: "Admin activity", icon: icon.activity }];

function NavLink({
  item,
  activePath,
  pendingHref,
  onNavigate,
  contentType,
  beginNavigation
}: {
  item: NavItem;
  activePath: string;
  pendingHref?: string | null;
  onNavigate?: () => void;
  contentType?: string | null;
  beginNavigation?: (href: string) => void;
}) {
  const hrefPath = item.href.split("?")[0];
  let isActive =
    item.match === "exact"
      ? activePath === hrefPath
      : activePath === hrefPath || activePath.startsWith(`${hrefPath}/`);

  // Books workspace: Purchases ops live under Accounting when Accounting is enabled.
  if (hrefPath === "/admin/accounting" && item.match !== "exact") {
    isActive = isActive || activePath.startsWith("/admin/purchases");
  }

  if (item.href.includes("type=events")) {
    isActive =
      Boolean(pendingHref?.includes("type=events")) ||
      (activePath === "/admin/content" && contentType === "events") ||
      activePath.startsWith("/admin/content/events");
  }

  return (
    <Link
      href={item.href}
      onClick={() => {
        beginNavigation?.(item.href);
        onNavigate?.();
      }}
      style={sidebarLinkStyle(isActive)}
      onMouseEnter={(e) => applySidebarHover(e.currentTarget, isActive)}
      onMouseLeave={(e) => clearSidebarHover(e.currentTarget, isActive)}
    >
      <span
        data-nav-icon
        style={{
          color: isActive ? sidebarNavStyles.activeIcon : sidebarNavStyles.idleIcon,
          flexShrink: 0,
          transition: "color 0.15s ease"
        }}
      >
        {item.icon}
      </span>
      {item.label}
    </Link>
  );
}

function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const contentType = searchParams.get("type");
  const isSuper = useIsSuperAdmin();
  const adminUser = useAdminUser();
  const accountingEnabled =
    accountingFlagOn && isAccountingEmailAllowed(adminUser?.email);
  const opsNav: NavItem[] = [
    ...(!accountingEnabled && purchasesEnabled
      ? [{ href: "/admin/purchases", label: "Purchases", icon: icon.purchases }]
      : []),
    ...(accountingEnabled ? [{ href: "/admin/accounting", label: "Accounting", icon: icon.accounting }] : []),
    ...opsNavBase
  ];
  const nav = useAdminNavOptional();
  const activePath = nav?.activePath ?? pathname;
  const pendingHref = nav?.pendingHref ?? null;
  const beginNavigation = nav?.beginNavigation;

  return (
    <>
      <NavGroup label="Main Menu">
        <NavLink
          item={primaryNav[0]!}
          activePath={activePath}
          pendingHref={pendingHref}
          onNavigate={onNavigate}
          beginNavigation={beginNavigation}
        />
        <AdminOrdersSidebarLink onNavigate={onNavigate} />
        {primaryNav.slice(1, 3).map((item) => (
          <NavLink
            key={item.href}
            item={item}
            activePath={activePath}
            pendingHref={pendingHref}
            onNavigate={onNavigate}
            beginNavigation={beginNavigation}
          />
        ))}
        <AdminChatsSidebarLink onNavigate={onNavigate} />
        {primaryNav.slice(3).map((item) => (
          <NavLink
            key={item.href}
            item={item}
            activePath={activePath}
            pendingHref={pendingHref}
            onNavigate={onNavigate}
            contentType={contentType}
            beginNavigation={beginNavigation}
          />
        ))}
      </NavGroup>

      <NavGroup label="Commerce">
        {secondaryNav.map((item) => (
          <NavLink
            key={item.href}
            item={item}
            activePath={activePath}
            pendingHref={pendingHref}
            onNavigate={onNavigate}
            beginNavigation={beginNavigation}
          />
        ))}
      </NavGroup>

      <NavGroup label="Ops">
        {opsNav.map((item) => (
          <NavLink
            key={item.href}
            item={item}
            activePath={activePath}
            pendingHref={pendingHref}
            onNavigate={onNavigate}
            beginNavigation={beginNavigation}
          />
        ))}
      </NavGroup>

      {isSuper ? (
        <NavGroup label="Super admin">
          {superAdminNav.map((item) => (
            <NavLink
              key={item.href}
              item={item}
              activePath={activePath}
              pendingHref={pendingHref}
              onNavigate={onNavigate}
              beginNavigation={beginNavigation}
            />
          ))}
        </NavGroup>
      ) : null}
    </>
  );
}

function NavGroup({
  label,
  children
}: {
  label?: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: "10px" }}>
      {label ? (
        <p
          style={{
            color: "rgba(185,138,62,0.5)",
            fontSize: "10px",
            fontWeight: 700,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            padding: "8px 10px 6px",
            marginTop: "4px",
            borderTop: "1px solid rgba(185,138,62,0.08)",
            paddingTop: "14px"
          }}
        >
          {label}
        </p>
      ) : null}
      {children}
    </div>
  );
}

export function AdminSidebar({
  onNavigate,
  preferDarkMain,
  onToggleMainTheme
}: {
  onNavigate?: () => void;
  preferDarkMain: boolean;
  onToggleMainTheme: () => void;
}) {
  return (
    <div
      className="flex h-full flex-col"
      style={{ background: t.sidebarBg, borderRight: `1px solid ${t.sidebarBorder}` }}
    >
      <div style={{ padding: "24px 20px 20px", borderBottom: "1px solid rgba(185,138,62,0.15)" }}>
        <Link href="/admin" onClick={onNavigate} style={{ display: "block" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <Image
              src="/brand/sarveda-logo.png"
              alt=""
              width={34}
              height={34}
              style={{ objectFit: "contain", flexShrink: 0 }}
              aria-hidden
            />
            <div>
              <p style={{ color: "#fff", fontSize: "15px", fontWeight: 700, lineHeight: 1.1 }}>Sarveda</p>
              <p
                style={{
                  color: t.primary,
                  fontSize: "10px",
                  fontWeight: 600,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase"
                }}
              >
                Admin
              </p>
            </div>
          </div>
        </Link>
      </div>

      <nav style={{ flex: 1, padding: "12px 10px", overflowY: "auto" }}>
        <Suspense fallback={null}>
          <SidebarNav onNavigate={onNavigate} />
        </Suspense>
      </nav>

      <div style={{ padding: "12px 10px", borderTop: "1px solid rgba(255,255,255,0.07)" }}>
        <button
          type="button"
          onClick={onToggleMainTheme}
          style={{
            width: "100%",
            padding: "8px 12px",
            borderRadius: "8px",
            textAlign: "left",
            color: "rgba(255,255,255,0.4)",
            fontSize: "12px",
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
            cursor: "pointer",
            marginBottom: "4px",
            transition: "background 0.15s ease, color 0.15s ease"
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = sidebarNavStyles.hoverBg;
            e.currentTarget.style.color = sidebarNavStyles.hoverColor;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "rgba(255,255,255,0.04)";
            e.currentTarget.style.color = "rgba(255,255,255,0.4)";
          }}
        >
          {preferDarkMain ? "☀ Light workspace" : "☾ Dark workspace"}
        </button>
        <Link
          href="/shop"
          onClick={onNavigate}
          style={{
            display: "block",
            padding: "8px 12px",
            color: "rgba(255,255,255,0.4)",
            fontSize: "12px",
            borderRadius: "8px",
            textDecoration: "none",
            background: "transparent",
            transition: "background 0.15s ease, color 0.15s ease"
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = sidebarNavStyles.hoverBg;
            e.currentTarget.style.color = sidebarNavStyles.hoverColor;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.color = "rgba(255,255,255,0.4)";
          }}
        >
          ← Storefront
        </Link>
        <button
          type="button"
          style={{
            width: "100%",
            padding: "8px 12px",
            color: "rgba(255,255,255,0.4)",
            fontSize: "12px",
            textAlign: "left",
            background: "none",
            border: "none",
            cursor: "pointer",
            borderRadius: "8px",
            transition: "background 0.15s ease, color 0.15s ease"
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = sidebarNavStyles.hoverBg;
            e.currentTarget.style.color = sidebarNavStyles.hoverColor;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "none";
            e.currentTarget.style.color = "rgba(255,255,255,0.4)";
          }}
          onClick={async () => {
            await logoutSession();
            window.location.href = "/";
          }}
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
