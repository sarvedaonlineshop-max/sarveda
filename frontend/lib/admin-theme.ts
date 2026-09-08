/**
 * Admin UI theme — Sarveda forest green + gold.
 * Light workspace stays unchanged; dark workspace is tuned for dense admin data.
 * Skin only — do not couple to API / routing logic.
 * Storefront is unaffected.
 */
export const adminTheme = {
  primary:         "#1c352a",
  primaryHover:    "#2d5040",
  primarySoft:     "rgba(28,53,42,0.14)",
  accent:          "#b98a3e",
  danger:          "#ef4444",

  /* Sidebar (always deep green) */
  sidebarBg:           "#0a160e",
  sidebarBorder:       "rgba(185,138,62,0.10)",
  sidebarText:         "rgba(220,210,190,0.65)",
  sidebarTextActive:   "#f2ede4",
  sidebarMuted:        "rgba(220,210,190,0.38)",

  /* Soft / light-green workspace — existing approved light mode */
  workspaceBg:    "#e7f1eb",
  headerBg:       "#f3f8f5",
  cardBg:         "#f7fbf8",
  cardBorder:     "#c5d9cc",
  text:           "#143026",
  textMuted:      "#4a6b58",
  /** Field labels */
  label:          "#1c352a",
  /** Table column headers */
  thText:         "#2d5040",
  rowHover:       "#dceae2",
  tableHeadBg:    "linear-gradient(180deg, #dff0e6, #eaf5ef)",
  inputBg:        "#ffffff",
  inputBorder:    "#b7cec0",

  /* Admin dark workspace — neutral forest, high contrast, data-friendly */
  workspaceBgDark:  "#07120d",
  headerBgDark:     "#0b1711",
  cardBgDark:       "#111f18",
  cardBorderDark:   "rgba(185,138,62,0.22)",
  textDark:         "#f4efe6",
  textMutedDark:    "#a9b9ad",
  labelDark:        "#f0d89b",
  thTextDark:       "#e7c779",
  rowHoverDark:     "rgba(185,138,62,0.09)",
  tableHeadBgDark:  "linear-gradient(180deg, #16251d, #101d16)",
  inputBgDark:      "#0c1711",
  inputBorderDark:  "rgba(185,138,62,0.32)",
} as const;
