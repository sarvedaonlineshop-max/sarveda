/**
 * Admin UI theme — Sarveda forest green + gold.
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

  /* Light workspace */
  workspaceBg:    "#f1ede4",
  headerBg:       "#ffffff",
  cardBg:         "#ffffff",
  cardBorder:     "#e8e2d9",
  text:           "#2c2420",
  textMuted:      "#8a7060",
  /** Field labels — stronger contrast than muted body text */
  label:          "#4a3728",
  /** Table column headers */
  thText:         "#3d2e24",
  rowHover:       "#faf5ec",
  tableHeadBg:    "linear-gradient(180deg, #f2ede5, #f9f7f4)",

  /* Dark workspace — pleasant forest green, easy on eyes */
  workspaceBgDark:  "#0c1a10",
  headerBgDark:     "#0f2016",
  cardBgDark:       "#132a1a",
  cardBorderDark:   "rgba(185,138,62,0.18)",
  textDark:         "#e8e0d4",
  textMutedDark:    "#8aaa95",
  labelDark:        "#f0e2b8",
  thTextDark:       "#e8d9a8",
  rowHoverDark:     "rgba(185,138,62,0.07)",
  tableHeadBgDark:  "linear-gradient(180deg, #1a3525, #162d1f)",
  inputBgDark:      "rgba(255,255,255,0.05)",
  inputBorderDark:  "rgba(185,138,62,0.20)",
} as const;
