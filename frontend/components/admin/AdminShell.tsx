"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { AdminNavProvider, useAdminNav } from "@/components/admin/AdminNavContext";
import {
  AdminHeaderSlotProvider,
  useAdminHeaderSlot
} from "@/components/admin/AdminHeaderSlotContext";
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
  "/admin/returns": "Returns",
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
  const { isNavigating, beginNavigation } = useAdminNav();
  const headerSlot = useAdminHeaderSlot()?.slot ?? null;
  const reduceMotion = useReducedMotion();
  const [searchFocused, setSearchFocused] = useState(false);
  const suggestions = headerSlot?.searchSuggestions ?? [];
  const showSuggestions =
    searchFocused &&
    Boolean(headerSlot?.onSearchChange) &&
    (headerSlot?.searchValue ?? "").trim().length > 0 &&
    suggestions.length > 0;
  const wideSearch = Boolean(headerSlot?.wideSearch);

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
      className={`admin-motion-root admin-product-ui ${preferDarkMain ? "dark" : ""}`}
      onClickCapture={(event) => {
        // Observe all normal internal admin links, not only sidebar links, so
        // route feedback is consistent across tables, cards and breadcrumbs.
        if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
          return;
        }
        const target = event.target as HTMLElement | null;
        const anchor = target?.closest?.("a[href]") as HTMLAnchorElement | null;
        if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
        const url = new URL(anchor.href, window.location.href);
        if (url.origin !== window.location.origin || !url.pathname.startsWith("/admin")) return;
        beginNavigation(`${url.pathname}${url.search}`);
      }}
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
          fontFamily: "var(--admin-font-sans), ui-sans-serif, system-ui, sans-serif",
          letterSpacing: "-0.01em"
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
              background: isDark ? headerBg : "rgba(255,255,255,0.92)",
              backdropFilter: "saturate(180%) blur(14px)",
              WebkitBackdropFilter: "saturate(180%) blur(14px)",
              borderBottom: `1px solid ${headerBorder}`,
              minHeight: "72px",
              height: "auto",
              display: "flex",
              alignItems: "center",
              flexWrap: "wrap",
              padding: "12px 24px",
              gap: "12px 14px",
              boxShadow: isDark
                ? "0 1px 0 rgba(185,138,62,0.10), 0 10px 24px rgba(0,0,0,0.20)"
                : "0 1px 0 rgba(23,26,23,0.06), 0 8px 24px rgba(23,26,23,0.04)"
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
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>

            <div style={{ display: "flex", alignItems: "center", gap: "12px", flex: "0 0 auto" }}>
              <div
                style={{
                  width: "3px",
                  height: "26px",
                  borderRadius: "2px",
                  background: "#b98a3e",
                  flexShrink: 0,
                  boxShadow: isDark ? "0 0 10px rgba(185,138,62,0.5)" : "none"
                }}
                aria-hidden
              />
              <h1
                style={{
                  fontSize: "20px",
                  fontWeight: 700,
                  color: titleColor,
                  margin: 0,
                  lineHeight: 1.2,
                  letterSpacing: "-0.02em"
                }}
              >
                {pageTitle}
              </h1>
            </div>

            <div
              style={{
                flex: "1 1 auto",
                marginLeft: "12px",
                position: "relative",
                display: "flex",
                alignItems: "center",
                gap: "10px",
                minWidth: 0
              }}
            >
              <div
                style={{
                  position: "relative",
                  flex: wideSearch ? "0 0 50%" : "1 1 240px",
                  width: wideSearch ? "50%" : undefined,
                  minWidth: wideSearch ? "280px" : 0,
                  maxWidth: wideSearch ? "50%" : "360px"
                }}
              >
                <svg
                  width="17"
                  height="17"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  style={{
                    position: "absolute",
                    left: "14px",
                    top: "50%",
                    transform: "translateY(-50%)",
                    color: mutedColor,
                    pointerEvents: "none"
                  }}
                >
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input
                  type="search"
                  placeholder={headerSlot?.searchPlaceholder ?? "Search orders, products…"}
                  value={headerSlot?.searchValue ?? undefined}
                  onChange={
                    headerSlot?.onSearchChange
                      ? (e) => headerSlot.onSearchChange?.(e.target.value)
                      : undefined
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      headerSlot?.onSearchSubmit?.(headerSlot.searchValue ?? "");
                      setSearchFocused(false);
                      (e.target as HTMLInputElement).blur();
                    } else if (e.key === "Escape") {
                      setSearchFocused(false);
                      (e.target as HTMLInputElement).blur();
                    }
                  }}
                  readOnly={!headerSlot?.onSearchChange}
                  autoComplete="off"
                  style={{
                    width: "100%",
                    paddingLeft: "42px",
                    paddingRight: "14px",
                    height: "46px",
                    borderRadius: "10px",
                    background: isDark ? inputBg : "#fbfcfb",
                    border: `1px solid ${inputBorder}`,
                    boxShadow: isDark
                      ? "inset 0 1px 0 rgba(255,255,255,0.02)"
                      : "inset 0 1px 0 rgba(23,26,23,0.02), 0 1px 1px rgba(23,26,23,0.02)",
                    fontSize: "15px",
                    color: titleColor,
                    outline: "none",
                    transition: "border-color 0.15s ease, box-shadow 0.15s ease"
                  }}
                  onFocus={(e) => {
                    setSearchFocused(true);
                    e.currentTarget.style.borderColor = "#1c352a";
                    e.currentTarget.style.boxShadow = "0 0 0 3px rgba(28,53,42,0.12)";
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = inputBorder;
                    e.currentTarget.style.boxShadow = "none";
                    // Delay so suggestion click can register.
                    window.setTimeout(() => setSearchFocused(false), 160);
                  }}
                />
                {showSuggestions ? (
                  <div
                    role="listbox"
                    style={{
                      position: "absolute",
                      top: "calc(100% + 6px)",
                      left: 0,
                      right: 0,
                      zIndex: 60,
                      maxHeight: "320px",
                      overflowY: "auto",
                      borderRadius: "12px",
                      border: `1px solid ${inputBorder}`,
                      background: isDark ? cardBg : "#fff",
                      boxShadow: isDark
                        ? "0 16px 40px rgba(0,0,0,0.45)"
                        : "0 16px 40px rgba(23,26,23,0.14)"
                    }}
                  >
                    {suggestions.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        role="option"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          headerSlot?.onSelectSuggestion?.(s);
                          setSearchFocused(false);
                        }}
                        style={{
                          display: "block",
                          width: "100%",
                          textAlign: "left",
                          padding: "12px 14px",
                          border: "none",
                          borderBottom: `1px solid ${isDark ? "rgba(255,255,255,0.06)" : "rgba(23,26,23,0.06)"}`,
                          background: "transparent",
                          cursor: "pointer",
                          color: titleColor
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = isDark
                            ? "rgba(28,53,42,0.35)"
                            : "rgba(28,53,42,0.06)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = "transparent";
                        }}
                      >
                        <div style={{ fontSize: "14px", fontWeight: 600 }}>{s.label}</div>
                        {s.sublabel ? (
                          <div style={{ fontSize: "12px", color: mutedColor, marginTop: "2px" }}>
                            {s.sublabel}
                          </div>
                        ) : null}
                      </button>
                    ))}
                    <div
                      style={{
                        padding: "8px 14px",
                        fontSize: "11px",
                        color: mutedColor,
                        background: isDark ? "rgba(255,255,255,0.03)" : "#f8faf8"
                      }}
                    >
                      Press Enter to show all matches (collapsed)
                    </div>
                  </div>
                ) : null}
              </div>
              {headerSlot?.afterSearch ? (
                <div style={{ flex: "0 1 auto", minWidth: 0 }}>{headerSlot.afterSearch}</div>
              ) : null}
              {headerSlot?.actions ? (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    flex: "0 0 auto",
                    flexWrap: "wrap"
                  }}
                >
                  {headerSlot.actions}
                </div>
              ) : null}
            </div>
          </header>

          <main className="admin-workspace" style={{ flex: 1, padding: "24px 30px 48px", position: "relative" }}>
            <AdminLoadingOverlay show={isNavigating} label="Loading page…" />
            <div
              key={pathname}
              className="admin-content-enter"
              style={{
                width: "100%",
                maxWidth: "none"
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
      <AdminHeaderSlotProvider>
        <AdminShellInner
          preferDarkMain={preferDarkMain}
          toggleMainTheme={toggleMainTheme}
          sidebarOpen={sidebarOpen}
          setSidebarOpen={setSidebarOpen}
        >
          {children}
        </AdminShellInner>
      </AdminHeaderSlotProvider>
    </AdminNavProvider>
  );
}
