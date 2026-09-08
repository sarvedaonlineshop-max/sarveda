/**
 * Admin UI theme — Sarveda forest green + white type.
 * Light workspace is green (not cream/white) — easier on the eyes.
 * Skin only — do not couple to API / routing logic.
 */
export const adminTheme = {
  primary:         "#1c352a",
  primaryHover:    "#2d5040",
  primarySoft:     "rgba(28,53,42,0.14)",
  accent:          "#b98a3e",
  danger:          "#ef4444",

  /* Sidebar */
  sidebarBg:           "#0a160e",
  sidebarBorder:       "rgba(185,138,62,0.10)",
  sidebarText:         "rgba(220,210,190,0.65)",
  sidebarTextActive:   "#f2ede4",
  sidebarMuted:        "rgba(220,210,190,0.38)",

  /* Soft green workspace (toggle: “Light” / soft green) — green surfaces, white fonts */
  workspaceBg:    "#102418",
  headerBg:       "#143020",
  cardBg:         "#1a3a28",
  cardBorder:     "rgba(255,255,255,0.14)",
  text:           "#ffffff",
  textMuted:      "rgba(255,255,255,0.72)",
  /** Field labels — white for contrast on green */
  label:          "#ffffff",
  /** Table column headers */
  thText:         "rgba(255,255,255,0.88)",
  rowHover:       "rgba(255,255,255,0.07)",
  tableHeadBg:    "linear-gradient(180deg, #214d36, #1a3a28)",
  inputBg:        "rgba(255,255,255,0.08)",
  inputBorder:    "rgba(255,255,255,0.18)",

  /* Deep green workspace (toggle: “Dark”) */
  workspaceBgDark:  "#0c1a10",
  headerBgDark:     "#0f2016",
  cardBgDark:       "#132a1a",
  cardBorderDark:   "rgba(185,138,62,0.18)",
  textDark:         "#ffffff",
  textMutedDark:    "rgba(255,255,255,0.68)",
  labelDark:        "#ffffff",
  thTextDark:       "rgba(255,255,255,0.88)",
  rowHoverDark:     "rgba(185,138,62,0.10)",
  tableHeadBgDark:  "linear-gradient(180deg, #1a3525, #162d1f)",
  inputBgDark:      "rgba(255,255,255,0.05)",
  inputBorderDark:  "rgba(185,138,62,0.20)",
} as const;
