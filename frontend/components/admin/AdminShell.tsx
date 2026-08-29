"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { AdminNotificationsBell } from "@/components/admin/AdminNotificationsBell";
import { AdminProfileMenu } from "@/components/admin/AdminProfileMenu";
import { AdminNavProvider, useAdminNav } from "@/components/admin/AdminNavContext";
import { AdminLoadingOverlay } from "@/components/admin/AdminLoadingOverlay";
import { adminOverlayTransition } from "@/lib/admin-motion";
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
  "/admin/old-orders": "Old Orders",
  "/admin/old-marketplaces": "Old Marketplaces",
  "/admin/reconciliation": "Reconciliation",
  "/admin/reports": "Store Reports",
  "/admin/activity": "Admin activity",
  "/admin/reviews": "Reviews",
  "/admin/coupons": "Coupons",
  "/admin/products": "Products",
  "/admin/products/xl": "Products XL View",
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
  // Prefer longer prefixes so /admin/products/xl wins over /admin/products
  const keys = Object.keys(PAGE_TITLES).sort((a, b) => b.length - a.length);
  for (const key of keys) {
    if (pathname.startsWith(key + "/")) return PAGE_TITLES[key];
  }
  return "Admin";
}

function AdminShellInner({
  children,
  preferDarkMain,
  toggleMainTheme,
  sidebarOpen,
  setSidebarOpen
}: {
  children: React.ReactNode;
  preferDarkMain: boolean;
  toggleMainTheme: () => void;
  sidebarOpen: boolean;
  setSidebarOpen: React.Dispatch<React.SetStateAction<boolean>>;
}) {
  const pathname = usePathname();
  const pageTitle = getPageTitle(pathname);
  const { isNavigating } = useAdminNav();
  const reduceMotion = useReducedMotion();

  const bg = preferDarkMain ? t.workspaceBgDark : t.workspaceBg;
  const isDark = preferDarkMain;
  const cardBg = isDark ? t.cardBgDark : t.cardBg;
  const cardBorder = isDark ? t.cardBorderDark : t.cardBorder;
  const textColor = isDark ? t.textDark : t.text;
  const mutedColor = isDark ? t.textMutedDark : t.textMuted;
  const labelColor = isDark ? t.labelDark : t.label;
  const thTextColor = isDark ? t.thTextDark : t.thText;
  const inputBg = isDark ? t.inputBgDark : "#f8fafc";
  const inputBorder = isDark ? t.inputBorderDark : t.cardBorder;
  const rowHover = isDark ? t.rowHoverDark : t.rowHover;
  const tableHeadBg = isDark ? t.tableHeadBgDark : t.tableHeadBg;
  const headerBg = isDark ? t.headerBgDark : t.headerBg;
  const headerBorder = isDark ? "rgba(185,138,62,0.12)" : t.cardBorder;
  const titleColor = textColor;

  return (
    <div
      className={`admin-motion-root ${preferDarkMain ? "dark" : ""}`}
      style={{
        "--admin-card-bg": cardBg,
        "--admin-card-border": cardBorder,
        "--admin-text": textColor,
        "--admin-text-muted": mutedColor,
        "--admin-label": labelColor,
        "--admin-th-text": thTextColor,
        "--admin-row-hover": rowHover,
        "--admin-table-head": tableHeadBg,
        "--admin-input-bg": inputBg,
        "--admin-input-border": inputBorder,
        "--admin-workspace-bg": preferDarkMain ? t.workspaceBgDark : t.workspaceBg,
      } as React.CSSProperties}
    >
      <div
        style={{
          minHeight: "100vh",
          background: bg,
          color: titleColor,
          fontFamily: "var(--font-admin-sans), ui-sans-serif, system-ui, sans-serif"
        }}
      >
        <AnimatePresence>
          {sidebarOpen ? (
            <motion.button
              key="admin-sidebar-backdrop"
              type="button"
              data-no-press
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
              initial={reduceMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={reduceMotion ? undefined : { opacity: 0 }}
              transition={reduceMotion ? { duration: 0 } : adminOverlayTransition}
            />
          ) : null}
        </AnimatePresence>

        <aside
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            bottom: 0,
            zIndex: 50,
            width: "240px",
            transform: sidebarOpen ? "translateX(0)" : undefined,
            transition: reduceMotion
              ? "none"
              : "transform var(--admin-motion-normal, 180ms) var(--admin-motion-ease, cubic-bezier(0.22, 1, 0.36, 1))"
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
              height: "60px",
              display: "flex",
              alignItems: "center",
              padding: "0 24px",
              gap: "16px",
              boxShadow: isDark
                ? "0 1px 0 rgba(185,138,62,0.10), 0 2px 16px rgba(0,0,0,0.35)"
                : "0 1px 0 rgba(28,53,42,0.08), 0 2px 8px rgba(28,53,42,0.04)"
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
              onMouseEnter={(e) => {
                e.currentTarget.style.background = isDark
                  ? "rgba(185,138,62,0.14)"
                  : "rgba(28,53,42,0.08)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>

            <div style={{ display: "flex", alignItems: "center", gap: "10px", flex: "0 0 auto" }}>
              <div
                style={{
                  width: "3px",
                  height: "20px",
                  borderRadius: "2px",
                  background: "#b98a3e",
                  flexShrink: 0,
                  boxShadow: isDark ? "0 0 10px rgba(185,138,62,0.5)" : "none"
                }}
                aria-hidden
              />
              <h1 style={{ fontSize: "18px", fontWeight: 800, color: titleColor, margin: 0 }}>
                {pageTitle}
              </h1>
            </div>

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
                  e.currentTarget.style.borderColor = "#b98a3e";
                  e.currentTarget.style.boxShadow = "0 0 0 3px rgba(185,138,62,0.12)";
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
                e.currentTarget.style.color = "#b98a3e";
                e.currentTarget.style.background = isDark
                  ? "rgba(185,138,62,0.14)"
                  : "rgba(185,138,62,0.12)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = mutedColor;
                e.currentTarget.style.background = inputBg;
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

          <main style={{ flex: 1, padding: "24px 32px 48px", position: "relative" }}>
            <AdminLoadingOverlay show={isNavigating} label="Loading page…" />
            <div
              style={{
                width: "100%",
                maxWidth: "none",
                opacity: isNavigating ? 0.45 : 1,
                transition: "opacity 0.15s ease"
              }}
            >
              {children}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [preferDarkMain, setPreferDarkMain] = useState(false);

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

  return (
    <AdminNavProvider>
      <AdminShellInner
        preferDarkMain={preferDarkMain}
        toggleMainTheme={toggleMainTheme}
        sidebarOpen={sidebarOpen}
        setSidebarOpen={setSidebarOpen}
      >
        {children}
      </AdminShellInner>
    </AdminNavProvider>
  );
}
