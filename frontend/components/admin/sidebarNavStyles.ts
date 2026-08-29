import { adminTheme as t } from "@/lib/admin-theme";

/** Shared sidebar link chrome — gold active + hover (dark brand panel). */
export const sidebarNavStyles = {
  idleColor: t.sidebarText,
  idleIcon: t.sidebarMuted,
  hoverBg: "rgba(255,255,255,0.065)",
  hoverColor: "#f7f4ed",
  hoverIcon: "#d4a84b",
  activeBg: "rgba(255,255,255,0.115)",
  activeColor: "#fffbf5",
  activeIcon: "#b98a3e",
  activeBorder: "#d1a24f"
} as const;

export function sidebarLinkStyle(isActive: boolean): React.CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    width: "100%",
    boxSizing: "border-box",
    padding: "9px 11px",
    borderRadius: "8px",
    marginBottom: "2px",
    color: isActive ? sidebarNavStyles.activeColor : sidebarNavStyles.idleColor,
    background: isActive ? sidebarNavStyles.activeBg : "transparent",
    fontSize: "13px",
    fontWeight: isActive ? 600 : 400,
    textDecoration: "none",
    transform: "translateX(0)",
    transition: "background var(--admin-motion-fast, 140ms) var(--admin-motion-ease, ease-out), color var(--admin-motion-fast, 140ms) var(--admin-motion-ease, ease-out), border-color var(--admin-motion-fast, 140ms) var(--admin-motion-ease, ease-out), transform var(--admin-motion-fast, 140ms) var(--admin-motion-ease, ease-out)",
    borderLeft: isActive
      ? `3px solid ${sidebarNavStyles.activeBorder}`
      : "3px solid transparent",
    boxShadow: isActive ? "inset 0 0 0 1px rgba(255,255,255,0.045), 0 1px 2px rgba(0,0,0,0.14)" : "none"
  };
}

export function applySidebarHover(el: HTMLElement, isActive: boolean) {
  if (isActive) return;
  el.style.background = sidebarNavStyles.hoverBg;
  el.style.color = sidebarNavStyles.hoverColor;
  el.style.transform = "translateX(2px)";
  const iconEl = el.querySelector("[data-nav-icon]") as HTMLElement | null;
  if (iconEl) iconEl.style.color = sidebarNavStyles.hoverIcon;
}

export function clearSidebarHover(el: HTMLElement, isActive: boolean) {
  if (isActive) return;
  el.style.background = "transparent";
  el.style.color = sidebarNavStyles.idleColor;
  el.style.transform = "translateX(0)";
  const iconEl = el.querySelector("[data-nav-icon]") as HTMLElement | null;
  if (iconEl) iconEl.style.color = sidebarNavStyles.idleIcon;
}
