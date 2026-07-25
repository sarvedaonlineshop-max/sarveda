"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { logoutSession } from "@/lib/auth-client";
import { AdminChatsSidebarLink } from "@/components/admin/AdminChatsSidebarLink";
import { AdminOrdersSidebarLink } from "@/components/admin/AdminOrdersSidebarLink";

type NavItem = {
  href: string;
  label: string;
  icon: React.ReactNode;
  match?: "exact" | "prefix";
};

const icon = {
  dashboard: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
    </svg>
  ),
  enrollments: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  inventory: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" />
      <line x1="3" y1="12" x2="3.01" y2="12" />
      <line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  ),
  products: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
    </svg>
  ),
  courses: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
    </svg>
  ),
  events: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  ),
  customers: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  reports: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  ),
  coupons: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
      <line x1="7" y1="7" x2="7.01" y2="7" />
    </svg>
  ),
  mentors: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4" />
      <path d="M20 21a8 8 0 1 0-16 0" />
      <line x1="12" y1="16" x2="12" y2="21" />
    </svg>
  ),
  reviews: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  ),
  reconciliation: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="1" x2="12" y2="23" />
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  ),
  pickup: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  ),
  catalogGaps: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
      <line x1="11" y1="8" x2="11" y2="14" />
      <line x1="8" y1="11" x2="14" y2="11" />
    </svg>
  )
};

/** Order matches admin ops list (Complaints + Content hidden for now). */
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
  { href: "/admin/reports", label: "Reports", icon: icon.reports },
  { href: "/admin/coupons", label: "Coupons", icon: icon.coupons },
  { href: "/admin/mentors", label: "Mentors", icon: icon.mentors },
  { href: "/admin/reviews", label: "Reviews", icon: icon.reviews },
  { href: "/admin/reconciliation", label: "Reconciliation", icon: icon.reconciliation }
];

const opsNav: NavItem[] = [
  { href: "/admin/settings/pickup-locations", label: "Pickup Locations", icon: icon.pickup },
  { href: "/admin/catalog-gaps", label: "Catalog Gaps", icon: icon.catalogGaps }
];

function NavLink({
  item,
  pathname,
  onNavigate,
  contentType
}: {
  item: NavItem;
  pathname: string;
  onNavigate?: () => void;
  contentType?: string | null;
}) {
  const hrefPath = item.href.split("?")[0];
  let isActive =
    item.match === "exact"
      ? pathname === hrefPath
      : pathname === hrefPath || pathname.startsWith(`${hrefPath}/`);

  if (item.href.includes("type=events")) {
    isActive =
      (pathname === "/admin/content" && contentType === "events") ||
      pathname.startsWith("/admin/content/events");
  }

  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "12px",
        padding: "10px 12px",
        borderRadius: "8px",
        marginBottom: "2px",
        color: isActive ? "#fffbf5" : "rgba(255,255,255,0.55)",
        background: isActive ? "rgba(200,150,10,0.18)" : "transparent",
        fontSize: "13.5px",
        fontWeight: isActive ? 600 : 400,
        textDecoration: "none",
        transition: "all 0.15s ease",
        borderLeft: isActive ? "3px solid #c8960a" : "3px solid transparent"
      }}
    >
      <span style={{ color: isActive ? "#c8960a" : "rgba(255,255,255,0.4)", flexShrink: 0 }}>
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

  return (
    <>
      <NavGroup label="Main Menu">
        <NavLink item={primaryNav[0]} pathname={pathname} onNavigate={onNavigate} />
        <AdminOrdersSidebarLink onNavigate={onNavigate} />
        {primaryNav.slice(1, 3).map((item) => (
          <NavLink key={item.href} item={item} pathname={pathname} onNavigate={onNavigate} />
        ))}
        <AdminChatsSidebarLink onNavigate={onNavigate} />
        {primaryNav.slice(3).map((item) => (
          <NavLink
            key={item.href}
            item={item}
            pathname={pathname}
            onNavigate={onNavigate}
            contentType={contentType}
          />
        ))}
      </NavGroup>

      <NavGroup label="Commerce">
        {secondaryNav.map((item) => (
          <NavLink key={item.href} item={item} pathname={pathname} onNavigate={onNavigate} />
        ))}
      </NavGroup>

      <NavGroup label="Ops">
        {opsNav.map((item) => (
          <NavLink key={item.href} item={item} pathname={pathname} onNavigate={onNavigate} />
        ))}
      </NavGroup>
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
            color: "rgba(255,255,255,0.3)",
            fontSize: "9px",
            fontWeight: 700,
            letterSpacing: "0.15em",
            textTransform: "uppercase",
            padding: "8px 10px 6px"
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
      style={{ background: "#1a2e22", borderRight: "1px solid rgba(255,255,255,0.06)" }}
    >
      <div style={{ padding: "24px 20px 20px", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
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
              <p style={{ color: "#fffbf5", fontSize: "15px", fontWeight: 700, lineHeight: 1.1 }}>
                Sarveda
              </p>
              <p
                style={{
                  color: "#c8960a",
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
            marginBottom: "4px"
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
            textDecoration: "none"
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
            borderRadius: "8px"
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
