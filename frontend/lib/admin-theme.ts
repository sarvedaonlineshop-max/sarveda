/**
 * Admin UI preview theme (blue / indigo).
 * Branch: admin-ui-blue-theme-preview — revert by checking out main.
 * Skin only — do not couple to API / routing logic.
 */
export const adminTheme = {
  primary: "#6366f1",
  primaryHover: "#4f46e5",
  primarySoft: "rgba(99, 102, 241, 0.14)",
  accent: "#10b981",
  danger: "#ef4444",
  sidebarBg: "#0f0f14",
  sidebarBorder: "rgba(255,255,255,0.06)",
  sidebarText: "rgba(255,255,255,0.62)",
  sidebarTextActive: "#ffffff",
  sidebarMuted: "rgba(255,255,255,0.35)",
  workspaceBg: "#f1f5f9",
  workspaceBgDark: "#0b1220",
  headerBg: "#ffffff",
  headerBgDark: "#111827",
  cardBg: "#ffffff",
  cardBorder: "#e2e8f0",
  text: "#0f172a",
  textMuted: "#64748b",
  rowHover: "#f8fafc",
  tableHeadBg: "#f8fafc"
} as const;
