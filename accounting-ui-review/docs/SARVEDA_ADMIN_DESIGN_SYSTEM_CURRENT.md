# SARVEDA_ADMIN_DESIGN_SYSTEM_CURRENT.md
Current admin visual system as implemented (no recommendations).

## Fonts
- Admin shell/layout: Plus Jakarta Sans via `next/font/google` → CSS var `--font-admin-sans` (`frontend/app/admin/layout.tsx`).
- Applied on AdminShell root: `fontFamily: "var(--font-admin-sans), ui-sans-serif, system-ui, sans-serif"` (`AdminShell.tsx`).
- Global CSS also imports Plus Jakarta Sans + JetBrains Mono (`globals.css` @import); body storefront uses Plus Jakarta; `.font-mono-admin` → JetBrains Mono.
- Tailwind: `fontFamily.jakarta`, `mono` (JetBrains Mono), storefront `sans` Inter / `serif` Fraunces (`tailwind.config.ts`) — admin pages mostly use Jakarta via layout className.
- Accounting page headers: `text-2xl font-semibold` (`AdminAccountingHeader`).
- Purchases standalone header: `text-2xl font-bold text-[#faf5ec]` (`AdminPurchasesHeader`).
- Tables: typically `text-sm`; headers often `text-xs uppercase tracking-wide text-neutral-500`.
- Mono for codes/IDs: `font-mono` / `font-mono text-xs`.

## Brand / theme tokens
### CSS variables (`globals.css` :root)
- `--brand-night #10201a`, `--brand-forest #1c352a`, `--brand-sage #48705a`
- `--brand-gold #b98a3e`, `--brand-gold-mid #cfa45c`, `--brand-gold-pale #e9d6ae`
- `--brand-cream #faf5ec`, `--brand-cream-dark #efe6d6`, `--brand-ivory #fffdf7`
- `--brand-terra #b4552d`, `--brand-ink #26251f`, `--brand-muted #7d7263`

### adminTheme (`frontend/lib/admin-theme.ts`)
- primary `#1c352a`, primaryHover `#2d5040`, primarySoft rgba(28,53,42,0.14)
- accent `#b98a3e`, danger `#ef4444`
- Sidebar: bg `#0a160e`, border rgba(185,138,62,0.10), text rgba(220,210,190,0.65), active `#f2ede4`, muted rgba(220,210,190,0.38)
- Light workspace: bg `#f1ede4`, header `#ffffff`, card `#ffffff`, cardBorder `#e8e2d9`, text `#2c2420`, muted `#8a7060`, label `#4a3728`, th `#3d2e24`, rowHover `#faf5ec`, tableHead gradient `#f2ede5→#f9f7f4`
- Dark workspace: bg `#0c1a10`, header `#0f2016`, card `#132a1a`, borders gold-tinted, text `#e8e0d4`, muted `#8aaa95`, etc.

### Runtime CSS vars set by AdminShell
`--admin-card-bg`, `--admin-card-border`, `--admin-text`, `--admin-text-muted`, `--admin-label`, `--admin-th-text`, `--admin-row-hover`, `--admin-table-head`, `--admin-input-bg`, `--admin-input-border`, `--admin-workspace-bg`

### Tailwind brand palette (`tailwind.config.ts`)
- `brand.forest`, `brand.gold`, `brand.cream`, etc. matching CSS vars
- Shadows: `shadow-card`, `shadow-card-hover`, `shadow-gold`, `shadow-gold-lg`, `shadow-terra`
- Gradients: gold-gradient, forest-gradient, cream-gradient
- darkMode: `class` (shell toggles `.dark` via `preferDarkMain` / `sarveda-admin-theme` localStorage)

## Layout dimensions (`AdminShell.tsx`)
- Sidebar width: **240px** fixed; mobile off-canvas `-translate-x-full` until open; overlay rgba(0,0,0,0.5)
- Sidebar transition: transform 0.2s ease
- Content padding-left: 240px (md+); main padding `24px 32px 48px`
- Header: sticky, height **60px**, padding `0 24px`, gap 16px
- Header title: fontSize 18px, fontWeight 800
- Search input in header: fontSize 13px, paddingLeft 36px
- Theme toggle control ~38px

