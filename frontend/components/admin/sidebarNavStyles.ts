import { adminTheme as t } from "@/lib/admin-theme";

/** Shared sidebar link chrome — gold active + hover (dark brand panel). */
export const sidebarNavStyles = {
  idleColor: t.sidebarText,
  idleIcon: t.sidebarMuted,
  hoverBg: "rgba(185,138,62,0.14)",
  hoverColor: "#f0e2b8",
  hoverIcon: "#d4a84b",
  activeBg: "rgba(185,138,62,0.16)",
  activeColor: "#fffbf5",
  activeIcon: "#b98a3e",
  activeBorder: "#b98a3e"
} as const;

export function sidebarLinkStyle(isActive: boolean): React.CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    width: "100%",
    boxSizing: "border-box",
    padding: "10px 12px",
    borderRadius: "10px",
    marginBottom: "2px",
    color: isActive ? sidebarNavStyles.activeColor : sidebarNavStyles.idleColor,
    background: isActive ? sidebarNavStyles.activeBg : "transparent",
    fontSize: "13.5px",
    fontWeight: isActive ? 600 : 400,
    textDecoration: "none",
    transform: "none",
    transition: "background 0.15s ease, color 0.15s ease, border-color 0.15s ease",
    borderLeft: isActive
      ? `3px solid ${sidebarNavStyles.activeBorder}`
      : "3px solid transparent"
  };
}

export function applySidebarHover(el: HTMLElement, isActive: boolean) {
  if (isActive) return;
  el.style.background = sidebarNavStyles.hoverBg;
  el.style.color = sidebarNavStyles.hoverColor;
  el.style.transform = "none";
  const iconEl = el.querySelector("[data-nav-icon]") as HTMLElement | null;
  if (iconEl) iconEl.style.color = sidebarNavStyles.hoverIcon;
}

export function clearSidebarHover(el: HTMLElement, isActive: boolean) {
  if (isActive) return;
  el.style.background = "transparent";
  el.style.color = sidebarNavStyles.idleColor;
  el.style.transform = "none";
  const iconEl = el.querySelector("[data-nav-icon]") as HTMLElement | null;
  if (iconEl) iconEl.style.color = sidebarNavStyles.idleIcon;
}
