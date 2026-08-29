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
  workspaceBg:    "#f4f5f3",
  headerBg:       "#ffffff",
  cardBg:         "#ffffff",
  cardBorder:     "#d7dad6",
  text:           "#171a17",
  textMuted:      "#62665f",
  /** Field labels — stronger contrast than muted body text */
  label:          "#343833",
  /** Table column headers */
  thText:         "#4d514b",
  rowHover:       "#f0f2ef",
  tableHeadBg:    "#f8f9f7",

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
