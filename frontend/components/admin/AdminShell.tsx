"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { AdminNotificationsBell } from "@/components/admin/AdminNotificationsBell";
import { AdminProfileMenu } from "@/components/admin/AdminProfileMenu";
import { adminTheme as t } from "@/lib/admin-theme";

const THEME_KEY = "sarveda-admin-theme";

function readStoredTheme(): boolean {
  if (typeof window === "undefined") return false;
  const s = window.localStorage.getItem(THEME_KEY);
  if (s === "dark") return true;
  if (s === "light") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

const PAGE_TITLES: Record<string, string> = {
  "/admin": "Dashboard",
  "/admin/orders": "Orders",
  "/admin/chats": "Chats",
  "/admin/customers": "Customers",
  "/admin/marketplaces": "Marketplaces",
  "/admin/reconciliation": "Reconciliation",
  "/admin/reports": "Reports",
  "/admin/activity": "Admin activity",
  "/admin/reviews": "Reviews",
  "/admin/coupons": "Coupons",
  "/admin/products": "Products",
  "/admin/courses": "Courses",
  "/admin/enrollments": "Enrollments",
  "/admin/mentors": "Mentors",
  "/admin/content": "Content",
  "/admin/catalog-gaps": "Catalog Gaps",
  "/admin/inventory": "Inventory",
  "/admin/settings/pickup-locations": "Pickup Locations"
};

function getPageTitle(pathname: string): string {
  if (PAGE_TITLES[pathname]) return PAGE_TITLES[pathname];
  for (const key of Object.keys(PAGE_TITLES)) {
    if (pathname.startsWith(key + "/")) return PAGE_TITLES[key];
  }
  return "Admin";
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [preferDarkMain, setPreferDarkMain] = useState(false);
  const pathname = usePathname();
  const pageTitle = getPageTitle(pathname);

  useEffect(() => {
    setPreferDarkMain(readStoredTheme());
  }, []);

  function toggleMainTheme() {
    setPreferDarkMain((prev) => {
      const next = !prev;
      if (typeof window !== "undefined") window.localStorage.setItem(THEME_KEY, next ? "dark" : "light");
      return next;
    });
  }

  const bg = preferDarkMain ? t.workspaceBgDark : t.workspaceBg;
  const headerBg = preferDarkMain ? t.headerBgDark : t.headerBg;
  const headerBorder = preferDarkMain ? "rgba(255,255,255,0.08)" : t.cardBorder;
  const titleColor = preferDarkMain ? "#f8fafc" : t.text;
  const mutedColor = preferDarkMain ? "rgba(255,255,255,0.45)" : t.textMuted;
  const inputBg = preferDarkMain ? "rgba(255,255,255,0.06)" : "#f8fafc";
  const inputBorder = preferDarkMain ? "rgba(255,255,255,0.1)" : t.cardBorder;

  return (
    <div className={preferDarkMain ? "dark" : ""}>
      <div
        style={{
          minHeight: "100vh",
          background: bg,
          color: titleColor,
          fontFamily: "var(--font-admin-sans), ui-sans-serif, system-ui, sans-serif"
        }}
      >
        {sidebarOpen && (
          <button
            type="button"
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 40,
              background: "rgba(0,0,0,0.5)",
              border: "none",
              cursor: "pointer"
            }}
            aria-label="Close menu"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        <aside
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            bottom: 0,
            zIndex: 50,
            width: "240px",
            transform: sidebarOpen ? "translateX(0)" : undefined,
            transition: "transform 0.2s ease"
          }}
          className={`${sidebarOpen ? "" : "-translate-x-full md:translate-x-0"}`}
        >
          <AdminSidebar
            onNavigate={() => setSidebarOpen(false)}
            preferDarkMain={preferDarkMain}
            onToggleMainTheme={toggleMainTheme}
          />
        </aside>

        <div style={{ paddingLeft: "240px" }} className="md:pl-[240px] pl-0 flex flex-col min-h-screen">
          <header
            style={{
              position: "sticky",
              top: 0,
              zIndex: 30,
              background: headerBg,
              borderBottom: `1px solid ${headerBorder}`,
              height: "64px",
              display: "flex",
              alignItems: "center",
              padding: "0 24px",
              gap: "16px",
              boxShadow: "0 1px 2px rgba(15,23,42,0.04)"
            }}
          >
            <button
              type="button"
              onClick={() => setSidebarOpen((o) => !o)}
              style={{
                display: "none",
                padding: "8px",
                borderRadius: "8px",
                background: "transparent",
                border: "none",
                cursor: "pointer",
                color: mutedColor
              }}
              className="md:hidden block"
              aria-label="Open navigation"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>

            <h1 style={{ fontSize: "17px", fontWeight: 700, color: titleColor, flex: "0 0 auto" }}>
              {pageTitle}
            </h1>

            <div
              style={{
                flex: 1,
                maxWidth: "380px",
                marginLeft: "16px",
                position: "relative",
                display: "flex",
                alignItems: "center"
              }}
            >
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                style={{ position: "absolute", left: "12px", color: mutedColor }}
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="search"
                placeholder="Search orders, products…"
                style={{
                  width: "100%",
                  paddingLeft: "36px",
                  paddingRight: "12px",
                  height: "38px",
                  borderRadius: "10px",
                  background: inputBg,
                  border: `1px solid ${inputBorder}`,
                  fontSize: "13px",
                  color: titleColor,
                  outline: "none",
                  transition: "border-color 0.15s ease, box-shadow 0.15s ease"
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = t.primary;
                  e.currentTarget.style.boxShadow = `0 0 0 3px ${t.primarySoft}`;
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = inputBorder;
                  e.currentTarget.style.boxShadow = "none";
                }}
              />
            </div>

            <div style={{ flex: 1 }} />

            <AdminNotificationsBell inputBg={inputBg} inputBorder={inputBorder} mutedColor={mutedColor} />

            <button
              type="button"
              onClick={toggleMainTheme}
              style={{
                width: "38px",
                height: "38px",
                borderRadius: "10px",
                background: inputBg,
                border: `1px solid ${inputBorder}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                color: mutedColor,
                transition: "background 0.15s ease, color 0.15s ease"
              }}
              title={preferDarkMain ? "Light mode" : "Dark mode"}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = t.primary;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = mutedColor;
              }}
            >
              {preferDarkMain ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="5" />
                  <line x1="12" y1="1" x2="12" y2="3" />
                  <line x1="12" y1="21" x2="12" y2="23" />
                  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                  <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                  <line x1="1" y1="12" x2="3" y2="12" />
                  <line x1="21" y1="12" x2="23" y2="12" />
                  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                  <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                </svg>
              )}
            </button>

            <AdminProfileMenu
              inputBg={inputBg}
              inputBorder={inputBorder}
              mutedColor={mutedColor}
              titleColor={titleColor}
            />
          </header>

          <main style={{ flex: 1, padding: "28px 28px 40px" }}>{children}</main>
        </div>
      </div>
    </div>
  );
}