## Sidebar nav chrome (`sidebarNavStyles.ts` + `AdminAccountingNav.tsx`)
- Link padding 10×12, borderRadius **10px**, fontSize **13.5px**, gap 12px
- Active: bg rgba(185,138,62,0.16), color `#fffbf5`, icon `#b98a3e`, left border 3px `#b98a3e`, fontWeight 600
- Idle: sidebarText / muted icons
- Hover: bg rgba(185,138,62,0.14), color `#f0e2b8`, icon `#d4a84b`
- Transition: background/color/border-color **0.15s ease**
- Accounting nested group buttons: padding 7×10, radius 8px, fontSize 12px fontWeight 600, active section bg rgba(185,138,62,0.10), color `#f0e2b8`
- Nested leaf links: padding 6×10, fontSize 12px, borderLeft 2px when active
- Chevron rotate transition 0.15s ease
- Icons: lucide size 15–18, strokeWidth 2

## Accounting / Purchases content patterns (inline Tailwind, repeated)
- Page accent green often **`#1e3a2f`** (close to brand forest, not identical to `#1c352a` primary token)
- Primary buttons: `rounded`/`rounded-md` `bg-[#1e3a2f] text-white text-sm`; disabled:opacity-50
- Secondary: border `#1e3a2f` text same; or `border-neutral-300`
- Destructive/post-caution: `bg-amber-700 text-white` (Post journal / POST shadow)
- Success posts sometimes `bg-emerald-700`
- Gold CTA on vendors: `bg-[#b98a3e]`
- Cards: `rounded-lg border border-neutral-200 bg-white p-4 shadow-sm` (dashboard KPIs)
- Alerts: amber-50/amber-200|300|400; red-50/red-200; green/emerald-50
- Tables: white card, thead `bg-neutral-50` or `bg-stone-50`, borders `neutral-100`/`stone-100`, cell padding px-3/4 py-2/3
- Status pills (POs): rounded-full px-2 py-0.5 text-xs font-semibold with tone colors (stone/blue/amber/emerald/red)
- Inputs: `rounded border border-neutral-300 px-2|3 py-1.5|2 text-sm`
- Purchases-only rail (`AdminPurchasesNav`): width lg:w-52, sticky top-20, bg `#f7faf8`, border `#d9e2dc`, active link `bg-[#1e3a2f] text-white shadow-sm`, idle hover `#e8f0eb`, icon active `text-brand-gold`
- Purchases header gradient: `linear-gradient(135deg, #1c352a 0%, #2d5040 100%)`, borderRadius **16px**, padding 20×24
- Accounting content max width **1600px**; gate pages max-w-3xl

## Focus / hover
- Global focus outline in globals: `outline: 2px solid var(--brand-forest)` (storefront-oriented)
- Accounting KPI buttons on reports: `hover:border-[#1e3a2f]`
- Sidebar hover via JS style mutation (not Tailwind)
- Table rows purchases: `hover:bg-stone-50`
- Links: underline + `#1e3a2f`

## Breakpoints (usage observed)
- AdminShell sidebar: `md:` (768px Tailwind default) for persistent sidebar
- Accounting grids: `sm:grid-cols-2`, `lg:grid-cols-4`, `lg:grid-cols-2|3`
- Purchases nav: `lg:flex-row`, `lg:sticky`, `lg:w-52`
- GST page padding `p-4 md:p-6`
- No custom screens in `tailwind.config.ts` (defaults)

## Shadows
- Shell header light: `0 1px 0 rgba(28,53,42,0.08), 0 2px 8px rgba(28,53,42,0.04)`
- Shell header dark: gold-tinted + black 0.35
- KPI cards: Tailwind `shadow-sm`
- Catalog dropdown: `shadow-lg`
- Tailwind theme also defines card/gold shadows (available, sparsely used on accounting pages)

## Radius
- Cards/sections: typically `rounded-lg` (8px)
- Buttons/inputs: `rounded` / `rounded-md`
- Sidebar links: 10px / nested 8px
- Purchases header: 16px
- Status pills: `rounded-full`

## Spacing rhythm
- Page stacks: `space-y-4` / `space-y-6`
- Accounting layout outer: `space-y-4 p-1` then children `space-y-5`
- Main shell content padding 24×32×48

## Theme persistence
- Key `sarveda-admin-theme` in localStorage (`AdminShell.tsx`); toggles light/dark workspace while sidebar stays dark brand panel.
