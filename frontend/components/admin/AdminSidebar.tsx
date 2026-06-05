"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { logoutSession } from "@/lib/auth-client";

const nav = [
  {
    href: "/admin",
    label: "Dashboard",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
        <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
      </svg>
    )
  },
  {
    href: "/admin/orders",
    label: "Orders",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/>
        <path d="M16 10a4 4 0 0 1-8 0"/>
      </svg>
    )
  },
  {
    href: "/admin/customers",
    label: "Customers",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
        <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
      </svg>
    )
  },
  {
    href: "/admin/reconciliation",
    label: "Reconciliation",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
      </svg>
    )
  },
  {
    href: "/admin/products",
    label: "Products",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
      </svg>
    )
  },
  {
    href: "/admin/courses",
    label: "Courses",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
      </svg>
    )
  },
  {
    href: "/admin/mentors",
    label: "Mentors",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="8" r="4"/><path d="M20 21a8 8 0 1 0-16 0"/>
        <line x1="12" y1="16" x2="12" y2="21"/>
      </svg>
    )
  },
  {
    href: "/admin/content",
    label: "Content",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
        <polyline points="10 9 9 9 8 9"/>
      </svg>
    )
  },
  {
    href: "/admin/catalog-gaps",
    label: "Catalog gaps",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        <line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/>
      </svg>
    )
  },
  {
    href: "/admin/inventory",
    label: "Inventory",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/>
        <line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/>
        <line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
      </svg>
    )
  },
  {
    href: "/admin/settings/pickup-locations",
    label: "Warehouses",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
        <polyline points="9 22 9 12 15 12 15 22"/>
      </svg>
    )
  }
];

export function AdminSidebar({
  onNavigate,
  preferDarkMain,
  onToggleMainTheme
}: {
  onNavigate?: () => void;
  preferDarkMain: boolean;
  onToggleMainTheme: () => void;
}) {
  const pathname = usePathname();

  return (
    <div
      className="flex h-full flex-col"
      style={{ background: "#1a2e22", borderRight: "1px solid rgba(255,255,255,0.06)" }}
    >
      {/* Logo */}
      <div style={{ padding: "24px 20px 20px", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
        <Link href="/admin" onClick={onNavigate} style={{ display: "block" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div style={{
              width: "34px", height: "34px", borderRadius: "8px",
              background: "linear-gradient(135deg, #c8960a, #f5d88a)",
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0
            }}>
              <span style={{ color: "#1a2e22", fontSize: "16px", fontWeight: 800 }}>S</span>
            </div>
            <div>
              <p style={{ color: "#fffbf5", fontSize: "15px", fontWeight: 700, lineHeight: 1.1 }}>Sarveda</p>
              <p style={{ color: "#c8960a", fontSize: "10px", fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase" }}>Admin</p>
            </div>
          </div>
        </Link>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: "12px 10px", overflowY: "auto" }}>
        <p style={{ color: "rgba(255,255,255,0.3)", fontSize: "9px", fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", padding: "8px 10px 6px" }}>
          Main Menu
        </p>
        {nav.map((item) => {
          const active =
            item.href === "/admin"
              ? pathname === "/admin"
              : pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              style={{
                display: "flex", alignItems: "center", gap: "12px",
                padding: "10px 12px", borderRadius: "8px", marginBottom: "2px",
                color: active ? "#fffbf5" : "rgba(255,255,255,0.55)",
                background: active ? "rgba(200,150,10,0.18)" : "transparent",
                fontSize: "13.5px", fontWeight: active ? 600 : 400,
                textDecoration: "none",
                transition: "all 0.15s ease",
                borderLeft: active ? "3px solid #c8960a" : "3px solid transparent"
              }}
            >
              <span style={{ color: active ? "#c8960a" : "rgba(255,255,255,0.4)", flexShrink: 0 }}>
                {item.icon}
              </span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div style={{ padding: "12px 10px", borderTop: "1px solid rgba(255,255,255,0.07)" }}>
        <button
          type="button"
          onClick={onToggleMainTheme}
          style={{
            width: "100%", padding: "8px 12px", borderRadius: "8px", textAlign: "left",
            color: "rgba(255,255,255,0.4)", fontSize: "12px",
            background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
            cursor: "pointer", marginBottom: "4px"
          }}
        >
          {preferDarkMain ? "☀ Light workspace" : "☾ Dark workspace"}
        </button>
        <Link
          href="/shop"
          onClick={onNavigate}
          style={{ display: "block", padding: "8px 12px", color: "rgba(255,255,255,0.4)", fontSize: "12px", borderRadius: "8px", textDecoration: "none" }}
        >
          ← Storefront
        </Link>
        <button
          type="button"
          style={{ width: "100%", padding: "8px 12px", color: "rgba(255,255,255,0.4)", fontSize: "12px", textAlign: "left", background: "none", border: "none", cursor: "pointer", borderRadius: "8px" }}
          onClick={async () => { await logoutSession(); window.location.href = "/"; }}
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
