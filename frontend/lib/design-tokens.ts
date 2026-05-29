/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  SARVEDA — Violet Lotus × Midnight Blend Design Tokens       ║
 * ║  Drop this file into: frontend/lib/design-tokens.ts          ║
 * ║  Reference it in tailwind.config.ts and globals.css          ║
 * ╚══════════════════════════════════════════════════════════════╝
 */

export const colors = {
  // ── Core violet scale ──────────────────────────────────────────
  violetDeep:   "#22134A",   // hero bg, header, footer
  violet:       "#5B3E9B",   // primary CTA, active states
  violetMid:    "#7B5EC0",   // hover variant
  violetLight:  "#EDE8FB",   // chip bg, card surface tint
  violetPale:   "#F7F4FF",   // page background

  // ── Accent ─────────────────────────────────────────────────────
  lavender:     "#C4B0E8",   // nav links, muted accents on dark
  lavenderMid:  "#9B82CC",   // secondary icons, inactive states

  // ── Text ───────────────────────────────────────────────────────
  ink:          "#1A0F35",   // primary body text
  mid:          "#5A4880",   // secondary text
  muted:        "#9888B8",   // captions, placeholders

  // ── Announcement & Premium accents ─────────────────────────────
  gold:         "#C8A460",   // announcement bar text, price highlights
  goldBright:   "#E8C870",   // promo code highlight
  goldGlow:     "rgba(200,164,96,0.10)",

  // ── Semantic ───────────────────────────────────────────────────
  sage:         "#5A8C6B",   // events, nature badges
  sageLight:    "#E5F0EA",
  coral:        "#C45A4A",   // sale badges, errors
  coralLight:   "#FCF0EE",
  green:        "#2E7D52",   // in-stock, success
  greenLight:   "#E5F5ED",

  // ── Surfaces ───────────────────────────────────────────────────
  ivory:        "#FDFCFF",   // card background
  bg:           "#F7F4FF",   // page background
} as const;

export const fonts = {
  display: "var(--font-cormorant)",   // Cormorant Garamond — headings, serif
  body:    "var(--font-nunito)",      // Nunito — body copy, UI
  price:   "'Space Grotesk', ui-sans-serif, system-ui, sans-serif", // prices, numbers
} as const;

export const borders = {
  default:  "rgba(196,176,232,0.22)",
  medium:   "rgba(196,176,232,0.35)",
  strong:   "rgba(91,62,155,0.45)",
} as const;

export const shadows = {
  card:      "0 2px 12px rgba(91,62,155,0.08), 0 1px 3px rgba(91,62,155,0.05)",
  cardHover: "0 12px 36px rgba(91,62,155,0.16), 0 2px 8px rgba(91,62,155,0.08)",
  header:    "0 8px 32px rgba(10,4,30,0.55), 0 1px 0 rgba(196,176,232,0.08)",
  gold:      "0 4px 20px rgba(200,164,96,0.25)",
  violet:    "0 4px 18px rgba(91,62,155,0.30)",
  violetLg:  "0 8px 28px rgba(91,62,155,0.38)",
} as const;

export const radii = {
  sm:     "3px",    // sharp — buttons, badges
  md:     "8px",    // chips, filter pills
  lg:     "12px",   // cards, inputs
  xl:     "16px",   // product cards
  xxl:    "20px",   // banners, section cards
  full:   "9999px", // pills
} as const;

export const header = {
  bg:           "rgba(26,8,64,0.92)",
  backdropBlur: "blur(24px)",
  borderBottom: `2px solid ${borders.strong}`,
  boxShadow:    shadows.header,
} as const;

export const announcement = {
  bg:         "#0F0620",
  borderBottom:"1px solid rgba(91,62,155,0.3)",
  textColor:  colors.gold,
  fontSize:   "11px",
  letterSpacing: "0.6px",
} as const;

export const bottomNav = {
  bg:          "rgba(22,8,58,0.96)",
  backdropBlur:"blur(24px)",
  borderTop:   `2px solid rgba(91,62,155,0.4)`,
  activeColor: colors.lavender,
  inactiveColor: colors.violetMid,
  indicatorColor: colors.violet,
} as const;

// ── Tailwind-ready color object (paste into tailwind.config.ts) ──────────────
export const tailwindColors = {
  brand: {
    "violet-deep":  colors.violetDeep,
    "violet":       colors.violet,
    "violet-mid":   colors.violetMid,
    "violet-light": colors.violetLight,
    "violet-pale":  colors.violetPale,
    "lavender":     colors.lavender,
    "lavender-mid": colors.lavenderMid,
    "ink":          colors.ink,
    "mid":          colors.mid,
    "muted":        colors.muted,
    "gold":         colors.gold,
    "sage":         colors.sage,
    "sage-light":   colors.sageLight,
    "coral":        colors.coral,
    "coral-light":  colors.coralLight,
    "green":        colors.green,
    "green-light":  colors.greenLight,
    "ivory":        colors.ivory,
    "bg":           colors.bg,
  }
} as const;
